# Point Of Sale Screen Audit

Source of truth: `docs/SCREEN-INVENTORY.md` section C, with PRD sections 5.7, 5.8, 5.9, and 5.10.

## Sidebar Mapping

No sidebar items were removed.

| Feature area | Sidebar status | Notes |
|---|---:|---|
| POS terminal | Present | `Open Terminal` launches the full-width POS modal, matching FR-POS-01. |
| Transaction lookup, receipt detail, void flow | Present | `Receipts & Voids` opens `SalesHistoryView`. |
| Shift open / close | Present | `Cashier Shifts` opens `ShiftsModal`. |
| Returns / swaps | Present | `Returns & Swaps` opens the S2 returns module. |
| Customer attach / trade pricing | Present | `Customers (Trade)` exposes the customer directory; POS also has inline attach/create. |
| Barcode assignment support | Present via catalogue | `Product Catalogue` is the correct persistent destination for product/barcode maintenance. |

## Implementation Status

| ID | Screen | Status | Application surface |
|---|---|---:|---|
| C-01 | POS main | Implemented | `PosModal` full-screen terminal without app sidebar; header, product grid, customer row, discount, total, hold, clear, payment. |
| C-02 | Search results | Implemented | Search dropdown with name, SKU, unit, price, stock. |
| C-03 | No results | Implemented | Empty search result state with catalogue create link. |
| C-04 | Unit picker | Implemented | Selling-unit modal with conversion and price. |
| C-05 | Line editor | Partial | Quantity stepper, numeric quantity, price edit, remove, floor-price approval. Unit switching and per-line discount remain deeper cart-line work. |
| C-06 | Discount entry | Implemented | Cart discount modal with max discount and resulting total. |
| C-07 | Below-floor approval | Implemented | Manager PIN modal for price below floor. |
| C-08 | Approval refused | Implemented | Existing `ManagerPinModal` refusal state. |
| C-09 | Attach customer | Implemented | Customer modal with phone search, results, walk-in clear. |
| C-10 | Quick create customer | Implemented | Inline create with name, phone, type, then attaches to cart. |
| C-11 | Payment method | Implemented | Cash, MoMo, card, transfer, split tabs. |
| C-12 | Cash payment | Implemented | Tendered amount, denominations, calculated change. |
| C-13 | Mobile money payment | Implemented | Provider, phone, reference, received confirmation. |
| C-14 | Card / transfer payment | Implemented | Reference and received confirmation for both modes. |
| C-15 | Split payment | Partial | Cash + MoMo split with total validation. Dynamic multi-row methods remain backend/data-model work. |
| C-16 | Sale complete | Implemented | Large change due, receipt number, print status, New Sale, Reprint/Print, Email/Skip. |
| C-17 | Receipt preview | Implemented | Clean digital receipt preview with itemized, financial, and payment sections. |
| C-18 | Print failed | Partial | UI supports failed state if browser print throws. Local ESC/POS print-service retry queue is backend/hardware work. |
| C-19 | Unknown barcode | Implemented | Inline strip with scanned code context. |
| C-20 | Assign barcode | Deferred | Product edit/barcode management belongs to section D. Sidebar already exposes Product Catalogue. |
| C-21 | Out of stock | Partial | Inline out-of-stock strip exists. Oversell permission path is not implemented. |
| C-22 | Held sales | Implemented | Drawer with label, line count, total, held time, resume/delete. |
| C-23 | Hold sale | Implemented | Modal with optional label and confirmation. |
| C-24 | Empty cart | Implemented | Centered icon and instruction state in checkout panel. |
| C-25 | Transaction lookup | Existing | `SalesHistoryView` via `Receipts & Voids`. |
| C-26 | Sale detail | Existing | Sales history drawer/detail surface. |
| C-27 | Void sale | Existing | Void modal/approval flow in sales history. |
| C-28 | Void complete | Existing | Void status is reflected in sales history. |
| C-29 | Open shift | Existing | `ShiftsModal` open-shift flow. |
| C-30 | No open shift | Implemented | POS blocks selling and routes to open shift. |
| C-31 | Close shift - count | Existing | `ShiftsModal` close/count flow. |
| C-32 | Close shift - result | Existing | Variance result/note flow. |
| C-33 | Offline banner | Deferred | Needs sync engine/offline queue implementation. |
| C-34 | Sync recovered | Deferred | Needs sync engine/offline queue implementation. |
| C-35 | Return / refund | Existing S2 | `ReturnsExchangesView` via sidebar. |
| C-36 | Credit note | Existing S2 partial | Returns module has credit/exchange handling; receipt-grade credit note modal can be deepened later. |

## Notes For Next Pass

- POS-specific transient surfaces stay inside the full-screen terminal by design, so they should not become separate sidebar items.
- Persistent operational modules from section C are already in the sidebar. No removal was made.
- Backend gaps are mainly offline queueing, local printer retry integration, dynamic split payment rows, barcode assignment persistence, and oversell permission enforcement.
