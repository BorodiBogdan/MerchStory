import { useEffect, useState } from 'react';

import { fetchProductImage } from '@/utils/api';

const MAX_ENTRIES = 200;
const MAX_CONCURRENT = 6;

type Entry = { uri: string };

const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry>>();
const errors = new Map<string, string>();
const waiting: (() => void)[] = [];
let active = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function toDataUri(imageBase64: string, mimeType: string): string {
  return `data:${mimeType};base64,${imageBase64}`;
}

function touch(id: string): void {
  const entry = entries.get(id);
  if (!entry) return;
  entries.delete(id);
  entries.set(id, entry);
}

function evictIfNeeded(): void {
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

function store(id: string, entry: Entry): void {
  entries.set(id, entry);
  evictIfNeeded();
}

function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiting.push(() => {
      active++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  active--;
  const next = waiting.shift();
  if (next) next();
}

async function fetchWithSlot(id: string): Promise<Entry> {
  await acquireSlot();
  try {
    const res = await fetchProductImage(id);
    const entry: Entry = { uri: toDataUri(res.imageBase64, res.mimeType) };
    store(id, entry);
    errors.delete(id);
    notify();
    return entry;
  } catch (err) {
    errors.set(id, err instanceof Error ? err.message : 'Failed to load image.');
    notify();
    throw err;
  } finally {
    releaseSlot();
  }
}

export function prime(id: string, imageBase64: string, mimeType: string): void {
  const uri = toDataUri(imageBase64, mimeType);
  const existing = entries.get(id);
  if (existing && existing.uri === uri) {
    touch(id);
    return;
  }
  store(id, { uri });
  errors.delete(id);
  notify();
}

export function evict(id: string): void {
  const had = entries.delete(id) || errors.delete(id);
  if (had) notify();
}

export function load(id: string): Promise<Entry> {
  const cached = entries.get(id);
  if (cached) {
    touch(id);
    return Promise.resolve(cached);
  }
  const pending = inflight.get(id);
  if (pending) return pending;
  const p = fetchWithSlot(id).finally(() => {
    inflight.delete(id);
  });
  inflight.set(id, p);
  return p;
}

export function retry(id: string): void {
  errors.delete(id);
  notify();
  load(id).catch(() => {});
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

type HookState = { uri: string | undefined; loading: boolean; error: string | null };

function snapshotFor(id: string): HookState {
  const cached = entries.get(id);
  if (cached) return { uri: cached.uri, loading: false, error: null };
  const err = errors.get(id);
  if (err) return { uri: undefined, loading: false, error: err };
  return { uri: undefined, loading: true, error: null };
}

export function useProductImage(id: string): HookState {
  const [state, setState] = useState<HookState>(() => snapshotFor(id));

  useEffect(() => {
    setState(snapshotFor(id));

    if (!entries.has(id) && !errors.has(id)) {
      load(id)
        .then(() => setState(snapshotFor(id)))
        .catch(() => setState(snapshotFor(id)));
    }

    const unsubscribe = subscribe(() => setState(snapshotFor(id)));
    return unsubscribe;
  }, [id]);

  return state;
}
