import { describe, expect, it } from 'vitest';
import { stateOf } from '../components/UserPermissionsModal';
import { resolvePermissions } from '../permissions';
import type { PermissionCode, PermissionOverrides } from '../permissions';

/**
 * FR-USER-03 · BR-16: three states, and the third one matters.
 *
 * <p>"Withheld" and "not granted by the role" look identical on a screen and
 * are not the same fact. Only the first should survive the role later gaining
 * the permission, which is why clearing an override is its own action rather
 * than setting it to false.
 */
describe('per-user permission overrides', () => {
  const cashier: PermissionCode[] = ['pos.sell', 'sale.discount'];

  it('reads a granted override as granted', () => {
    expect(stateOf('sale.void', { 'sale.void': true })).toBe('granted');
  });

  it('reads a withheld override as withheld, not as absent', () => {
    expect(stateOf('sale.discount', { 'sale.discount': false })).toBe('withheld');
  });

  it('reads no override as the role default', () => {
    expect(stateOf('sale.void', {})).toBe('default');
    expect(stateOf('sale.void', undefined)).toBe('default');
  });

  it('grants a permission the role lacks', () => {
    const overrides: PermissionOverrides = { 'sale.void': true };
    expect(resolvePermissions(cashier, overrides).has('sale.void')).toBe(true);
  });

  it('withholds a permission the role has', () => {
    const overrides: PermissionOverrides = { 'sale.discount': false };
    expect(resolvePermissions(cashier, overrides).has('sale.discount')).toBe(false);
  });

  it('clearing the override returns the person to their role', () => {
    // The whole reason the third state exists: a permission cleared back to
    // default follows the role if the role changes, while a withheld one does
    // not. Collapsing the two would silently re-grant it.
    expect(resolvePermissions(cashier, {}).has('sale.discount')).toBe(true);
    expect(resolvePermissions(cashier, {}).has('sale.void')).toBe(false);
  });

  it('applies a withholding even when the role later gains the permission', () => {
    const promoted: PermissionCode[] = [...cashier, 'sale.void'];
    expect(resolvePermissions(promoted, { 'sale.void': false }).has('sale.void')).toBe(false);
    expect(resolvePermissions(promoted, {}).has('sale.void')).toBe(true);
  });
});
