import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CODES,
  canAccessAnyTab,
  canAccessTab,
  createPermissionSet,
  NO_PERMISSIONS,
  TAB_PERMISSIONS,
} from '../permissions';

/**
 * Role visibility — PRD §6, release gate 7.
 *
 * L-09: a control the user cannot use is absent, not disabled. These assert the
 * decisions that gate matters, because the screens ask these functions rather
 * than deciding for themselves.
 */
describe('permissions — who sees what', () => {
  const cashier = createPermissionSet(DEFAULT_ROLE_PERMISSIONS.cashier);
  const owner = createPermissionSet(DEFAULT_ROLE_PERMISSIONS.owner);
  const storekeeper = createPermissionSet(DEFAULT_ROLE_PERMISSIONS.storekeeper);

  it('gives the owner every code', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.owner).toHaveLength(PERMISSION_CODES.length);
  });

  it('keeps cost, profit and reports away from the counter — release gate 7', () => {
    expect(cashier.has('price.view_cost')).toBe(false);
    expect(cashier.has('report.view')).toBe(false);
    expect(cashier.has('report.view_profit')).toBe(false);
    expect(cashier.has('report.view_pl')).toBe(false);
    expect(canAccessTab(cashier, 'expenses')).toBe(false);
  });

  it('lets a cashier sell and close their own day', () => {
    expect(cashier.has('pos.sell')).toBe(true);
    expect(cashier.has('shift.open')).toBe(true);
    expect(cashier.has('shift.close')).toBe(true);
  });

  it('lets a cashier send the day up without administering the shop', () => {
    // sync.push is one-way and audited; settings.general renames the business
    // and can move this counter's outlet id. They are not the same right.
    expect(cashier.has('sync.push')).toBe(true);
    expect(cashier.has('settings.general')).toBe(false);

    // And that alone opens Settings, where only the sync tab will be there.
    expect(canAccessTab(cashier, 'settings')).toBe(true);
  });

  it('gives the storekeeper stock without selling', () => {
    expect(storekeeper.has('stock.receive')).toBe(true);
    expect(storekeeper.has('supplier.manage')).toBe(true);
    expect(storekeeper.has('pos.sell')).toBe(false);
  });

  it('puts purchase orders with whoever keeps the shelves full', () => {
    expect(canAccessTab(storekeeper, 'purchase-orders')).toBe(true);
    expect(canAccessTab(owner, 'purchase-orders')).toBe(true);
    expect(canAccessTab(cashier, 'purchase-orders')).toBe(false);
  });

  it('treats an unknown tab as ungated rather than forbidden', () => {
    // The map lists what needs a right; a screen absent from it is one that
    // anyone signed in may open, and failing closed here would hide the shell.
    expect(canAccessTab(NO_PERMISSIONS, 'some-future-screen')).toBe(true);
  });

  it('opens a section when any one of its tabs is reachable', () => {
    expect(canAccessAnyTab(cashier, ['expenses', 'installments', 'customers'])).toBe(true);
    expect(canAccessAnyTab(cashier, ['expenses', 'audit-log'])).toBe(false);
  });

  it('names only real codes in the tab map', () => {
    const known = new Set<string>(PERMISSION_CODES);
    const unknown = Object.entries(TAB_PERMISSIONS)
      .flatMap(([tab, codes]) => (codes ?? []).map((code) => `${tab}:${code}`))
      .filter((entry) => !known.has(entry.split(':')[1]));

    // A typo here fails open — the tab would demand a right nobody can hold,
    // or worse, be silently ungated.
    expect(unknown).toEqual([]);
  });
});
