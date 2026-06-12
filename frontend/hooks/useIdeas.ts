import { useCallback, useEffect, useState } from 'react';

import { useI18n } from '@/i18n';
import {
  type AppLanguage,
  fetchIdeas,
  type IdeaItem,
  type IdeaThumb,
  pollIdeasJob,
  type RecommendationResponse,
  refreshIdeas as refreshIdeasApi,
} from '@/utils/api';

interface UseIdeasResult {
  ideas: IdeaItem[];
  recommendationId: string | null;
  // Persisted thumb state per idea (ideaId → thumb), used to rehydrate the
  // like/dislike UI after a remount instead of starting neutral.
  feedback: Record<string, IdeaThumb>;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 90_000;

class AbortError extends Error {}

interface ResolvedIdeas {
  ideas: IdeaItem[];
  recommendationId: string;
  feedback: Record<string, IdeaThumb>;
}

// Drive the response shape to ideas + recommendationId. If the backend is ready
// inline (Mock or cached row) we get both immediately. If it returned a job, we
// poll /recommendations/jobs/{jobId} every 2s until ready / failed / timeout.
// `lang` is forwarded to the polling endpoint so the projected text matches
// the user's currently-active app language.
async function awaitGeneration(
  initial: RecommendationResponse,
  signal: AbortSignal,
  lang: AppLanguage
): Promise<ResolvedIdeas> {
  if (initial.status === 'ready') {
    return { ideas: initial.ideas, recommendationId: initial.id, feedback: initial.feedback };
  }
  if (initial.status === 'failed') throw new Error(initial.error || 'Generation failed');

  const startedAt = Date.now();
  const jobId = initial.jobId;

  while (true) {
    if (signal.aborted) throw new AbortError();
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error('Generation timed out. Try again.');
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (signal.aborted) throw new AbortError();

    const result = await pollIdeasJob(jobId, lang);
    if (result.status === 'ready') {
      return { ideas: result.ideas, recommendationId: result.id, feedback: result.feedback };
    }
    if (result.status === 'failed') throw new Error(result.error || 'Generation failed');
    // status === 'generating' → continue polling
  }
}

export function useIdeas(): UseIdeasResult {
  const { language } = useI18n();
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [recommendationId, setRecommendationId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, IdeaThumb>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-fetch when the app language changes — backend stores both EN+RO,
  // so this just swaps the projection without triggering regeneration.
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const initial = await fetchIdeas(language);
        const next = await awaitGeneration(initial, controller.signal, language);
        if (!controller.signal.aborted) {
          setIdeas(next.ideas);
          setRecommendationId(next.recommendationId);
          setFeedback(next.feedback);
          setError(null);
        }
      } catch (err) {
        if (controller.signal.aborted || err instanceof AbortError) return;
        setError(err instanceof Error ? err.message : 'Could not load ideas');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [language]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    const controller = new AbortController();
    try {
      const initial = await refreshIdeasApi();
      const next = await awaitGeneration(initial, controller.signal, language);
      setIdeas(next.ideas);
      setRecommendationId(next.recommendationId);
      setFeedback(next.feedback);
      setError(null);
    } catch (err) {
      if (err instanceof AbortError) return;
      setError(err instanceof Error ? err.message : 'Could not refresh ideas');
    } finally {
      setIsRefreshing(false);
    }
  }, [language]);

  return { ideas, recommendationId, feedback, isLoading, isRefreshing, error, refresh };
}
