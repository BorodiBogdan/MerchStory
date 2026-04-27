import { useCallback, useEffect, useState } from 'react';

import {
  fetchIdeas,
  type IdeaItem,
  pollIdeasJob,
  type RecommendationResponse,
  refreshIdeas as refreshIdeasApi,
} from '@/utils/api';

interface UseIdeasResult {
  ideas: IdeaItem[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 90_000;

class AbortError extends Error {}

// Drive the response shape to ideas. If the backend is ready inline (Mock or
// cached row) we get the array immediately. If it returned a job, we poll
// /recommendations/jobs/{jobId} every 2s until ready / failed / timeout.
async function awaitGeneration(
  initial: RecommendationResponse,
  signal: AbortSignal
): Promise<IdeaItem[]> {
  if (initial.status === 'ready') return initial.ideas;
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

    const result = await pollIdeasJob(jobId);
    if (result.status === 'ready') return result.ideas;
    if (result.status === 'failed') throw new Error(result.error || 'Generation failed');
    // status === 'generating' → continue polling
  }
}

export function useIdeas(): UseIdeasResult {
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const initial = await fetchIdeas();
        const next = await awaitGeneration(initial, controller.signal);
        if (!controller.signal.aborted) {
          setIdeas(next);
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
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    const controller = new AbortController();
    try {
      const initial = await refreshIdeasApi();
      const next = await awaitGeneration(initial, controller.signal);
      setIdeas(next);
      setError(null);
    } catch (err) {
      if (err instanceof AbortError) return;
      setError(err instanceof Error ? err.message : 'Could not refresh ideas');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return { ideas, isLoading, isRefreshing, error, refresh };
}
