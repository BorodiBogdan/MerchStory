import { useCallback, useEffect, useState } from 'react';

import { fetchIdeas, type IdeaItem, refreshIdeas as refreshIdeasApi } from '@/utils/api';

interface UseIdeasResult {
  ideas: IdeaItem[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useIdeas(): UseIdeasResult {
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchIdeas();
        if (!cancelled) {
          setIdeas(response.ideas);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load ideas');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await refreshIdeasApi();
      setIdeas(response.ideas);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh ideas');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return { ideas, isLoading, isRefreshing, error, refresh };
}
