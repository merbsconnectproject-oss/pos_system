import { request } from './apiClient';
import type { Outlet } from './types';

/**
 * Branches — FR-OUT.
 *
 * <p>The server calls the receipt segment `code`; `types.ts` calls it
 * `receiptPrefix`. That is the only difference between the wire shape and the
 * app's, so it is translated here once rather than at every screen that reads
 * an outlet.
 */
export interface OutletWire {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
  // The API serialises with `default-property-inclusion: non_null`, so an
  // unset field is absent from the payload rather than present and null.
  // Declaring these optional is what the server actually sends.
  tradingName?: string | null;
  town?: string | null;
  address?: string | null;
  phone?: string | null;
  managerName?: string | null;
  receiptFooter?: string | null;
  logoUrl?: string | null;
}

export const toOutlet = (wire: OutletWire): Outlet => ({
  id: wire.id,
  name: wire.name,
  town: wire.town || '',
  phone: wire.phone || '',
  address: wire.address || '',
  receiptPrefix: wire.code,
  managerName: wire.managerName || 'Unassigned',
  active: wire.active,
  createdAt: wire.createdAt,
});

/** The branch form's fields, in the shape the API validates. */
export interface OutletDraft {
  code: string;
  name: string;
  town: string;
  address?: string;
  phone?: string;
  managerName?: string;
  tradingName?: string;
  receiptFooter?: string;
  logoUrl?: string;
}

const fromOutlet = (outlet: Partial<Outlet>): OutletDraft => ({
  code: (outlet.receiptPrefix || '').toUpperCase(),
  name: outlet.name || '',
  town: outlet.town || '',
  address: outlet.address,
  phone: outlet.phone,
  managerName: outlet.managerName,
});

export const outletsApi = {
  list: (includeInactive = false) =>
    request<OutletWire[]>(`/api/outlets?includeInactive=${includeInactive}`).then((rows) => rows.map(toOutlet)),

  create: (outlet: Partial<Outlet>) =>
    request<OutletWire>('/api/outlets', { method: 'POST', body: JSON.stringify(fromOutlet(outlet)) }).then(toOutlet),

  update: (id: string, outlet: Partial<Outlet>) =>
    request<OutletWire>(`/api/outlets/${encodeURIComponent(id)}`, {
      method: 'PUT', body: JSON.stringify(fromOutlet(outlet)),
    }).then(toOutlet),

  /** BR-17: a branch closes, it is never deleted. */
  setActive: (id: string, active: boolean) =>
    request<OutletWire>(`/api/outlets/${encodeURIComponent(id)}/active?value=${active}`, {
      method: 'POST',
    }).then(toOutlet),
};
