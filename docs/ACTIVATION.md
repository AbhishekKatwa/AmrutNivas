# Activation Model

Activation measures whether an organization is actually using AMRUT NIVAAS to run their business, not just filling out setup forms. It is based on real usage signals, not form completion.

## Activation State

```typescript
type ActivationState = "NOT_ACTIVATED" | "ACTIVATING" | "ACTIVATED";
```

- **NOT_ACTIVATED** — No meaningful transaction has occurred. The organization may have completed setup, but hasn't run a real business operation.
- **ACTIVATING** — Setup is done, but the first operation is pending. The organization is ready to go live.
- **ACTIVATED** — At least one real business transaction has been recorded (order, reservation, purchase, payment, etc.). The organization is live.

## Activation Signals

Each signal represents a real usage event that contributes to the activation score. Signals are checked against the organization's actual state — not stored, not guessed.

| Signal | Weight | Description | How to Check |
|--------|--------|-------------|--------------|
| Organization configured | 10% | Basic setup complete | Organization exists with name, code, country, currency |
| Property configured | 15% | At least one property exists | `properties` table has rows for this organization |
| Team invited | 10% | At least one team member invited | `organization_memberships` has rows beyond the owner |
| Core module configured | 15% | Primary module set up | Restaurant: menu items exist; Hotel: rooms exist; etc. |
| Operational data added | 15% | Menu, inventory, rooms, suppliers | Module-specific data tables have rows |
| First transaction | 20% | First order, reservation, purchase, payment | Transaction tables have rows (orders, reservations, purchases, payments) |
| Finance configured | 10% | Chart of accounts, tax, payment methods | Finance configuration tables have rows |
| Commerce configured | 5% | Online ordering, QR, direct booking | Commerce configuration tables have rows |

**Total: 100%**

## Activation Score

The activation score is a deterministic percentage based on achieved signals. It is computed on demand from the organization's actual state — never stored, never stale.

```typescript
function calculateActivationScore(
  organizationId: EntityId,
  signals: ActivationSignal[]
): ActivationScore
```

**Example calculation:**

```
Organization configured: ✓ (10%)
Property configured: ✓ (15%)
Team invited: ✗ (0%)
Core module configured: ✓ (15%)
Operational data added: ✗ (0%)
First transaction: ✗ (0%)
Finance configured: ✗ (0%)
Commerce configured: ✗ (0%)

Score: 40%
State: ACTIVATING
```

**Another example:**

```
Organization configured: ✓ (10%)
Property configured: ✓ (15%)
Team invited: ✓ (10%)
Core module configured: ✓ (15%)
Operational data added: ✓ (15%)
First transaction: ✓ (20%)
Finance configured: ✓ (10%)
Commerce configured: ✓ (5%)

Score: 100%
State: ACTIVATED
```

## Signal Details

### Organization Configured (10%)

**Achieved when:** Organization exists with required fields populated.

**Check:**

```typescript
const org = await getOrganization(organizationId);
const achieved = org !== null 
  && org.name !== ""
  && org.code !== ""
  && org.country !== ""
  && org.currency !== "";
```

### Property Configured (15%)

**Achieved when:** At least one property exists for the organization.

**Check:**

```typescript
const properties = await listProperties({ organizationId });
const achieved = properties.length > 0;
```

### Team Invited (10%)

**Achieved when:** At least one team member has been invited (beyond the owner).

**Check:**

```typescript
const members = await listOrganizationMembers({ organizationId });
const achieved = members.filter(m => m.role !== "OWNER").length > 0;
```

### Core Module Configured (15%)

**Achieved when:** The primary module for this business type is set up.

**Check (restaurant):**

```typescript
const menuItems = await listMenuItems({ organizationId });
const achieved = menuItems.length > 0;
```

**Check (hotel):**

```typescript
const rooms = await listRooms({ organizationId });
const achieved = rooms.length > 0;
```

**Check (events):**

```typescript
const venues = await listVenues({ organizationId });
const achieved = venues.length > 0;
```

### Operational Data Added (15%)

**Achieved when:** Module-specific operational data exists.

**Check (restaurant):**

```typescript
const menuItems = await listMenuItems({ organizationId });
const tables = await listTables({ organizationId });
const achieved = menuItems.length > 0 && tables.length > 0;
```

**Check (inventory):**

```typescript
const items = await listInventoryItems({ organizationId });
const achieved = items.length > 0;
```

**Check (procurement):**

```typescript
const suppliers = await listSuppliers({ organizationId });
const achieved = suppliers.length > 0;
```

### First Transaction (20%)

**Achieved when:** At least one real business transaction has been recorded.

**Check (restaurant):**

```typescript
const orders = await listOrders({ organizationId });
const achieved = orders.length > 0;
```

**Check (hotel):**

```typescript
const reservations = await listReservations({ organizationId });
const achieved = reservations.length > 0;
```

**Check (procurement):**

```typescript
const purchases = await listPurchaseOrders({ organizationId });
const achieved = purchases.length > 0;
```

**Check (finance):**

```typescript
const transactions = await listFinanceTransactions({ organizationId });
const achieved = transactions.length > 0;
```

### Finance Configured (10%)

**Achieved when:** Finance configuration is complete.

**Check:**

```typescript
const accounts = await listChartOfAccounts({ organizationId });
const taxConfig = await getTaxConfiguration({ organizationId });
const paymentMethods = await listPaymentMethods({ organizationId });
const achieved = accounts.length > 0 
  && taxConfig !== null 
  && paymentMethods.length > 0;
```

### Commerce Configured (5%)

**Achieved when:** Commerce configuration is complete.

**Check:**

```typescript
const commerceConfig = await getCommerceConfiguration({ organizationId });
const achieved = commerceConfig !== null 
  && (commerceConfig.qrOrdering || commerceConfig.onlineOrdering || commerceConfig.directBooking);
```

## Activation State Transitions

```
NOT_ACTIVATED
    ↓ (score > 0)
ACTIVATING
    ↓ (score >= 100)
ACTIVATED
```

**Rules:**

- State is computed from the score, not stored independently
- `score > 0` → `ACTIVATING`
- `score >= 100` → `ACTIVATED`
- State can never go backward (once ACTIVATED, always ACTIVATED)

## Time to Activation

Track the time from sign-up to activation:

```typescript
const signedUpAt = organization.createdAt;
const activatedAt = activationScore.signals.find(s => s.id === "first_transaction")?.achievedAt;
const timeToActivation = activatedAt 
  ? differenceInDays(new Date(activatedAt), new Date(signedUpAt))
  : null;
```

**Benchmarks:**

- **Fast:** < 7 days
- **Normal:** 7-30 days
- **Slow:** 30-90 days
- **Stalled:** > 90 days

Use this metric for customer success outreach.

## Activation Rate

Percentage of organizations that reach ACTIVATED state:

```typescript
const totalOrganizations = await countOrganizations();
const activatedOrganizations = await countOrganizations({ activationState: "ACTIVATED" });
const activationRate = (activatedOrganizations / totalOrganizations) * 100;
```

**Benchmarks:**

- **Healthy:** > 60%
- **Normal:** 40-60%
- **Low:** < 40%

Use this metric to identify onboarding friction points.

## Platform Admin Visibility

Platform admin dashboard shows activation metrics:

**Summary:**

- Total organizations: 150
- Activated: 92 (61%)
- Activating: 38 (25%)
- Not activated: 20 (14%)

**Organization list:**

| Organization | Signed Up | Activation | Score | First Transaction | Time to Activation |
|--------------|-----------|------------|-------|-------------------|-------------------|
| Hotel ABC | 2026-09-01 | ACTIVATED | 100% | 2026-09-05 | 4 days |
| Restaurant XYZ | 2026-09-15 | ACTIVATING | 65% | — | — |
| Cafe DEF | 2026-10-01 | NOT_ACTIVATED | 0% | — | — |

**Filters:**

- Activation state
- Business type
- Signed up date range
- Time to activation range

## Customer Success Outreach

Use activation state to guide customer success tasks:

**NOT_ACTIVATED for 30+ days:**

- Task: "Call customer"
- Reason: "Signed up 35 days ago, no activation signals"
- Priority: HIGH

**ACTIVATING for 14+ days:**

- Task: "Follow up on first transaction"
- Reason: "Setup complete but no transaction recorded"
- Priority: MEDIUM

**ACTIVATED:**

- Task: "Check in after 7 days"
- Reason: "Ensure smooth operations"
- Priority: LOW

## Onboarding Health

Combine activation state with onboarding progress to determine health:

```typescript
type OnboardingHealth = "HEALTHY" | "PROGRESSING" | "STALLED" | "AT_RISK" | "ACTIVATED";
```

**Rules:**

- `ACTIVATED` — organization is live
- `HEALTHY` — active progress in last 7 days
- `PROGRESSING` — some progress but slow
- `STALLED` — no activity for 7+ days
- `AT_RISK` — signed up but never started

**Example:**

```
Signed up: 2026-10-01
Last activity: 2026-10-07
Completion: 82%
Activation: ACTIVATING

Health: HEALTHY
```

**Another example:**

```
Signed up: 2026-09-15
Last activity: 2026-09-20
Completion: 22%
Activation: NOT_ACTIVATED

Health: STALLED (no activity for 18 days)
```

## Implementation

**Domain layer:**

```typescript
// src/domain/onboarding/types.ts
export type ActivationState = "NOT_ACTIVATED" | "ACTIVATING" | "ACTIVATED";

export type ActivationSignal = {
  id: string;
  label: string;
  weight: number;
  achieved: boolean;
  achievedAt: string | null;
};

export type ActivationScore = {
  organizationId: EntityId;
  state: ActivationState;
  score: number;
  signals: ActivationSignal[];
  computedAt: string;
};
```

**Service layer:**

```typescript
// src/domain/onboarding/onboarding-service.ts
export function calculateActivationScore(
  organizationId: EntityId,
  signals: ActivationSignal[]
): ActivationScore {
  const achievedSignals = signals.filter((s) => s.achieved);
  const score = achievedSignals.reduce((sum, s) => sum + s.weight, 0);

  const state: ActivationState =
    score >= 100 ? "ACTIVATED" : score > 0 ? "ACTIVATING" : "NOT_ACTIVATED";

  return {
    organizationId,
    state,
    score: Math.min(100, score),
    signals,
    computedAt: new Date().toISOString(),
  };
}

export function buildActivationSignals(): ActivationSignal[] {
  return [
    { id: "organization_configured", label: "Organization configured", weight: 10, achieved: false, achievedAt: null },
    { id: "property_configured", label: "Property configured", weight: 15, achieved: false, achievedAt: null },
    { id: "team_invited", label: "Team invited", weight: 10, achieved: false, achievedAt: null },
    { id: "core_module_configured", label: "Core module configured", weight: 15, achieved: false, achievedAt: null },
    { id: "operational_data_added", label: "Operational data added", weight: 15, achieved: false, achievedAt: null },
    { id: "first_transaction", label: "First transaction", weight: 20, achieved: false, achievedAt: null },
    { id: "finance_configured", label: "Finance configured", weight: 10, achieved: false, achievedAt: null },
    { id: "commerce_configured", label: "Commerce configured", weight: 5, achieved: false, achievedAt: null },
  ];
}
```

**Usage:**

```typescript
// Check each signal against actual state
const signals = buildActivationSignals();

const org = await getOrganization(organizationId);
signals[0].achieved = org !== null && org.name !== "";
signals[0].achievedAt = signals[0].achieved ? org.createdAt : null;

const properties = await listProperties({ organizationId });
signals[1].achieved = properties.length > 0;
signals[1].achievedAt = signals[1].achieved ? properties[0].createdAt : null;

// ... check remaining signals

const score = calculateActivationScore(organizationId, signals);
console.log(`Activation: ${score.state} (${score.score}%)`);
```

## Key Principles

1. **Real usage, not form completion** — Activation is based on actual business operations, not setup forms.
2. **Deterministic, not ML** — The score is a simple sum of signal weights. No guessing, no black box.
3. **Computed on demand** — Never store the activation score. Always compute from actual state.
4. **Transparent** — The organization can see which signals are achieved and which are not.
5. **Actionable** — The platform admin can identify stalled organizations and reach out.
6. **Respectful** — Do not punish organizations for not activating. Offer help, not pressure.
