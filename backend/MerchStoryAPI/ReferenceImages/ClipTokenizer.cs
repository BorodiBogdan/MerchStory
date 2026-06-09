using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace MerchStoryAPI.ReferenceImages;

/// <summary>
/// Byte-level BPE tokenizer matching OpenAI CLIP (ViT-B/32). Ported from the
/// reference simple_tokenizer.py so that text queries are tokenized identically
/// to training, letting them embed into the same space as the image embeddings.
/// </summary>
public sealed class ClipTokenizer
{
    /// <summary>Fixed CLIP context length; output is padded/truncated to this many tokens.</summary>
    public const int ContextLength = 77;

    /// <summary>Token id for the <c>&lt;|startoftext|&gt;</c> marker.</summary>
    public const int StartOfTextId = 49406;

    /// <summary>Token id for the <c>&lt;|endoftext|&gt;</c> marker.</summary>
    public const int EndOfTextId = 49407;

    private static readonly Regex TokenPattern = new(
        @"<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|\p{L}+|\p{N}|[^\s\p{L}\p{N}]+",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex WhitespacePattern = new(@"\s+", RegexOptions.Compiled);

    private readonly Dictionary<string, int> encoder;
    private readonly Dictionary<(string First, string Second), int> bpeRanks;
    private readonly Dictionary<int, char> byteEncoder;
    private readonly Dictionary<string, string> cache = new();

    public ClipTokenizer(string vocabPath, string mergesPath)
    {
        using FileStream vocabStream = File.OpenRead(vocabPath);
        this.encoder = JsonSerializer.Deserialize<Dictionary<string, int>>(vocabStream)
            ?? throw new InvalidOperationException($"Failed to parse CLIP vocab at '{vocabPath}'.");

        // merges.txt: each "a b" line defines a merge; its line order is its rank.
        // The first line is a version header (e.g. "#version: 0.2") and is skipped.
        this.bpeRanks = new Dictionary<(string, string), int>();
        int rank = 0;
        foreach (string line in File.ReadLines(mergesPath))
        {
            if (line.Length == 0 || line[0] == '#')
            {
                continue;
            }

            int space = line.IndexOf(' ', StringComparison.Ordinal);
            if (space <= 0)
            {
                continue;
            }

            this.bpeRanks[(line[..space], line[(space + 1)..])] = rank++;
        }

        this.byteEncoder = BytesToUnicode();
    }

    /// <summary>
    /// Tokenizes <paramref name="text"/> into CLIP token ids, wrapped with the
    /// start/end markers and truncated to <see cref="ContextLength"/>.
    /// </summary>
    /// <param name="text">The text to tokenize.</param>
    /// <returns>The CLIP token ids, including the start/end markers.</returns>
    public IReadOnlyList<int> Encode(string text)
    {
        var tokens = new List<int> { StartOfTextId };
        string cleaned = WhitespaceClean(text).ToLowerInvariant();

        foreach (Match match in TokenPattern.Matches(cleaned))
        {
            byte[] bytes = Encoding.UTF8.GetBytes(match.Value);
            var encoded = new StringBuilder(bytes.Length);
            foreach (byte b in bytes)
            {
                encoded.Append(this.byteEncoder[b]);
            }

            foreach (string piece in this.Bpe(encoded.ToString()).Split(' '))
            {
                if (this.encoder.TryGetValue(piece, out int id))
                {
                    tokens.Add(id);
                }
            }
        }

        tokens.Add(EndOfTextId);

        if (tokens.Count > ContextLength)
        {
            tokens = tokens.GetRange(0, ContextLength);
            tokens[ContextLength - 1] = EndOfTextId;
        }

        return tokens;
    }

    private static string WhitespaceClean(string text)
    {
        // CLIP applies html.unescape twice, then collapses whitespace and trims.
        string decoded = WebUtility.HtmlDecode(WebUtility.HtmlDecode(text));
        return WhitespacePattern.Replace(decoded, " ").Trim();
    }

    /// <summary>
    /// Builds the GPT-2/CLIP byte-to-unicode map: printable bytes map to their own
    /// code point, the rest to a private offset starting at 256.
    /// </summary>
    private static Dictionary<int, char> BytesToUnicode()
    {
        var bs = new List<int>();
        for (int b = 33; b <= 126; b++)
        {
            bs.Add(b);
        }

        for (int b = 161; b <= 172; b++)
        {
            bs.Add(b);
        }

        for (int b = 174; b <= 255; b++)
        {
            bs.Add(b);
        }

        var cs = new List<int>(bs);
        int n = 0;
        for (int b = 0; b < 256; b++)
        {
            if (!bs.Contains(b))
            {
                bs.Add(b);
                cs.Add(256 + n);
                n++;
            }
        }

        var map = new Dictionary<int, char>(bs.Count);
        for (int i = 0; i < bs.Count; i++)
        {
            map[bs[i]] = (char)cs[i];
        }

        return map;
    }

    private string Bpe(string token)
    {
        if (this.cache.TryGetValue(token, out string? cached))
        {
            return cached;
        }

        // Each symbol starts as a single char; the last char carries the "</w>" marker.
        var word = new List<string>(token.Length);
        foreach (char c in token)
        {
            word.Add(c.ToString());
        }

        if (word.Count == 0)
        {
            return token + "</w>";
        }

        word[^1] += "</w>";

        while (word.Count > 1)
        {
            // Pick the adjacent pair with the lowest merge rank.
            (string First, string Second) bigram = default;
            int bestRank = int.MaxValue;
            for (int i = 0; i < word.Count - 1; i++)
            {
                if (this.bpeRanks.TryGetValue((word[i], word[i + 1]), out int r) && r < bestRank)
                {
                    bestRank = r;
                    bigram = (word[i], word[i + 1]);
                }
            }

            if (bestRank == int.MaxValue)
            {
                break;
            }

            var merged = new List<string>(word.Count);
            int idx = 0;
            while (idx < word.Count)
            {
                int found = word.IndexOf(bigram.First, idx);
                if (found < 0)
                {
                    merged.AddRange(word.GetRange(idx, word.Count - idx));
                    break;
                }

                merged.AddRange(word.GetRange(idx, found - idx));
                idx = found;

                if (word[idx] == bigram.First && idx < word.Count - 1 && word[idx + 1] == bigram.Second)
                {
                    merged.Add(bigram.First + bigram.Second);
                    idx += 2;
                }
                else
                {
                    merged.Add(word[idx]);
                    idx += 1;
                }
            }

            word = merged;
        }

        string result = string.Join(' ', word);
        this.cache[token] = result;
        return result;
    }
}
