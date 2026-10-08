# Procurement Intelligence

## Dashboard

Route: `/procurement`
Permission: `supply_chain.view`

The procurement dashboard is the operational landing page. It shows:

### Primary KPIs
- **Open POs** — count and total value of purchase orders not yet received
- **Overdue** — POs past their expected delivery date
- **Pending Approval** — purchase requests awaiting review
- **Outstanding Payable** — total unpaid invoice amount

### Secondary KPIs
- **Open Issues** — supplier issues not yet resolved
- **Price Increases** — recent supplier price increases
- **Stockout Risks** — items at risk of running out
- **Contracts Expiring** — contracts within 30 days of expiry

### Attention Center

Prioritized list of actionable items. Each attention item has:
- Priority: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`
- Category: `STOCKOUT`, `PRICE_INCREASE`, `OVERDUE_PO`, `CONTRACT_EXPIRY`, `ISSUE`, `APPROVAL`
- Title, description, and suggested action

## Intelligence Page

Route: `/procurement/intelligence`
Permission: `supply_chain.intelligence.view`

Deep analytics on procurement spend, supplier concentration, and cost risks.

### Spend Analytics

- **Total Purchase Spend** — sum of all purchase invoice amounts
- **Spend by Supplier** — breakdown with progress bars showing each supplier's share
- **Spend by Category** — breakdown by supplier type (raw materials, packaging, etc.)

### Supplier Concentration

- **Single Supplier Risk** — items sourced from only one supplier
- Each risk entry shows: item name, current supplier, monthly spend, risk level
- High-risk items (sole-source with high spend) are flagged for diversification

### Cost Monitoring

- **Top Cost Items** — items with highest total purchase spend
- **Recent Price Changes** — supplier price increases and decreases
- **Cost Anomalies** — detected unusual price movements

### Stockout Risk

- **Risk List** — items at risk of running out of stock
- Each risk shows: item name, current stock, days of stock remaining, risk level
- Linked reorder suggestions with calculated quantities

## Cost Anomaly Detection

Deterministic anomaly detection based on price deviation thresholds:

| Anomaly Type | Trigger |
|--------------|---------|
| `PRICE_SPIKE` | Item price increased >15% in 30 days |
| `VOLUME_ANOMALY` | Order quantity >2x average |
| `NEW_SUPPLIER_PREMIUM` | New supplier charges >10% above existing rate |
| `SEASONAL_DEVIATION` | Price outside expected seasonal range |

Each anomaly records:
- Item and supplier involved
- Previous and current rates
- Deviation percentage
- Detection date
- Status: `DETECTED → ACKNOWLEDGED → RESOLVED`

## Stockout Risk Detection

Calculates days-of-stock-remaining based on:
- Current stock level (from inventory domain)
- Average daily consumption (from recent goods receipts)
- Open PO quantity (expected incoming stock)
- Supplier lead time (days)

Risk levels:
- `CRITICAL` — <3 days of stock remaining
- `HIGH` — 3–7 days remaining
- `MEDIUM` — 7–14 days remaining
- `LOW` — >14 days remaining

## Reorder Suggestions

Deterministic reorder quantity calculation:

```
suggestedQty = consumptionDuringLeadTime + safetyStock - currentStock - openPOQuantity
suggestedQty = max(suggestedQty, minimumOrderQuantity)
```

Where:
- `consumptionDuringLeadTime` = avg daily consumption × lead time days
- `safetyStock` = configurable buffer (default: 3 days of consumption)
- `currentStock` = current inventory on hand
- `openPOQuantity` = quantity already on order
- `minimumOrderQuantity` = supplier's minimum order constraint

## Procurement Calendar

Route: `/procurement/calendar`
Permission: `supply_chain.calendar.view`

Unified timeline of procurement events:

| Event Type | Source |
|------------|--------|
| `DELIVERY` | Expected delivery dates from open POs |
| `PO_DUE` | Purchase order due dates |
| `CONTRACT_EXPIRY` | Contract end dates |
| `PAYMENT_DUE` | Invoice payment due dates |
| `FOLLOW_UP` | Supplier issue follow-up dates |

Events are grouped by date with relative labels (Today, Tomorrow, etc.) and color-coded by type.

## Price Comparison

`compareSupplierPrices(itemId)` finds all suppliers that have supplied a given item and compares their latest rates. Useful for identifying cheaper alternatives when a price increase is detected.

## Cost Volatility

`getItemCostVolatility(itemId)` calculates price volatility metrics for an item across all suppliers:
- Minimum, maximum, and average rate
- Standard deviation
- Coefficient of variation (volatility score)
- Number of distinct suppliers

High volatility items may benefit from fixed-price contracts or supplier diversification.
