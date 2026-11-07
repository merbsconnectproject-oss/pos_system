/**
 * Weighted average cost — BR-4.
 *
 * `new_avg = ((qty_on_hand × current_avg) + (qty_received × unit_cost)) ÷ (qty_on_hand + qty_received)`
 *
 * Calculated per outlet. The result is what a goods receipt writes to
 * `stock_level.avg_cost`, and what a sale later freezes onto its line (BR-5).
 */
import { roundMoney, roundQuantity } from './money';

export function weightedAverageCost(
  quantityOnHand: number,
  currentAverage: number,
  quantityReceivedBase: number,
  unitCostPerBase: number,
): number {
  const onHand = roundQuantity(quantityOnHand);
  const received = roundQuantity(quantityReceivedBase);
  const total = onHand + received;
  if (total <= 0) return roundMoney(unitCostPerBase);
  return roundMoney((onHand * currentAverage + received * unitCostPerBase) / total);
}

/** A purchase unit cost converted to a per-base-unit cost (FR-UOM-05). */
export function costPerBaseUnit(purchaseUnitCost: number, conversionFactor: number): number {
  return conversionFactor > 0 ? purchaseUnitCost / conversionFactor : purchaseUnitCost;
}
