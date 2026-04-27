using System.Diagnostics;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryImageGeneration.Models.Recommendations;
using MerchStoryImageGeneration.Services.Recommendations;
using Microsoft.EntityFrameworkCore;
using Pgvector;
using Pgvector.EntityFrameworkCore;

namespace MerchStoryAPI.Recommendations;

// Owns IdeaEmbedding read/write. Used by the orchestrator at two points:
//   - before generation: retrieve the user's recent ideas so the Writer can
//     avoid repeating themes (Phase 5b).
//   - after generation: embed the freshly-produced ideas and persist them so
//     they show up in tomorrow's anti-repetition retrieval.
//
// All operations are best-effort: if the embedding model is offline the
// pipeline still ships ideas, just without the diversity grounding.
public class IdeaEmbeddingService
{
    private const int LookbackDays = 30;

    private readonly AppDbContext db;
    private readonly IEmbeddingService embedder;
    private readonly ILogger<IdeaEmbeddingService> logger;

    public IdeaEmbeddingService(AppDbContext db, IEmbeddingService embedder, ILogger<IdeaEmbeddingService> logger)
    {
        this.db = db;
        this.embedder = embedder;
        this.logger = logger;
    }

    public async Task<IReadOnlyList<PreviousIdeaHit>> RetrieveRecentForUserAsync(
        string userId,
        string queryText,
        int topK,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(queryText) || topK <= 0)
        {
            return Array.Empty<PreviousIdeaHit>();
        }

        Stopwatch sw = Stopwatch.StartNew();
        DateTime cutoff = DateTime.UtcNow.AddDays(-LookbackDays);

        bool any = await this.db.IdeaEmbeddings
            .AnyAsync(e => e.UserId == userId && e.GeneratedAtUtc >= cutoff, ct);
        if (!any)
        {
            this.logger.LogInformation(
                "[PreviousIdeas] user={User} has 0 ideas in last {Days}d — skipping anti-repetition RAG",
                userId,
                LookbackDays);
            return Array.Empty<PreviousIdeaHit>();
        }

        float[] queryVec;
        try
        {
            queryVec = await this.embedder.EmbedAsync(queryText, ct);
        }
        catch (Exception ex)
        {
            this.logger.LogWarning(
                ex,
                "[PreviousIdeas] embedding FAILED — pipeline continues without anti-repetition grounding");
            return Array.Empty<PreviousIdeaHit>();
        }

        Vector queryVector = new(queryVec);

        List<PreviousIdeaHit> hits = await this.db.IdeaEmbeddings
            .Where(e => e.UserId == userId && e.GeneratedAtUtc >= cutoff)
            .OrderBy(e => e.Embedding.CosineDistance(queryVector))
            .Take(topK)
            .Select(e => new PreviousIdeaHit(e.Title, e.Body, e.GeneratedAtUtc))
            .ToListAsync(ct);

        this.logger.LogInformation(
            "[PreviousIdeas] retrieved {Count} hits in {Ms}ms titles=[{Titles}]",
            hits.Count,
            sw.ElapsedMilliseconds,
            string.Join(" | ", hits.Select(h => h.Title)));

        return hits;
    }

    public async Task PersistIdeasAsync(
        string userId,
        Guid dailyRecommendationId,
        DateTime generatedAtUtc,
        IReadOnlyList<IdeaDto> ideas,
        CancellationToken ct)
    {
        if (ideas.Count == 0)
        {
            return;
        }

        Stopwatch sw = Stopwatch.StartNew();
        string[] corpora = ideas
            .Select(i => $"{i.Title}\n\n{i.Body}")
            .ToArray();

        this.logger.LogInformation(
            "[PreviousIdeas] persist start ideas={Count} user={User}",
            ideas.Count,
            userId);

        IReadOnlyList<float[]> vectors;
        try
        {
            vectors = await this.embedder.EmbedManyAsync(corpora, ct);
        }
        catch (Exception ex)
        {
            // Best-effort: if embeddings fail we just skip persistence. The
            // ideas themselves are already saved in DailyRecommendation.IdeasJson.
            this.logger.LogWarning(
                ex,
                "[PreviousIdeas] embedding {Count} new ideas FAILED — anti-repetition data won't include this run",
                ideas.Count);
            return;
        }

        for (int i = 0; i < ideas.Count; i++)
        {
            this.db.IdeaEmbeddings.Add(new IdeaEmbedding
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                DailyRecommendationId = dailyRecommendationId,
                IdeaId = ideas[i].Id,
                Title = ideas[i].Title,
                Body = ideas[i].Body,
                GeneratedAtUtc = generatedAtUtc,
                Embedding = new Vector(vectors[i]),
            });
        }

        await this.db.SaveChangesAsync(ct);
        this.logger.LogInformation(
            "[PreviousIdeas] persist done in {Ms}ms ideas={Count}",
            sw.ElapsedMilliseconds,
            ideas.Count);
    }
}
