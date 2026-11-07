/**
 * FR-OUT-03/05: which records belong to the branch on screen.
 *
 * One line of logic, but it was written out by hand in every view that shows a
 * list — and a list that forgets it shows one branch's takings inside another's,
 * which is the acceptance criterion for outlets. Stated once here so the rule can
 * be tested, and so a new screen inherits it rather than reinventing it.
 *
 * The server scopes every query as well. This is not a substitute for that: it is
 * what keeps an already-loaded list honest when the user switches branch.
 */

/** The sentinel the outlet selector uses for the combined view. */
export const ALL_OUTLETS = 'all-outlets';

/** A record that belongs to a branch. Most do; parties like customers do not. */
export interface OutletScoped {
  outletId?: string | null;
}

/**
 * True when a record should be visible with this outlet selected.
 *
 * <p>A record with no outlet — a supplier serving the whole business — is visible
 * everywhere, because hiding it would make it unreachable from any branch.
 */
export function belongsToOutlet(record: OutletScoped, outletId: string): boolean {
  if (outletId === ALL_OUTLETS) return true;
  if (record.outletId === null || record.outletId === undefined) return true;
  return record.outletId === outletId;
}

/** Filters a list to the selected branch. */
export function forOutlet<T extends OutletScoped>(records: T[], outletId: string): T[] {
  return records.filter((record) => belongsToOutlet(record, outletId));
}
