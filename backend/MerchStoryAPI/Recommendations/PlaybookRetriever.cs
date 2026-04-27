using System.Diagnostics;
using MerchStoryAPI.Data;
using MerchStoryImageGeneration.Models.Recommendations;
using MerchStoryImageGeneration.Services.Recommendations;
using Microsoft.EntityFrameworkCore;
using Pgvector;
using Pgvector.EntityFrameworkCore;

namespace MerchStoryAPI.Recommendations;

// Top-K cosine-similarity retrieval over the PromoPlaybook for a given
// BusinessDomain. Embeds the query once via the configured LM Studio embedding
// model, then leans on the HNSW index defined in AppDbContext for the
// nearest-neighbor search.
//
// Graceful when zero entries match (e.g. user's domain has no playbook seeded
// yet — only Market is loaded in v1): returns an empty list, the Strategist
// prompt skips the RAG block, the rest of the pipeline still runs.
public class PlaybookRetriever
{
    private readonly AppDbContext db;
    private readonly IEmbeddingService embedder;
    private readonly ILogger<PlaybookRetriever> logger;

    public PlaybookRetriever(AppDbContext db, IEmbeddingService embedder, ILogger<PlaybookRetriever> logger)
    {
        this.db = db;
        this.embedder = embedder;
        this.logger = logger;
    }

    public async Task<IReadOnlyList<PlaybookHit>> RetrieveAsync(
        string businessDomain,
        string queryText,
        int topK,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(businessDomain) || string.IsNullOrWhiteSpace(queryText) || topK <= 0)
        {
            return Array.Empty<PlaybookHit>();
        }

        Stopwatch sw = Stopwatch.StartNew();

        // Cheap pre-check so we don't pay the embedding cost when there's
        // nothing to search.
        bool anyForDomain = await this.db.PromoPlaybookEntries
            .AnyAsync(p => p.BusinessDomain == businessDomain, ct);
        if (!anyForDomain)
        {
            this.logger.LogInformation(
                "[Playbook] domain={Domain} has 0 entries seeded — skipping RAG",
                businessDomain);
            return Array.Empty<PlaybookHit>();
        }

        this.logger.LogInformation(
            "[Playbook] embed query domain={Domain} topK={K} chars={Chars}",
            businessDomain,
            topK,
            queryText.Length);

        float[] queryVec;
        try
        {
            queryVec = await this.embedder.EmbedAsync(queryText, ct);
        }
        catch (Exception ex)
        {
            this.logger.LogWarning(
                ex,
                "[Playbook] embedding FAILED — skipping RAG, pipeline continues without grounding");
            return Array.Empty<PlaybookHit>();
        }

        Vector queryVector = new(queryVec);

        List<PlaybookHit> hits = await this.db.PromoPlaybookEntries
            .Where(p => p.BusinessDomain == businessDomain)
            .OrderBy(p => p.Embedding.CosineDistance(queryVector))
            .Take(topK)
            .Select(p => new PlaybookHit(p.Theme, p.TriggerType, p.Trigger, p.Tactics, p.ExampleCopy))
            .ToListAsync(ct);

        this.logger.LogInformation(
            "[Playbook] retrieved {Count} hits in {Ms}ms themes=[{Themes}]",
            hits.Count,
            sw.ElapsedMilliseconds,
            string.Join(" | ", hits.Select(h => h.Theme)));

        return hits;
    }
}
