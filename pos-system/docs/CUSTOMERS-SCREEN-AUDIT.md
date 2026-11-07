# Customers Screen Audit

Source of truth: `docs/SCREEN-INVENTORY.md` section G, with PRD section 5.12.

## Sidebar Mapping

No sidebar items were added or removed.

| Feature area | Sidebar status | Notes |
|---|---:|---|
| Customer directory | Existing | `Customers (Trade)` remains the main sidebar entry. |
| Customer purchase history | Horizontal tab | Available inside Customers to avoid sidebar expansion. |
| Customer types | Horizontal tab | Available inside Customers as price-level mapping. |
| Credit accounts | Horizontal tab | S2 surface is available inside Customers. |

## Implementation Status

| ID | Screen | Status | Application surface |
|---|---|---:|---|
| G-01 | Customer list | Implemented | Searchable customer table with phone, type, price tier, lifetime spend and purchase count. |
| G-02 | Customer detail | Implemented | Drawer with contact, type, price level and purchase history across outlets. |
| G-03 | Add customer | Implemented | Design-system modal with name, phone, email, address, type and notes. |
| G-04 | Edit customer | Implemented | Same modal opens prefilled and updates the customer. |
| G-05 | Purchase history | Implemented | Horizontal tab lists customer-linked sales with outlet and receipt details. |
| G-06 | Customer types | Implemented demo | Horizontal tab shows type-to-price-level mappings. |
| G-07 | Customer empty | Implemented | Empty state clarifies walk-in sales do not require a customer. |
| G-08 | Credit account | Implemented placeholder | S2 credit-account workspace is represented pending credit ledger model. |

## Notes For Next Pass

- The sidebar remains compact with one customer entry.
- Full credit accounts need credit limit, ageing, statement and part-payment tables before becoming production transactional screens.
