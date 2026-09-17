import { describe, expect, it } from 'vitest';
import { ALL_OUTLETS, belongsToOutlet, forOutlet } from '../outletScope';

/**
 * FR-OUT acceptance: with Outlet A selected, no Outlet B record appears.
 *
 * The rule is small enough to look obvious and was written out by hand in every
 * list on the system, which is exactly how one of them ends up missing it.
 */
describe('outlet scoping', () => {
  const inco = { outletId: 'inco-hardware' };
  const radiance = { outletId: 'radiance-lighting' };
  const business = { outletId: null };

  it("hides another branch's records", () => {
    expect(belongsToOutlet(radiance, 'inco-hardware')).toBe(false);
  });

  it("shows the selected branch's own records", () => {
    expect(belongsToOutlet(inco, 'inco-hardware')).toBe(true);
  });

  it('shows everything under the combined view', () => {
    expect(belongsToOutlet(inco, ALL_OUTLETS)).toBe(true);
    expect(belongsToOutlet(radiance, ALL_OUTLETS)).toBe(true);
  });

  it('keeps business-wide records visible from every branch', () => {
    // A supplier serving both shops has no outlet. Scoping it away would make it
    // reachable from nowhere.
    expect(belongsToOutlet(business, 'inco-hardware')).toBe(true);
    expect(belongsToOutlet({}, 'inco-hardware')).toBe(true);
  });

  it('filters a list to the branch on screen', () => {
    const rows = [inco, radiance, business];
    expect(forOutlet(rows, 'inco-hardware')).toEqual([inco, business]);
    expect(forOutlet(rows, ALL_OUTLETS)).toEqual(rows);
  });
});
