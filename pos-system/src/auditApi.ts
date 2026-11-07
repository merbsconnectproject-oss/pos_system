import { request } from './apiClient';
import type { AuditLogEntry } from './types';

/**
 * The audit log — BR-15.
 *
 * Read-only, because the log is. Entries are written by the server actions that
 * cause them; there is no endpoint to add or amend one, and the database
 * refuses update and delete outright.
 */
export interface AuditWire {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  entity: string;
  outletName: string;
  details: string;
}

const stamp = (iso: string) => {
  const at = new Date(iso);
  return `${at.toLocaleDateString('en-GB')} ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

export const toAuditEntry = (wire: AuditWire): AuditLogEntry => ({
  id: wire.id,
  // The wire carries an instant; the column shows local time, because the
  // person reading it is standing in the shop the event happened in.
  timestamp: stamp(wire.timestamp),
  actor: wire.actor,
  action: wire.action,
  entity: wire.entity,
  outletName: wire.outletName,
  details: wire.details,
});

export interface AuditFilter {
  action?: string;
  outletId?: string;
  limit?: number;
}

export const auditApi = {
  recent: (filter: AuditFilter = {}) => {
    const query = new URLSearchParams();
    if (filter.action) query.set('action', filter.action);
    if (filter.outletId) query.set('outletId', filter.outletId);
    query.set('limit', String(filter.limit ?? 200));
    return request<AuditWire[]>(`/api/audit?${query}`).then((rows) => rows.map(toAuditEntry));
  },
};
