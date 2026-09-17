import { request } from './apiClient';

/**
 * FR-SET-07 · NFR-6 · NFR-7: the state of the backups.
 *
 * The screen used to offer a JSON download built from whatever the browser had
 * in memory, which is an export rather than a backup — it cannot include what
 * was never loaded, and it lives on the same machine as the database. That
 * button stays, because an accountant asking for a file is a real need, but the
 * backup a disk failure is survived with is the server's, and this is how the
 * screen reads it.
 */
export interface BackupRunWire {
  id: string;
  kind: 'SCHEDULED' | 'MANUAL' | 'RESTORE';
  startedAt: string;
  finishedAt: string | null;
  outcome: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  fileName: string | null;
  sizeBytes: number | null;
  storedLocal: boolean;
  storedOffsite: boolean;
  destination: string | null;
  error: string | null;
}

/**
 * `healthy` is not "the last one succeeded" — a copy made three weeks ago
 * succeeded too. It means there is a recent one and it left this machine, so
 * the screen must show it as given rather than recompute a friendlier version.
 */
export interface BackupStatusWire {
  enabled: boolean;
  offsiteConfigured: boolean;
  healthy: boolean;
  summary: string;
  lastSuccess: BackupRunWire | null;
  lastOffsiteSuccess: BackupRunWire | null;
  recoveryPointMinutes: number | null;
  intervalMinutes: number;
  retentionDays: number;
  history: BackupRunWire[];
}

export const backupsApi = {
  status: (limit = 20) => request<BackupStatusWire>(`/api/backups?limit=${limit}`),

  /** The moment before something risky: a stocktake, a bulk price change. */
  runNow: () => request<BackupRunWire>('/api/backups', { method: 'POST' }),
};

/** "14.2 MB" — sizes on this screen are for recognising a truncated dump. */
export const formatBytes = (bytes: number | null): string => {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
};

/**
 * NFR-7 is stated in time, so the recovery point is shown in time.
 *
 * "37 minutes" against a fifteen-minute target is a number an owner can act on;
 * a timestamp is one they have to do arithmetic on first.
 */
export const formatAge = (minutes: number | null): string => {
  if (minutes === null || minutes === undefined) return 'never';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ${minutes % 60} min ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};
