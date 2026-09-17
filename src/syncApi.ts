import { request } from './apiClient';

/**
 * The two R2 channels — see `docs/ARCHITECTURE-topology-and-sync.md`.
 *
 * Configuration flows down from the owner; transactions flow up from each shop.
 * Nothing here is on the selling path: every call is something a person presses,
 * so a bucket that cannot be reached never stops a till.
 */
export interface SyncStatus {
  configured: boolean;
  outletCode: string;
  mode: 'COUNTER' | 'CONSOLIDATOR';
  /** Rows written here and not yet sent. */
  pendingRows: number;
  pendingByTable: Record<string, number>;
  lastPushedAt: string | null;
  lastSequence: number;
  configPulledAt: string | null;
  summary: string;
}

export interface SyncTransfer {
  configured: boolean;
  batches: number;
  rows: number;
  rowsByTable: Record<string, number>;
  keys: string[];
  message: string;
}

export interface SyncConfiguration {
  outletCode: string;
  publishedAt: string;
  users: number;
  products: number;
  message: string;
}

export const syncApi = {
  status: () => request<SyncStatus>('/api/sync/status'),

  /** Owner: write one outlet's configuration to the bucket. */
  publishConfiguration: (outletId: string) =>
    request<SyncConfiguration>(`/api/sync/config/${outletId}`, { method: 'POST' }),

  /**
   * Shop: fetch and apply the configuration published for this outlet.
   *
   * Re-runnable on purpose — this is the button a shop presses at setup and
   * again whenever the owner changes something.
   */
  getConfiguration: () =>
    request<SyncConfiguration>('/api/sync/config', { method: 'POST' }),

  /** Shop: send everything written here since the last push. */
  push: () => request<SyncTransfer>('/api/sync/push', { method: 'POST' }),

  /** Owner: bring in every batch not yet applied, oldest first. */
  ingest: () => request<SyncTransfer>('/api/sync/ingest', { method: 'POST' }),
};

/** "2 hours ago" — the answer to "how stale is the owner's view". */
export const staleness = (at: string | null): string => {
  if (!at) return 'never';
  const minutes = Math.floor((Date.now() - Date.parse(at)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ${minutes % 60} min ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};
