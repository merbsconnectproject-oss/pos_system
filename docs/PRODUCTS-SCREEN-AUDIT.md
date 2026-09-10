# Products Screen Audit

Source of truth: `docs/SCREEN-INVENTORY.md` section D, with PRD sections 5.3, 5.4, and 5.5.

## Sidebar Mapping

No sidebar items were removed.

Primary sidebar entry:

| Feature area | Sidebar status | Notes |
|---|---:|---|
| Product catalogue | Existing | Main catalogue remains available as `Product Catalogue`. |
| Product import | Horizontal tab | Required by D-12 through D-16 and FR-PROD-10; available inside Product Catalogue. |
| Catalogue setup | Horizontal tab | Groups D-09, D-10, and D-11 inside Product Catalogue. |
| Bulk price update | Horizontal tab | S2 screen D-20 remains available inside Product Catalogue without expanding the sidebar. |

## Implementation Status

| ID | Screen | Status | Application surface |
|---|---|---:|---|
| D-01 | Product list | Implemented | Search, category, brand, stock-status and outlet filters; table with checkbox, thumbnail/name, SKU/barcode, category/brand, unit, price, stock, status and row actions. |
| D-02 | Product detail | Implemented | Drawer with image, SKU/barcode, classification, pricing, units/barcodes and stock by outlet. |
| D-03 | Add product | Implemented | Sectioned modal for identity, classification, units, barcode, pricing, stock settings and image. |
| D-04 | Edit product | Implemented | Same form opens prefilled and updates the product. |
| D-05 | Units and conversions | Implemented | Base unit plus extra selling unit with factor and price override. |
| D-06 | Barcodes | Partial | Primary barcode is editable and shown against the base unit. Multiple barcode rows need a normalized `product_barcode` model. |
| D-07 | Pricing panel | Implemented | Cost, retail, trade, floor and live margin shown in the form. |
| D-08 | Price history | Implemented demo | Price history modal is available from product detail; persistence needs backend price history. |
| D-09 | Categories | Implemented demo | Catalogue setup page lists categories with counts and actions. |
| D-10 | Brands | Implemented demo | Catalogue setup page lists brands with counts and actions. |
| D-11 | Units of measure | Implemented demo | Catalogue setup page lists unit names with usage counts and actions. |
| D-12 | Import - upload | Implemented demo | Import page upload/drop-zone state. |
| D-13 | Import - mapping | Implemented demo | Column mapping state. |
| D-14 | Import - validation | Implemented demo | Validation/error state. |
| D-15 | Import - preview | Implemented demo | Create/update/skip preview state. |
| D-16 | Import - result | Implemented demo | Completion state with result counts. |
| D-17 | Product list empty | Implemented | Empty catalogue state with add/import direction. |
| D-18 | Search no results | Implemented | No-match state with clear-filters action. |
| D-19 | Deactivate product | Existing | Active toggle preserves records and hides inactive items from POS. |
| D-20 | Bulk price update | Implemented demo | S2 repricing workspace with filters and affected-count preview. |
| D-21 | Variants | Deferred | S2 variant matrix needs a parent/variant data model. |

## Notes For Next Pass

- The current frontend exposes Product sub-screens through a horizontal tab bar under the Product Catalogue page to keep the sidebar compact.
- Demo-only catalogue setup and import states are UI-complete, but real persistence requires backend tables for `category`, `brand`, `unit`, `product_unit`, `product_barcode`, and `price_history`.
- Multiple barcodes and variants should be implemented with normalized records before becoming production data mutations.
