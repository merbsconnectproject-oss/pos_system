import { request } from './apiClient';
import type { PermissionOverrides, RolePermissions, UserAccount, UserRole } from './types';
import { ROLE_BADGE_COLORS, ROLE_DESCRIPTIONS, ROLE_LABELS, type PermissionCode } from './permissions';

/**
 * Staff, roles and permissions — FR-USER, BR-16.
 *
 * No hash of any kind crosses this boundary. The server never sends one, and
 * `password` and `pin` go one way only — omitting them on an edit leaves what
 * is already set, so saving a phone number does not clear somebody's PIN.
 */
export interface UserWire {
  id: string;
  username: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  roles: string[];
  outletIds: string[];
  effectivePermissions: PermissionCode[];
  overrides: Record<string, boolean>;
  active: boolean;
  pinSet: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

/** Accept labels from older seeded data, but only send the canonical backend roles. */
const normalizeRole = (value: string): UserRole => {
  if (value === 'branch_manager') return 'manager';
  if (value === 'super_admin') return 'owner';
  return (['owner', 'manager', 'cashier', 'storekeeper'].includes(value) ? value : 'cashier') as UserRole;
};

export const toUserAccount = (wire: UserWire): UserAccount => ({
  id: wire.id,
  fullName: wire.fullName,
  username: wire.username,
  email: wire.email || '',
  phone: wire.phone || '',
  // The app models one role; the server allows several. The first is the one
  // the UI labels by, and `effectivePermissions` is what actually decides.
  role: normalizeRole(wire.roles[0] || 'cashier'),
  // 'all-outlets' is the app's word for someone who works across branches.
  outletId: wire.outletIds.length === 1 ? wire.outletIds[0] : 'all-outlets',
  active: wire.active,
  // Never sent, and never should be — the PIN is a hash on the server.
  pinCode: '',
  lastLogin: wire.lastLoginAt
    ? new Date(wire.lastLoginAt).toLocaleString('en-GB')
    : undefined,
  permissionOverrides: wire.overrides as PermissionOverrides,
  effectivePermissions: wire.effectivePermissions,
});

export interface UserDraft {
  username: string;
  fullName: string;
  email?: string;
  phone?: string;
  /** Required on create; omit on edit to keep the current one. */
  password?: string;
  pin?: string;
  roles: string[];
  outletIds: string[];
}

const fromAccount = (account: Partial<UserAccount>, allOutletIds: string[]): UserDraft => ({
  username: account.username || '',
  fullName: account.fullName || '',
  email: account.email || undefined,
  phone: account.phone || undefined,
  password: account.password || undefined,
  pin: account.pinCode || undefined,
  roles: [normalizeRole(account.role || 'cashier')],
  outletIds: account.outletId === 'all-outlets' || !account.outletId
    ? allOutletIds
    : [account.outletId],
});

export interface PermissionInfo {
  code: PermissionCode;
  group: string;
  description: string;
  /** Reserved for Stage 2 or 3 — shown in the matrix, but nothing acts on it. */
  futureStage: boolean;
}

export const usersApi = {
  list: (includeInactive = false) =>
    request<UserWire[]>(`/api/users?includeInactive=${includeInactive}`)
      .then((rows) => rows.map(toUserAccount)),

  create: (account: Partial<UserAccount>, allOutletIds: string[]) =>
    request<UserWire>('/api/users', {
      method: 'POST', body: JSON.stringify(fromAccount(account, allOutletIds)),
    }).then(toUserAccount),

  update: (id: string, account: Partial<UserAccount>, allOutletIds: string[]) =>
    request<UserWire>(`/api/users/${encodeURIComponent(id)}`, {
      method: 'PUT', body: JSON.stringify(fromAccount(account, allOutletIds)),
    }).then(toUserAccount),

  /**
   * FR-USER-03 · BR-16. Passing no `granted` clears the override and returns
   * the person to their role baseline — a third state, not a synonym for false.
   */
  setPermission: (id: string, code: PermissionCode, granted?: boolean) => {
    const query = granted === undefined ? '' : `?granted=${granted}`;
    return request<UserWire>(
      `/api/users/${encodeURIComponent(id)}/permissions/${encodeURIComponent(code)}${query}`,
      { method: 'PUT' },
    ).then(toUserAccount);
  },

  /** FR-USER-07 · BR-17. */
  setActive: (id: string, active: boolean) =>
    request<UserWire>(`/api/users/${encodeURIComponent(id)}/active?value=${active}`, { method: 'POST' })
      .then(toUserAccount),

  /** `J-06`: the matrix, and what each role starts with. */
  catalogue: () => request<{
    permissions: PermissionInfo[];
    roles: { key: string; baseline: PermissionCode[] }[];
  }>('/api/users/catalogue'),
};

/**
 * The role baselines, in the shape the permission matrix renders.
 *
 * The label, description and badge colour stay in the frontend: they are how a
 * role is presented, not what it grants, and the server has no business
 * carrying copy.
 */
export const toRolePermissions = (
  roles: { key: string; baseline: PermissionCode[] }[],
): RolePermissions[] =>
  roles.map((role) => {
    const key = role.key as UserRole;
    return {
      role: key,
      roleTitle: ROLE_LABELS[key],
      description: ROLE_DESCRIPTIONS[key],
      badgeColor: ROLE_BADGE_COLORS[key],
      permissions: role.baseline,
    };
  });
