# Inventory Screen Audit

Source of truth: `docs/SCREEN-INVENTORY.md` section E, with PRD section 5.6.

## Sidebar Mapping

No sidebar items were removed.

Primary sidebar entries:

| Feature area | Sidebar status | Notes |
|---|---:|---|
| Stock on hand | Added | Main inventory page required by E-01. |
| Low stock | Horizontal tab | Required by E-10 and FR-INV-08; available inside Stock On Hand. |
| Inventory valuation | Horizontal tab | Required by E-11 and FR-INV-09; available inside Stock On Hand. |
| Inventory exceptions | Horizontal tab | Required by E-12 and FR-INV-10; available inside Stock On Hand. |
| Stock count | Horizontal tab | S2 screen E-14 remains available inside Stock On Hand without expanding the sidebar. |
| Stock transfer | Horizontal tab | S3 screen E-15 remains available inside Stock On Hand without expanding the sidebar. |
| Movement history | Existing | `Stock Movements` remains available for E-03. |
| Receive stock | Existing | `Goods Receipt (GRN)` remains available for E-04 through E-06. |

## Implementation Status

| ID | Screen | Status | Application surface |
|---|---|---:|---|
| E-01 | Stock on hand | Implemented | Outlet-scoped inventory table with product, category, quantity, reorder level, status and cost valuation. |
| E-02 | Stock detail | Implemented | Drawer with per-outlet stock, valuation and recent movement ledger. |
| E-03 | Movement history | Existing | `StockMovementsView` filters movement ledger by type and search. |
| E-04 | Receive stock | Existing | `GoodsReceiptModal` captures supplier, reference, product, quantity and unit cost. |
| E-05 | Receive confirm | Existing | GRN modal previews resulting stock and weighted average cost before posting. |
| E-06 | Receive complete | Partial | Posting closes the modal and writes stock/movement state; dedicated completion state can be deepened later. |
| E-07 | Stock adjustment | Existing | `StockAdjustmentModal` captures product, current quantity, new physical count, mandatory reason and note. |
| E-08 | Adjustment approval | Partial | Large-change approval rule still needs configured threshold and approver PIN integration. |
| E-09 | Damage / write-off | Existing partial | Damage reason posts `DAMAGE` movement; dedicated write-off page is not yet separate from adjustment modal. |
| E-10 | Low stock | Implemented | Low-stock page filters items at or below reorder level. |
| E-11 | Valuation | Implemented | Per-outlet and combined valuation at weighted average cost. |
| E-12 | Exceptions | Implemented demo | Exceptions view lists oversells, write-offs and large adjustment candidates from movement data. |
| E-13 | No stock movement | Implemented | Stock detail drawer shows no-movement state with receive-stock guidance. |
| E-14 | Stock count | Implemented placeholder | S2 workflow surface shows count lifecycle steps; batch posting still deferred. |
| E-15 | Transfer | Implemented placeholder | S3 transfer surface shows despatch/receive structure; transfer workflow is deferred by PRD assumptions. |

## Notes For Next Pass

- Inventory sub-screens are now exposed through a horizontal tab bar under the Stock On Hand page to keep the sidebar compact.
- Stage 1 inventory coverage is mostly UI-complete on the frontend. Production integrity still depends on backend movement-ledger persistence and a reconciliation job proving stock equals movement sums.
- Stock count and transfers are intentionally marked as S2/S3 surfaces, matching the inventory screen roadmap.
