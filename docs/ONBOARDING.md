# Onboarding & Activation

AMRUT NIVAAS onboarding is an orchestration layer that guides hospitality businesses from sign-up to live operations. It is not a second source of truth — it reads the organization's actual state (properties, outlets, modules, team, transactions) and presents it as a guided setup experience.

## Philosophy

Onboarding is progressive, not a 40-step form:

```
Sign Up
   ↓
Create Organization
   ↓
Understand Business
   ↓
Create First Property
   ↓
Configure Core Operations
   ↓
Invite Team
   ↓
Load Essential Data
   ↓
Run First Transaction
   ↓
Business Is LIVE
```

The system guides the user through each step, but never forces them through everything at once. Optional steps can be skipped and completed later via contextual prompts.

## Onboarding State

### OnboardingProfile

Persistent progress tracking for each organization:

```typescript
type OnboardingProfile = {
  id: EntityId;
  organizationId: EntityId;
  status: OnboardingStatus;
  currentStep: string | null;
  completionPercentage: number;
  businessSize: BusinessSize | null;
  businessGoals: BusinessGoal[];
  startedAt: string | null;
  completedAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

**Statuses:**

- `NOT_STARTED` — default after sign-up
- `IN_PROGRESS` — wizard has been entered
- `READY_TO_LAUNCH` — critical setup done, first transaction pending
- `COMPLETED` — business is live
- `SKIPPED` — owner chose to bypass guided setup

### Business Context

During onboarding, capture:

**Business Type** (multiple selections allowed):

- RESTAURANT, CAFE, HOTEL, LODGE, RESORT, BANQUET
- CLOUD_KITCHEN, RESTAURANT_HOTEL, MIXED_HOSPITALITY

**Business Size** (ranges, not exact counts):

- Properties: 1, 2-5, 6-20, 21-50, 50+
- Outlets: 1, 2-5, 6-20, 21-50, 50+
- Rooms (if hotel): 1, 2-5, 6-20, 21-50, 50+
- Employees: 1, 2-5, 6-20, 21-50, 50+

**Primary Business Goals** (multiple selections):

- RESTAURANT_POS, HOTEL_OPERATIONS, INVENTORY, PROCUREMENT
- FINANCE, EVENTS, EMPLOYEES, CUSTOMER_MANAGEMENT
- ONLINE_ORDERING, DIRECT_BOOKINGS, MULTI_PROPERTY_MANAGEMENT, ALL_IN_ONE

Use this information to prioritize onboarding recommendations and module activation order.

## Activation Model

Activation is based on real usage, not form completion.

### ActivationState

```typescript
type ActivationState = "NOT_ACTIVATED" | "ACTIVATING" | "ACTIVATED";
```

- `NOT_ACTIVATED` — no meaningful transaction has occurred
- `ACTIVATING` — setup is done but first operation is pending
- `ACTIVATED` — at least one real business transaction has been recorded

### Activation Signals

Real usage events that contribute to the activation score:

| Signal | Weight | Description |
|--------|--------|-------------|
| Organization configured | 10% | Basic setup complete |
| Property configured | 15% | At least one property exists |
| Team invited | 10% | At least one team member invited |
| Core module configured | 15% | Primary module (restaurant/hotel) set up |
| Operational data added | 15% | Menu items, inventory, rooms, etc. |
| First transaction | 20% | First order, reservation, purchase, payment |
| Finance configured | 10% | Chart of accounts, tax, payment methods |
| Commerce configured | 5% | Online ordering, QR, direct booking |

### Activation Score

Deterministic percentage based on achieved signals:

```typescript
function calculateActivationScore(
  organizationId: EntityId,
  signals: ActivationSignal[]
): ActivationScore
```

The score is computed on demand from the organization's actual state — never stored, never stale. No ML, no guessing.

**Example:**

- Organization configured: ✓ (10%)
- Property configured: ✓ (15%)
- Team invited: ✗ (0%)
- Core module configured: ✓ (15%)
- Operational data added: ✗ (0%)
- First transaction: ✗ (0%)
- Finance configured: ✗ (0%)
- Commerce configured: ✗ (0%)

**Score: 40%** → State: `ACTIVATING`

## Setup Wizard

The setup wizard at `/setup` dynamically adapts to the organization's business type and goals.

### Structure

```
1. Business
   - Business type, size, goals
   
2. Property
   - Create first property
   
3. Outlets
   - Create outlets (if applicable)
   
4. Modules
   - Enable modules based on business type
   
5. Team
   - Invite team members, assign roles
   
6. Core Data
   - Menu, inventory, rooms, suppliers (module-specific)
   
7. Finance
   - Chart of accounts, tax, payment methods
   
8. Commerce
   - Online ordering, QR, direct booking
   
9. Launch
   - Review, first transaction guidance
```

### Navigation

- **Back** — never loses progress
- **Continue** — advances to next step
- **Save & Exit** — persists progress, resume later
- **Skip** — optional steps can be skipped

Progress is persistent. If the user leaves onboarding, the next login shows "Continue setup" rather than restarting from step 1.

## Onboarding Checklist

Persistent checklist shown throughout the product:

```
GET STARTED
✓ Create organization
✓ Create property
✓ Create outlet

○ Configure business profile
○ Add users
○ Configure roles
○ Add menu
○ Configure tables
○ Add inventory items
○ Add suppliers
○ Configure rooms
○ Configure finance
○ Configure taxes
○ Configure commerce
○ Run first transaction
```

**Rules:**

- Only display applicable items (restaurant doesn't see "Configure rooms")
- Items are categorized: REQUIRED, RECOMMENDED, OPTIONAL
- Completion is based on real state, not form submission
- Do not punish users for skipping optional items

## Module Recommendations

Based on business type and goals, recommend modules:

**Restaurant:**

- Restaurant (RECOMMENDED)
- Inventory (RECOMMENDED)
- Procurement (RECOMMENDED)
- Finance (RECOMMENDED)
- CRM (RECOMMENDED)
- Commerce (RECOMMENDED)

**Hotel:**

- Hotel (RECOMMENDED)
- Housekeeping (RECOMMENDED)
- Maintenance (RECOMMENDED)
- Finance (RECOMMENDED)
- CRM (RECOMMENDED)
- Commerce (RECOMMENDED)

**Banquet:**

- Events (RECOMMENDED)
- CRM (RECOMMENDED)
- Inventory (RECOMMENDED)
- Procurement (RECOMMENDED)
- Finance (RECOMMENDED)

**Rules:**

- Never automatically enable modules without respecting subscription entitlements
- Check `hasEntitlement(...)` before recommending
- Show "Upgrade required" for modules not in the current plan

## Quick Setup by Module

Each module provides a quick setup checklist:

### Restaurant

- Menu Categories
- Menu Items
- Modifiers
- Dining Areas
- Tables
- Kitchen Stations
- Tax Configuration
- Payment Methods

### Hotel

- Room Types
- Rooms
- Rate Plans
- Room Rates
- Housekeeping
- Property Policies

### Inventory

- Locations
- Inventory Items
- Units
- Recipes
- Opening Stock (via ledger, never direct write)

### Procurement

- Suppliers
- Supplier Items
- Payment Terms
- Purchase Locations

### Finance

- Chart of Accounts
- Tax configuration
- Payment methods
- Cash accounts
- Bank accounts
- Opening balances (via controlled accounting service)

### Commerce

- Public Profile
- QR Ordering
- Table QR
- Takeaway
- Direct Booking
- Online Ordering

### CRM

- Customer profiles
- Customer preferences
- Loyalty
- Feedback
- Complaints

### Events

- Venues
- Packages
- Event Types
- Terms
- Quotation settings

### HR

- Departments
- Designations
- Employees
- Shifts
- Weekly Off
- Holidays

**Rules:**

- Reuse existing domain services — do not rebuild modules
- Opening stock must use the existing stock ledger (OPENING movements)
- Opening balances must use controlled accounting service
- Never bypass domain rules

## Data Import Center

Lightweight import support for onboarding:

**Importable:**

- Menu (CSV/Excel)
- Inventory Items
- Suppliers
- Employees
- Customers
- Rooms
- Opening Stock

**Pipeline:**

```
Upload → Parse → Validate → Preview → Confirm → Create → Summary
```

**Preview shows:**

- Valid rows: 120
- Invalid rows: 4
- Errors: 2
- Warnings: 8

**Rules:**

- Each importer uses the canonical domain service
- Never bypass domain rules
- Only commit valid data after confirmation
- Provide downloadable error details if infrastructure supports it

## Demo Data Mode

Allow new organizations to start with demo/sample data:

**Options:**

- Start with sample restaurant
- Start with sample hotel
- Start with blank workspace

**Safety:**

- Demo data must be clearly labeled with "DEMO DATA" badge
- Financial reports distinguish Demo vs Actual
- Never mix sample transactions with production financial records
- If reset is available: Preview → Confirm → Remove demo data → Audit
- Never silently delete real data

## First Transaction Experience

After setup, guide the user toward the first meaningful operation:

**Restaurant:**

```
Create Order → KOT → Serve → Bill → Payment
```

**Hotel:**

```
Create Reservation → Check In → Folio → Payment
```

**Events:**

```
Create Lead → Quotation → Booking
```

**Inventory:**

```
Receive Stock → Stock Ledger
```

**Finance:**

```
Record Expense → Journal
```

After first successful transaction:

```
FIRST OPERATION COMPLETE

AMRUT NIVAAS just recorded your first live business transaction.

[Open Command Center]
```

This should feel meaningful but not childish. This is one of the most important onboarding moments.

## Contextual Setup Prompts

Do not force the user through everything during initial onboarding. Show contextual prompts:

**Example:**

```
You haven't configured inventory yet.

[Configure Inventory]
[Later]
```

**Hotel:**

```
Housekeeping is not configured.

[Set Up Housekeeping]
[Later]
```

**Restaurant:**

```
You have menu items but no kitchen stations.

[Configure Kitchen]
[Later]
```

Integrate with the existing Attention Center where possible.

## Recommendation Engine

Deterministic service that suggests the next best setup action:

```typescript
function getNextBestSetupAction(
  organizationId: EntityId,
  businessTypes: string[],
  enabledModules: string[],
  completedSteps: string[],
  existingData: Record<string, boolean>
): SetupRecommendation | null
```

**Example:**

```
Configure Kitchen Stations

Reason:
Your restaurant has 48 active menu items but no kitchen stations.

[Configure Now]
```

The recommendation is data-driven, not a guess.

## Plan-Aware Onboarding

Respect subscription limits:

```
Your current plan supports 1 property.

You have already configured 1 property.

Upgrade to add another property.
```

**Rules:**

- Use `hasEntitlement(...)` and existing limit services
- Do not let onboarding bypass plan limits
- Show "Upgrade required" for features not in the current plan

## Platform Onboarding Dashboard

Platform admin view at `/platform/onboarding`:

**Metrics:**

- New Organizations
- Not Started
- In Progress
- Ready to Launch
- Activated
- Stalled

**Organization list:**

| Organization | Signed Up | Last Activity | Progress | First Transaction | Status |
|--------------|-----------|---------------|----------|-------------------|--------|
| Hotel ABC | 2026-10-01 | 2026-10-07 | 82% | 2026-10-05 | ACTIVATED |
| Restaurant XYZ | 2026-10-03 | 2026-10-04 | 22% | — | STALLED |

**Onboarding Health:**

- `HEALTHY` — active progress
- `PROGRESSING` — moving but slowly
- `STALLED` — no activity for 7+ days
- `AT_RISK` — signed up but never started
- `ACTIVATED` — live

## Customer Success View

Extend platform organization view with:

- Activation state
- Setup progress
- Last activity
- Modules enabled
- First transaction date
- Time to activation

**Metrics:**

- Signup → First Setup
- Signup → First Transaction
- Signup → Activation
- Activation Rate

## Customer Success Tasks

Allow platform/customer-success users to create tasks:

- Call customer
- Schedule onboarding session
- Help import menu
- Configure hotel rooms
- Assist with finance setup
- Follow up after trial

Reuse existing task/event patterns if available. Do not build a separate CRM.

## Onboarding Notifications

Reuse the existing notification system (#17):

- Welcome
- Setup incomplete
- First transaction completed
- Trial ending
- Important configuration missing
- Onboarding completed

**Rules:**

- Do not spam users
- Respect notification preferences and quiet hours

## AI Onboarding Assistance

Reuse the existing AI system (#19):

**Future capabilities:**

- "Help me set up my restaurant."
- "What should I configure next?"
- "Why is my setup only 62%?"
- "What do I need before opening tomorrow?"

**Rules:**

- AI reads existing onboarding/analytics state
- No autonomous configuration changes
- AI suggests, user decides

## Security & Audit

**Security:**

- Onboarding must not bypass tenant isolation, RBAC, property access, outlet access, subscription entitlements, resource authorization
- Never trust organizationId, propertyId, userId, role from the browser
- Apply full security architecture from #21

**Audit:**

Audit meaningful onboarding operations:

- Organization setup completed
- Property created
- Outlet created
- Module enabled
- User invited
- Role assigned
- Import executed
- Opening stock posted
- Opening balance posted
- Demo data created
- Demo data removed
- Onboarding completed

Do not audit every UI click.

## Multi-Property Onboarding

Support enterprise customers with multiple properties:

```
Organization
    ↓
Property 1
    ↓
Property 2
    ↓
Property 3
```

**Rules:**

- Allow "Add property later"
- Copy configuration where appropriate
- Never blindly duplicate financial history

## Template-Based Setup

Lightweight configuration templates:

- Restaurant Starter
- Hotel Starter
- Cafe Starter
- Banquet Starter
- Restaurant + Hotel Starter

Templates preconfigure:

- Departments
- Roles
- Kitchen stations (restaurant)
- Common tax/payment settings

**Rules:**

- Templates create configuration through canonical services
- Do not hardcode huge business datasets
- User confirms before applying template

## UX Guidelines

The experience should feel:

- Guided
- Fast
- Clear
- Professional
- Confidence-building

**Avoid:**

- Long forms
- 20-field screens
- Unnecessary questions
- Forced configuration
- Technical terminology

**Use plain hospitality language:**

Instead of:

```
Configure Organization Membership Scope
```

Say:

```
Choose where this team member can work
```

## Mobile

Onboarding must work well on mobile:

- Large tap targets
- Simple forms
- Clear progress
- Sticky Continue button

Avoid dense tables during initial setup.

## Routing

After login:

- If organization exists AND onboarding incomplete → show onboarding state
- If onboarding complete → go to Command Center
- If multiple organizations → respect organization selection
- Do not trap platform admins in organization onboarding

## Resume Behavior

If user leaves onboarding:

- Save progress
- Next login: "Continue setup"
- Do not restart from step 1

## Skip Behavior

Every optional step supports:

- Skip for now
- Configure later
- Contextual prompt appears later

**Rules:**

- Do not punish users for skipping
- Do not show the same prompt repeatedly
- Respect the user's choice

## "You Are Ready" State

When important setup is complete:

```
AMRUT NIVAAS IS READY

Your hospitality workspace is configured.

[Go to Command Center]
```

Also show remaining optional setup. Do not force users to reach 100%.

## Implementation Notes

**Domain layer:**

- `src/domain/onboarding/types.ts` — OnboardingProfile, ActivationState, ActivationScore, etc.
- `src/domain/onboarding/onboarding-service.ts` — calculateActivationScore, getNextBestSetupAction, getOnboardingChecklist, etc.

**UI layer:**

- `src/pages/onboarding/OnboardingWizard.tsx` — existing wizard (enhance or extend)
- `src/pages/setup/SetupWizard.tsx` — enhanced setup wizard (if needed)
- `src/pages/platform/OnboardingDashboard.tsx` — platform admin view

**Rules:**

- Onboarding is orchestration, not a second source of truth
- Reuse existing domain services
- Compute scores and recommendations on demand
- Never store activation score — always compute from actual state
- Respect subscription entitlements
- Apply full security architecture
