# Suppliers Screen Audit

Source of truth: `docs/SCREEN-INVENTORY.md` section F, with PRD section 5.11.

## Sidebar Mapping

No sidebar items were added or removed.

| Feature area | Sidebar status | Notes |
|---|---:|---|
| Supplier directory | Existing | `Suppliers Directory` remains the main sidebar entry. |
| Supplier receipt history | Horizontal tab | Available inside Suppliers to avoid sidebar expansion. |
| Purchase orders | Horizontal tab | S2 surface is available inside Suppliers. |
| Supplier balances | Horizontal tab | S2 surface is available inside Suppliers. |
| Goods receipt detail | Existing adjacent route | `Goods Receipt (GRN)` remains in Inventory & Stock because receiving affects stock. |

## Implementation Status

| ID | Screen | Status | Application surface |
|---|---|---:|---|
| F-01 | Supplier list | Implemented | Supplier table with search, outlet filter, contact, terms, last receipt, total purchased and actions. |
| F-02 | Supplier detail | Implemented | Drawer with contact block, terms and products supplied. |
| F-03 | Add supplier | Implemented | Design-system modal with supplier identity, contact, terms, product line, outlet and address. |
| F-04 | Edit supplier | Implemented | Same modal opens prefilled and updates the supplier. |
| F-05 | Receipt history | Implemented demo | Horizontal tab lists posted receipt movements. |
| F-06 | Goods receipt detail | Existing partial | Goods receipt records are represented by immutable stock movements; full posted-document detail can be deepened later. |
| F-07 | Supplier empty | Implemented | Empty state appears with add-supplier action. |
| F-08 | Purchase orders | Implemented placeholder | S2 purchase order workspace is represented. |
| F-09 | Supplier balances | Implemented placeholder | S2 supplier balance cards are represented pending invoice/payment model. |

## Notes For Next Pass

- The sidebar remains compact with one supplier entry.
- Production supplier balances and purchase orders need invoice, payment and PO tables before they can become true transactional screens.
