import { describe, expect, it } from 'vitest';
import {
  decodeWorkspaceLocation,
  encodeWorkspaceLocation,
  workspaceLocationKey,
} from '../workspaceLocation';

describe('workspace location across refresh', () => {
  it('restores an authorised page and an open POS terminal', () => {
    const stored = encodeWorkspaceLocation('products-setup', true);

    expect(decodeWorkspaceLocation(stored, () => true, true)).toEqual({
      activeTab: 'products-setup',
      posOpen: true,
    });
  });

  it('does not restore a page or terminal after permission is revoked', () => {
    const stored = encodeWorkspaceLocation('reports', true);

    expect(decodeWorkspaceLocation(stored, () => false, false)).toEqual({
      activeTab: 'dashboard',
      posOpen: false,
    });
  });

  it('does not restore transient or corrupted application state', () => {
    expect(decodeWorkspaceLocation('{broken', () => true, true)).toEqual({
      activeTab: 'dashboard',
      posOpen: false,
    });
    expect(JSON.parse(encodeWorkspaceLocation('server-error', false))).toEqual({
      activeTab: 'dashboard',
      posOpen: false,
    });
  });

  it('keeps each user location under a separate key', () => {
    expect(workspaceLocationKey('owner')).not.toBe(workspaceLocationKey('cashier'));
  });
});
