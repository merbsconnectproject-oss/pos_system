# Reports Screen Audit

Source of truth: `SCREEN-INVENTORY.md` section I, `PRD (1).md` FR-RPT, and `CHECKLIST.md` Phase 7.

## Implemented in this stage

- `I-01` Report index with Sales, Stock, Cash, and Control groups.
- `I-02` Sales summary with outlet and date-range controls.
- `I-03` Sales by product.
- `I-04` Sales by category entry point.
- `I-05` Sales by cashier entry point through the sales reporting group.
- `I-06` Sales by customer entry point through the sales reporting group.
- `I-07` Gross profit and frozen-cost COGS for permitted roles only.
- `I-08` Best sellers entry point through the sales group.
- `I-09` Slow movers entry point through the stock group.
- `I-10` Stock on hand and `I-11` stock movement summary.
- `I-12` Payment method breakdown.
- `I-13` Discount/override and `I-14` void/refund control-log entry point.
- `I-15` Purchases report entry point through the control group.
- `I-16` Shared outlet and date-range filter controls.
- `I-17` No-data state for report tables.

## Navigation

Added one top-level `Business Reports` sidebar item. Report families are horizontal tabs. The existing AI Analytics screen remains available as a separate executive analysis surface.

## Remaining hardening

Dedicated server-backed report queries, export generation, chart-specific category/cashier/customer breakdowns, and `report.view` permission middleware still require the data/API layer.
