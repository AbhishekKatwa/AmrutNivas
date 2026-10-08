# Supply Chain & Procurement (Prompt #28)

## Overview

ONE intelligence layer built on top of the existing procurement domain (Prompt #07). Provides supplier scorecards, cost analytics, anomaly detection, stockout risk alerts, and procurement operations dashboards — without duplicating any supplier, purchase order, inventory, or finance data.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  UI Pages (4)                        │
│  ProcurementDashboard  Supplier360  Intelligence     │
│  ProcurementCalendar                                  │
├─────────────────────────────────────────────────────┤
│           supply-chain-service.ts                    │
│  Scorecards │ Issues │ Contracts │ Plans │ Anomalies │
│  Stockout Risks │ Reorder Suggestions │ Price Changes│
├─────────────────────────────────────────────────────┤
│           Existing Procurement Domain                │
│  Suppliers │ PurchaseOrders │ GoodsReceipts          │
│  PurchaseInvoices │ SupplierPayments │ PurchaseReqs  │
├─────────────────────────────────────────────────────┤
│           Existing Inventory Domain                  │
│  Stock ledger │ Items │ Movements                    │
└─────────────────────────────────────────────────────┘
```

## In-Memory Stores

All intelligence data lives in in-memory Maps (same pattern as revenue pricing-service):

- `scorecards` — Supplier performance scorecards
- `issues` — Supplier issue tracker
- `contracts` — Supplier contracts
- `purchasePlans` — Purchase planning documents
- `anomalies` — Cost anomaly detections
- `stockoutRisks` — Stockout risk assessments
- `reorderSuggestions` — Reorder quantity calculations
- `priceChanges` — Supplier price change history
- `calendarEvents` — Procurement calendar events

## Routes

| Path | Component | Permission |
|------|-----------|------------|
| `/procurement` | ProcurementDashboard | `supply_chain.view` |
| `/procurement/intelligence` | ProcurementIntelligencePage | `supply_chain.intelligence.view` |
| `/procurement/suppliers/:supplierId` | Supplier360Page | `supply_chain.supplier.view` |
| `/procurement/calendar` | ProcurementCalendarPage | `supply_chain.calendar.view` |

## Permissions

13 permission keys in the `supply_chain` domain:

| Key | Description |
|-----|-------------|
| `supply_chain.view` | View procurement dashboard |
| `supply_chain.intelligence.view` | View cost intelligence |
| `supply_chain.supplier.view` | View supplier 360 |
| `supply_chain.issue.view` | View supplier issues |
| `supply_chain.issue.create` | Create supplier issues |
| `supply_chain.issue.resolve` | Resolve/close issues |
| `supply_chain.contract.view` | View contracts |
| `supply_chain.contract.create` | Create contracts |
| `supply_chain.plan.view` | View purchase plans |
| `supply_chain.plan.create` | Create purchase plans |
| `supply_chain.plan.approve` | Approve purchase plans |
| `supply_chain.calendar.view` | View procurement calendar |
| `supply_chain.anomaly.view` | View cost anomalies |

## Navigation

Phase 14 — "Supply Chain" group with 3 destinations:
- Dashboard (`/procurement`)
- Intelligence (`/procurement/intelligence`)
- Calendar (`/procurement/calendar`)

## Design Principles

1. **ONE supplier system** — reads existing `Supplier` records, never creates a parallel registry
2. **ONE procurement system** — reads existing POs, GRNs, invoices; intelligence is additive
3. **ONE inventory ledger** — stockout risks reference existing items, never a second stock table
4. **ONE finance/AP system** — spend analytics derive from existing purchase invoices
5. **No ML** — all scoring and anomaly detection is deterministic and transparent
6. **No autonomous purchasing** — suggestions are "suggested review", the owner decides

## Seed Data

`ensureSupplyChainDemoSeeded(orgId, propId)` creates demo data idempotently:
- 3 supplier scorecards (delivery, quality, price metrics)
- 1 open supplier issue (late delivery investigation)
- 1 active contract (rice supply with price terms)
- 2 price changes (basmati rice increase, packaging decrease)
- 2 stockout risks (high risk on cooking oil, medium on spices)
- 1 reorder suggestion (50kg basmati rice)
- 2 cost anomalies (chicken price spike, packaging cost increase)
