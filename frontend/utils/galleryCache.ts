import { useSyncExternalStore } from 'react';

import { fetchGallery, type GalleryFilters, type GalleryItem } from '@/utils/api';

export const GALLERY_PAGE_SIZE = 16;

interface GalleryCacheState {
  items: GalleryItem[];
  pages: Record<number, GalleryItem[]>;
  total: number;
  page: number;
  pageSize: number;
  filters: GalleryFilters;
  initialized: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

const INITIAL: GalleryCacheState = {
  items: [],
  pages: {},
  total: 0,
  page: 1,
  pageSize: GALLERY_PAGE_SIZE,
  filters: {},
  initialized: false,
  loading: false,
  loadingMore: false,
  error: null,
};

let state: GalleryCacheState = INITIAL;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function filtersKey(f: GalleryFilters): string {
  return JSON.stringify({
    assetType: f.assetType ?? 'Photo',
    types: [...(f.types ?? [])].sort(),
    from: f.from ?? '',
    to: f.to ?? '',
    search: (f.search ?? '').trim().toLowerCase(),
  });
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState(): GalleryCacheState {
  return state;
}

export function useGalleryCache(): GalleryCacheState {
  return useSyncExternalStore(subscribe, getState, getState);
}

async function fetchAndCachePage(
  page: number,
  filters: GalleryFilters,
  mode: 'replace' | 'append'
): Promise<void> {
  state = {
    ...state,
    loading: mode === 'replace',
    loadingMore: mode === 'append',
    error: null,
  };
  notify();
  try {
    const res = await fetchGallery({ ...filters, page, pageSize: GALLERY_PAGE_SIZE });
    const sameFilters = filtersKey(state.filters) === filtersKey(filters);
    const nextPages = sameFilters ? { ...state.pages, [page]: res.items } : { [page]: res.items };
    state = {
      items: mode === 'append' ? [...state.items, ...res.items] : res.items,
      pages: nextPages,
      total: res.total,
      page: res.page,
      pageSize: res.pageSize,
      filters,
      initialized: true,
      loading: false,
      loadingMore: false,
      error: null,
    };
  } catch (e) {
    state = {
      ...state,
      loading: false,
      loadingMore: false,
      error: e instanceof Error ? e.message : 'Failed to load gallery.',
    };
  }
  notify();
}

export async function ensureLoaded(filters: GalleryFilters): Promise<void> {
  if (state.initialized && filtersKey(state.filters) === filtersKey(filters)) return;
  await fetchAndCachePage(1, filters, 'replace');
}

export async function setFiltersAndReload(filters: GalleryFilters): Promise<void> {
  if (state.initialized && filtersKey(state.filters) === filtersKey(filters)) return;
  await fetchAndCachePage(1, filters, 'replace');
}

export async function goToPage(page: number): Promise<void> {
  const cached = state.pages[page];
  if (cached) {
    state = { ...state, items: cached, page };
    notify();
    return;
  }
  await fetchAndCachePage(page, state.filters, 'replace');
}

export async function loadMore(): Promise<void> {
  if (state.loading || state.loadingMore) return;
  if (state.items.length >= state.total) return;
  const nextPage = state.page + 1;
  const cached = state.pages[nextPage];
  if (cached) {
    state = { ...state, items: [...state.items, ...cached], page: nextPage };
    notify();
    return;
  }
  await fetchAndCachePage(nextPage, state.filters, 'append');
}

export async function refresh(): Promise<void> {
  // Drop all cached pages so stale data doesn't linger on navigation.
  state = { ...state, pages: {} };
  await fetchAndCachePage(state.page, state.filters, 'replace');
}

export function addItem(item: GalleryItem): void {
  // If the gallery was never loaded from the server, don't seed it with a single
  // optimistic item: that would flip `initialized` to true and make ensureLoaded
  // skip the real fetch, so the page would show only this item. The next focus
  // fetch returns the full list (including this item) anyway.
  if (!state.initialized) return;
  // Prepend to current view. Other cached pages are now shifted by one on the
  // server so their content is stale — drop them and only keep the current
  // page's view in the cache.
  const nextItems = [item, ...state.items];
  state = {
    ...state,
    items: nextItems,
    pages: { [state.page]: nextItems.slice(0, state.pageSize) },
    total: state.total + 1,
    initialized: true,
  };
  notify();
}

export function upsertItem(updated: GalleryItem): void {
  const idx = state.items.findIndex((i) => i.id === updated.id);
  if (idx === -1) return;
  const nextItems = state.items.slice();
  nextItems[idx] = updated;
  const pageItems = state.pages[state.page];
  const nextPages = pageItems
    ? {
        ...state.pages,
        [state.page]: pageItems.map((it) => (it.id === updated.id ? updated : it)),
      }
    : state.pages;
  state = { ...state, items: nextItems, pages: nextPages };
  notify();
}

export function removeItem(id: string): void {
  const next = state.items.filter((i) => i.id !== id);
  if (next.length === state.items.length) return;
  state = {
    ...state,
    items: next,
    pages: { [state.page]: next.slice(0, state.pageSize) },
    total: Math.max(0, state.total - 1),
  };
  notify();
}

export function resetCache(): void {
  state = INITIAL;
  notify();
}

export function invalidate(assetType?: GalleryItem['assetType']): void {
  // If we're invalidating a specific asset type and the cache is currently
  // loaded for a different type, leave it alone — it'll re-fetch on switch
  // because filtersKey already changed when the user switches dropdowns.
  if (assetType && (state.filters.assetType ?? 'Photo') !== assetType) return;
  state = { ...state, initialized: false, pages: {} };
  notify();
}
