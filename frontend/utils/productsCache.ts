import { useSyncExternalStore } from 'react';

import { fetchProducts, type ProductFilters, type ProductItem } from '@/utils/api';

export const PRODUCTS_PAGE_SIZE = 16;

interface ProductsCacheState {
  items: ProductItem[];
  pages: Record<number, ProductItem[]>;
  total: number;
  page: number;
  pageSize: number;
  filters: ProductFilters;
  initialized: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

const INITIAL: ProductsCacheState = {
  items: [],
  pages: {},
  total: 0,
  page: 1,
  pageSize: PRODUCTS_PAGE_SIZE,
  filters: {},
  initialized: false,
  loading: false,
  loadingMore: false,
  error: null,
};

let state: ProductsCacheState = INITIAL;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function filtersKey(f: ProductFilters): string {
  return JSON.stringify({
    search: (f.search ?? '').trim().toLowerCase(),
    categories: [...(f.categories ?? [])].map((c) => c.toLowerCase()).sort(),
    minPrice: f.minPrice ?? '',
    maxPrice: f.maxPrice ?? '',
  });
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState(): ProductsCacheState {
  return state;
}

export function useProductsCache(): ProductsCacheState {
  return useSyncExternalStore(subscribe, getState, getState);
}

async function fetchAndCachePage(
  page: number,
  filters: ProductFilters,
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
    const res = await fetchProducts({ ...filters, page, pageSize: PRODUCTS_PAGE_SIZE });
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
      error: e instanceof Error ? e.message : 'Failed to load products.',
    };
  }
  notify();
}

export async function ensureLoaded(filters: ProductFilters): Promise<void> {
  if (state.initialized && filtersKey(state.filters) === filtersKey(filters)) return;
  await fetchAndCachePage(1, filters, 'replace');
}

export async function setFiltersAndReload(filters: ProductFilters): Promise<void> {
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
  state = { ...state, pages: {} };
  await fetchAndCachePage(state.page, state.filters, 'replace');
}

export function addItem(item: ProductItem): void {
  // If the list was never loaded from the server, don't seed it with a single
  // optimistic item: that would flip `initialized` to true and make ensureLoaded
  // skip the real fetch, so the page would show only this item. The next focus
  // fetch returns the full list (including this item) anyway.
  if (!state.initialized) return;
  // A newly created item is the most recent, so it belongs at the top of page 1,
  // not the page the user happens to be viewing. Jump the view to page 1 and
  // prepend there. Every other cached page is shifted by one on the server now,
  // so drop them.
  const page1 = state.page === 1 ? state.items : state.pages[1];
  if (!page1) {
    // Page 1 isn't cached (e.g. after refresh() while on a deeper page). Reset
    // to page 1 and refetch it so it's rebuilt correctly from the server.
    state = { ...state, page: 1, pages: {}, total: state.total + 1 };
    notify();
    void fetchAndCachePage(1, state.filters, 'replace');
    return;
  }
  const nextPage1 = [item, ...page1].slice(0, state.pageSize);
  state = {
    ...state,
    items: nextPage1,
    page: 1,
    pages: { 1: nextPage1 },
    total: state.total + 1,
  };
  notify();
}

export function upsertItem(item: ProductItem): void {
  const idx = state.items.findIndex((i) => i.id === item.id);
  if (idx === -1) {
    addItem(item);
    return;
  }
  const next = state.items.slice();
  next[idx] = item;
  const pageItems = state.pages[state.page];
  const nextPages = pageItems
    ? {
        ...state.pages,
        [state.page]: pageItems.map((it) => (it.id === item.id ? item : it)),
      }
    : state.pages;
  state = { ...state, items: next, pages: nextPages };
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
