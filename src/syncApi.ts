import { csrfHeader, request } from './apiClient';
import { filenameFrom, messageFromFailure, saveBlob } from './fileDownload';

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

  /**
   * Owner: download the enrollment file for one outlet's computer.
   *
   * Downloaded rather than shown, because what the operator does with it is
   * carry it to the counter on a USB stick and point the installer at it.
   *
   * The file carries the bucket's access key and the business's sync key in the
   * clear — the installer needs both before a database exists to keep them in.
   * Treat it as a credential and delete it once the counter is enrolled.
   */
  downloadEnrollment: async (outletId: string, outletCode: string) => {
    const response = await fetch(`/api/sync/enrollment/${outletId}`, {
      method: 'POST',
      // This download cannot use request(): it needs the response blob and its
      // Content-Disposition header. It is still a state-changing POST, so it
      // must carry the same CSRF proof as every other protected action. Without
      // it Spring answers 403 before it ever checks that the user is an owner.
      headers: await csrfHeader(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(await messageFromFailure(
        response, `The enrollment file could not be produced (${response.status}).`));
    }

    saveBlob(await response.blob(), filenameFrom(
      response.headers.get('Content-Disposition'), `${outletCode}.radiance-setup`));
  },
};

/** "2 hours ago" — the answer to "how stale is Cloud Sync". */
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
