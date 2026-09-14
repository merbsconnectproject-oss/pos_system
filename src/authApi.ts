import { ApiError, forgetCsrf, request } from './apiClient';
import type { PermissionCode, UserRole } from './permissions';

export { onSessionSignal, type SessionSignal } from './apiClient';

/** Kept as the name every auth call site already throws and catches. */
export { ApiError as AuthApiError };

export interface AuthOutlet {
  id: string;
  code: string;
  name: string;
}

export interface AuthSession {
  userId: string;
  username: string;
  fullName: string;
  roles: UserRole[];
  permissions: PermissionCode[];
  activeOutlet: AuthOutlet | null;
  outletChoices: AuthOutlet[];
  mustChooseOutlet: boolean;
  pinSet: boolean;
}

export const authApi = {
  current: () => request<AuthSession>('/api/auth/session'),
  signIn: (identifier: string, password: string) => request<AuthSession>('/api/auth/sign-in', {
    method: 'POST', body: JSON.stringify({ identifier, password }),
  }),
  selectOutlet: (outletId: string) => request<AuthSession>(`/api/auth/outlet/${encodeURIComponent(outletId)}`, { method: 'POST' }),
  lock: () => request<void>('/api/auth/lock', { method: 'POST' }),
  unlock: (pin: string) => request<void>('/api/auth/unlock', { method: 'POST', body: JSON.stringify({ pin }) }),
  signOut: () => request<void>('/api/auth/sign-out', { method: 'POST' })
    .finally(forgetCsrf),

  /**
   * FR-AUTH-02 · BR-10: a manager authorising something at the counter.
   *
   * Checked by the server. A screen that validates its own override has no
   * override — it has a formality, and the answer is in the page source.
   */
  approve: (pin: string, permission: PermissionCode, outletId?: string) =>
    request<{ approved: boolean; approverId: string; approverName: string }>('/api/auth/approve', {
      method: 'POST', body: JSON.stringify({ pin, permission, outletId }),
    }),
  requestPasswordReset: (email: string) => request<void>('/api/auth/password-reset/request', {
    method: 'POST', body: JSON.stringify({ email }),
  }),
  confirmPasswordReset: (token: string, newPassword: string) => request<void>('/api/auth/password-reset/confirm', {
    method: 'POST', body: JSON.stringify({ token, newPassword }),
  }),
  administratorReset: (userId: string, newPassword: string) => request<void>(
    `/api/auth/users/${encodeURIComponent(userId)}/password-reset`,
    { method: 'POST', body: JSON.stringify({ newPassword }) },
  ),
};
