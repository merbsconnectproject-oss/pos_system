import type { PermissionCode, UserRole } from './permissions';

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

interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export class AuthApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/**
 * What the server just told us about the session, for anyone who was not the
 * caller.
 *
 * The server keeps its own lock and expiry state (`SessionGuardFilter`), and it
 * can change without the client asking: an idle terminal with an open shift is
 * locked server-side, and a deactivated account loses its session mid-request.
 * Every endpoint can therefore answer 423 or 401 regardless of what was asked
 * for, so the signal is published from one place here rather than re-handled at
 * each call site.
 */
export type SessionSignal = 'locked' | 'ended';

const signalListeners = new Set<(signal: SessionSignal) => void>();

/** Returns an unsubscribe function, so a React effect can clean up. */
export function onSessionSignal(listener: (signal: SessionSignal) => void) {
  signalListeners.add(listener);
  return () => { signalListeners.delete(listener); };
}

function publish(signal: SessionSignal) {
  signalListeners.forEach((listener) => listener(signal));
}

// The session is gone and the client must return to sign-in. A wrong unlock PIN
// is deliberately absent: it is also a 401, but the session survives it.
const ENDED_CODES = new Set(['NOT_AUTHENTICATED', 'SESSION_INVALID', 'SESSION_EXPIRED']);

let csrf: { headerName: string; token: string } | null = null;

async function csrfToken() {
  if (csrf) return csrf;
  const response = await fetch('/api/auth/csrf', { credentials: 'include' });
  if (!response.ok) throw new AuthApiError(response.status, 'CSRF_FAILED', 'Could not start a secure session');
  csrf = await response.json();
  return csrf;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = await csrfToken();
    headers.set(token.headerName, token.token);
  }
  if (init.body) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: 'include' });
  } catch {
    throw new AuthApiError(0, 'NETWORK_ERROR', 'Cannot reach the POS server. Check that it is running.');
  }

  if (!response.ok) {
    let body: ApiErrorBody = {};
    try { body = await response.json(); } catch { /* use the safe fallback below */ }
    const code = body.code || 'REQUEST_FAILED';

    // 423 is the server's lock, which no request asked for and every request
    // can meet. Raise it so the app shows the unlock overlay instead of a
    // screenful of individually failed calls.
    if (response.status === 423) publish('locked');
    if (response.status === 401 && ENDED_CODES.has(code)) {
      csrf = null;
      publish('ended');
    }

    throw new AuthApiError(
      response.status,
      code,
      body.message || 'The request could not be completed',
      body.details,
    );
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') return undefined as T;
  return response.json() as Promise<T>;
}

export const authApi = {
  current: () => request<AuthSession>('/api/auth/session'),
  signIn: (identifier: string, password: string) => request<AuthSession>('/api/auth/sign-in', {
    method: 'POST', body: JSON.stringify({ identifier, password }),
  }),
  selectOutlet: (outletId: string) => request<AuthSession>(`/api/auth/outlet/${encodeURIComponent(outletId)}`, { method: 'POST' }),
  lock: () => request<void>('/api/auth/lock', { method: 'POST' }),
  unlock: (pin: string) => request<void>('/api/auth/unlock', { method: 'POST', body: JSON.stringify({ pin }) }),
  signOut: () => request<void>('/api/auth/sign-out', { method: 'POST' }),
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
