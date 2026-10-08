# Supplier Management

## Supplier 360 Page

Route: `/procurement/suppliers/:supplierId`
Permission: `supply_chain.supplier.view`

The Supplier 360 is a single-page supplier profile that consolidates all intelligence about one supplier: performance score, order history, open issues, active contracts, price changes, and supplied items.

## Performance Scorecard

Each supplier has a deterministic scorecard (0–100) with five equally-weighted components:

| Component | Weight | Calculation |
|-----------|--------|-------------|
| Delivery | 20% | On-time delivery rate from goods receipts |
| Fill Rate | 20% | Ordered vs accepted quantity ratio |
| Quality | 20% | Accepted vs rejected quantity ratio |
| Price Stability | 20% | Inverse of price change frequency |
| Invoice Accuracy | 20% | Matched vs mismatched invoice count |

The overall score is the weighted average. All inputs come from existing procurement domain records (goods receipts, purchase orders, invoices) — no separate data entry.

### Score Components

```typescript
interface SupplierScoreComponent {
  score: number;       // 0–100
  weight: number;      // 0.2 each
  metric: string;      // human-readable metric name
  detail: string;      // supporting detail
}
```

### Quality Summary

The scorecard also tracks raw counts:
- `acceptedQuantity` — total qty accepted across all GRNs
- `rejectedQuantity` — total qty rejected
- `invoiceMatchCount` — invoices matching PO totals
- `invoiceMismatchCount` — invoices with discrepancies

## Supplier Issues

Route: `/procurement/suppliers/:supplierId` (Issues tab)
Permissions: `supply_chain.issue.view`, `supply_chain.issue.create`, `supply_chain.issue.resolve`

Issue lifecycle: **OPEN → INVESTIGATING → RESOLVED → CLOSED**

### Issue Types

| Type | Description |
|------|-------------|
| `LATE_DELIVERY` | Goods arrived after expected date |
| `QUALITY_REJECTION` | Goods failed quality inspection |
| `QUANTITY_SHORT` | Delivered less than ordered |
| `INVOICE_MISMATCH` | Invoice doesn't match PO/GRN |
| `DAMAGED_GOODS` | Goods arrived damaged |
| `WRONG_ITEM` | Delivered different item than ordered |
| `COMMUNICATION` | Poor communication or responsiveness |
| `OTHER` | Unclassified issue |

### Severity Levels

- `LOW` — Minor inconvenience, no operational impact
- `MEDIUM` — Noticeable impact, workaround exists
- `HIGH` — Significant operational disruption
- `CRITICAL` — Blocks operations, immediate action needed

## Supplier Contracts

Route: `/procurement/suppliers/:supplierId` (Contracts tab)
Permissions: `supply_chain.contract.view`, `supply_chain.contract.create`

Lightweight contract records linking a supplier to agreed terms:

- Contract number, start/end dates
- Payment terms (e.g., "Net 30")
- Price terms (fixed, variable, formula-based)
- Delivery schedule
- Status: `DRAFT → ACTIVE → EXPIRING → EXPIRED → TERMINATED`

### Contract Expiry Alerts

Contracts within 30 days of expiry are flagged as `EXPIRING` and surface in the procurement dashboard attention center.

## Data Flow

```
Existing Domain Records
  │
  ├── PurchaseOrders ────────┐
  ├── GoodsReceipts ─────────┤
  ├── PurchaseInvoices ──────┼──→ calculateSupplierScorecard()
  ├── Suppliers ─────────────┤        │
  │                          │        ▼
  │                          │   SupplierScorecard
  │                          │
  │                          ├──→ getSupplier360()
  │                                │
  │                                ▼
  │                          Supplier360Data
  │                          (scorecard + orders + issues +
  │                           contracts + prices + items)
  │
  └── (manual entry) ────────→ SupplierIssue
                               SupplierContract
```
