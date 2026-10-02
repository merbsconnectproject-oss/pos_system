import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncApi } from '../syncApi';

describe('outlet computer enrollment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('proves the owner session with CSRF before requesting an enrollment file', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        headerName: 'X-CSRF-TOKEN',
        token: 'owner-session-token',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      // Stop before the browser-only save step; the request itself is the rule
      // this test pins. A missing token used to produce this exact 403 in use.
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'test stop' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetch);

    await expect(syncApi.downloadEnrollment('outlet-id', 'ACC')).rejects.toThrow('test stop');

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/auth/csrf', { credentials: 'include' });
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/sync/enrollment/outlet-id', {
      method: 'POST',
      headers: { 'X-CSRF-TOKEN': 'owner-session-token' },
      credentials: 'include',
    });
  });
});
