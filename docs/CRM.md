# CRM foundation build contract

Binding conventions for Prompt #11 — the customer relationship layer that turns guest records into a 360° identity with preferences, feedback, complaints, loyalty and corporate links. Every migration, service and screen in this domain follows these rules. Where this file and an existing migration disagree, the migration wins and this file is corrected.

## 1. Customer = Guest, extended

CRM does not introduce a new customer table. Migration 041 extends `guests` with five CRM columns:

| Column | Type | Purpose |
|---|---|---|
| `customer_type` | enum | INDIVIDUAL, CORPORATE, TRAVEL_AGENT, EVENT_CUSTOMER, WALK_IN, OTHER |
| `company_name` | text | Company the customer represents |
| `designation` | text | Job title or role |
| `anniversary_date` | date | For loyalty and marketing |
| `corporate_account_id` | uuid → corporate_accounts | Billing and rate link |

All CRM reads and writes go through the existing guest identity. Financial metrics (total spend, total stays, average spend) are **derived, never stored**.

Scope: all CRM tables are org-scoped (`organization_id`). Notes may additionally be property-scoped.

## 2. Sub-domains

| Sub-domain | Table(s) | Purpose |
|---|---|---|
| Preferences | `customer_preferences`, `customer_preference_items` | Communication channels, consent, structured key/value |
| Tags | `customer_tags`, `customer_tag_assignments` | Org-scoped labels assigned to customers |
| Notes | `customer_notes` | Per-customer free-text, optional property scope |
| Feedback | `customer_feedback` | Ratings + comments with status workflow |
| Complaints | `complaints` | Tracked issues with resolution workflow |
| Loyalty | `loyalty_programs`, `loyalty_tiers`, `loyalty_accounts`, `loyalty_transactions` | Programs → tiers → accounts → append-only ledger |
| Corporate | `corporate_accounts` | Company entities linked to guests |
| Relationships | `customer_relationships` | Customer-to-customer links (family, colleagues) |

## 3. Feedback state machine

```
OPEN → IN_REVIEW → RESOLVED → CLOSED
```

- **OPEN**: feedback recorded, not yet reviewed.
- **IN_REVIEW**: staff is reviewing the feedback.
- **RESOLVED**: action has been taken; `resolved_at` and `resolved_by` are stamped.
- **CLOSED**: feedback is fully closed. Terminal state.

Categories: `SERVICE`, `CLEANLINESS`, `FOOD_QUALITY`, `AMBIENCE`, `STAFF_BEHAVIOR`, `CHECK_IN_OUT`, `FACILITIES`, `VALUE_FOR_MONEY`, `OTHER`.

Sources: `INTERNAL`, `GOOGLE`, `TRIPADVISOR`, `ZOMATO`, `SWIGGY`, `DIRECT`, `PHONE`, `EMAIL`, `OTHER`.

Rating: integer 1–5, nullable.

## 4. Complaint state machine

```
OPEN → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED
                         ↕                        ↗
                     ON_HOLD ──────────────────→ CANCELLED
```

- **OPEN**: complaint recorded, not yet assigned.
- **ASSIGNED**: a staff member is named; `assigned_to` and `assigned_at` are stamped.
- **IN_PROGRESS**: work has started; `started_at` is stamped.
- **ON_HOLD**: work paused (waiting for parts, vendor, etc.); a reason is recorded.
- **RESOLVED**: issue is fixed; `resolved_at`, `resolved_by`, `resolution` are stamped.
- **CLOSED**: complaint is fully closed. Terminal state.
- **CANCELLED**: complaint is withdrawn or invalid; a reason is recorded.

Priority: `LOW`, `NORMAL`, `HIGH`, `URGENT`. Categories match feedback categories.

## 5. Loyalty model

```
loyalty_programs
  └── loyalty_tiers (rank-ordered)
  └── loyalty_accounts (one per customer per program)
       └── loyalty_transactions (append-only ledger)
```

- **Programs**: define currency name (e.g. "Points"), earning rate (`points_per_amount`), minimum spend threshold, and earning/redemption toggles.
- **Tiers**: rank-ordered within a program (e.g. Silver → Gold → Platinum). Each tier has a `minimum_points` threshold and optional benefits JSON.
- **Accounts**: one per customer per program. Track `current_points`, `lifetime_points`, `tier_id`, `member_number`.
- **Transactions**: append-only. Types: `EARN`, `REDEEM`, `ADJUST`, `EXPIRE`. Every transaction records `points_delta` (signed) and a running `balance_after`.

No transaction is ever updated or deleted — corrections are new rows with opposite sign.

## 6. Corporate accounts

Company entities that guests can be linked to for billing and rate purposes. Fields: name, code (unique per org), contact name, phone, email, billing address, tax ID, credit limit, payment terms.

Status: `ACTIVE`, `INACTIVE`, `ARCHIVED`.

A guest's `corporate_account_id` FK links them to their company.

## 7. Customer relationships

Customer-to-customer links. Types: `SPOUSE`, `CHILD`, `PARENT`, `SIBLING`, `FRIEND`, `COLLEAGUE`, `BUSINESS_ASSOCIATE`, `TRAVEL_COMPANION`, `OTHER`.

Bidirectional: creating A→B automatically creates B→A with `is_reverse = true`. Deleting one side deletes both.

## 8. Permissions

27 CRM permission tokens in the catalogue:

| Token | Scope |
|---|---|
| `crm.view` | Module-level access |
| `crm.customer.view` | Read customer list and profiles |
| `crm.customer.manage` | Create/edit customers |
| `crm.customer.delete` | Archive customers |
| `crm.preferences.view` | Read preferences |
| `crm.preferences.manage` | Edit preferences |
| `crm.tags.view` | Read tags |
| `crm.tags.manage` | Create/delete tags, assign/remove |
| `crm.notes.view` | Read notes |
| `crm.notes.create` | Create notes |
| `crm.notes.edit_own` | Edit own notes |
| `crm.notes.edit_all` | Edit any note |
| `crm.notes.delete_own` | Delete own notes |
| `crm.notes.delete_all` | Delete any note |
| `crm.feedback.view` | Read feedback |
| `crm.feedback.create` | Create feedback |
| `crm.feedback.manage` | Update status, resolve, close |
| `crm.complaint.view` | Read complaints |
| `crm.complaint.create` | Create complaints |
| `crm.complaint.manage` | Update status, assign, resolve |
| `crm.loyalty.view` | Read programs, tiers, accounts |
| `crm.loyalty.manage` | Create programs, adjust points |
| `crm.corporate.view` | Read corporate accounts |
| `crm.corporate.manage` | Create/edit corporate accounts |
| `crm.relationships.view` | Read relationships |
| `crm.relationships.manage` | Create/delete relationships |
| `crm.segments.view` | Read segments (future) |

## 9. Doors (write path)

21 security-definer RPCs in `CLIENT_DOORS`:

| Door | Purpose |
|---|---|
| `upsert_customer_preferences` | Create or update preference row |
| `set_customer_preference_item` | Set a structured key/value item |
| `create_customer_tag` | Create org-scoped tag |
| `delete_customer_tag` | Delete tag + cascade assignments |
| `assign_customer_tag` | Assign tag to customer |
| `remove_customer_tag` | Remove tag from customer |
| `create_customer_note` | Create note |
| `update_customer_note` | Update note text |
| `delete_customer_note` | Delete note |
| `create_customer_feedback` | Create feedback |
| `update_feedback_status` | Transition feedback status |
| `create_complaint` | Create complaint |
| `update_complaint` | Update complaint (status, assignment, resolution) |
| `create_loyalty_program` | Create program |
| `create_loyalty_account` | Enroll customer in program |
| `record_loyalty_transaction` | Append to ledger |
| `create_corporate_account` | Create corporate account |
| `update_corporate_account` | Update corporate account |
| `create_customer_relationship` | Create bidirectional link |
| `delete_customer_relationship` | Delete both sides |
| `update_guest_crm` | Update guest CRM fields (customer_type, company_name, etc.) |

All reads go through standard Supabase SELECT under RLS. No read doors.

## 10. Screens

| Route | Screen | Purpose |
|---|---|---|
| `/crm` | CrmOverviewPage | KPI cards: customers, feedback, complaints, loyalty |
| `/crm/customers` | CustomersPage | Customer list with search, type filter, VIP filter |
| `/crm/customers/:customerId` | CustomerProfilePage | 360° profile: identity, tags, notes, feedback, complaints, loyalty, relationships |
| `/crm/feedback` | FeedbackPage | Feedback list with status filter, create dialog |
| `/crm/complaints` | ComplaintsPage | Complaint list with status filter, create dialog, workflow buttons |
| `/crm/loyalty` | LoyaltyPage | Programs with tier display, create program dialog |
| `/crm/corporate` | CorporateAccountsPage | Corporate accounts list, create dialog |

All screens follow the standard view-state pattern: bootstrapping → unconfigured → unauthenticated → no_organization → scoped.

## 11. Navigation

CRM replaces the placeholder "People" group in the sidebar. The group uses `nav.crm` label key with six items: Overview, Customers, Feedback, Complaints, Loyalty, Corporate. Employees (phase 7) remains as a disabled placeholder.

All CRM nav items are `phase: 5, available: true`.

## 12. Migration 041

`db/supabase/041_crm_foundation.sql` — 1679 lines. Creates:

- 5 new columns on `guests`
- 11 new tables (preferences, preference_items, tags, tag_assignments, notes, feedback, complaints, loyalty_programs, loyalty_tiers, loyalty_accounts, loyalty_transactions, corporate_accounts, customer_relationships)
- RLS policies for all tables (org-scoped)
- 21 security-definer RPC doors
- 27 permission catalogue entries (via `app.insert_permission`)
- Indexes on customer_id, organization_id, status, created_at

## 13. Design constraints

- **No stored financial metrics.** Total spend, average spend, visit count are derived from stays, reservations and folios at read time.
- **Loyalty ledger is append-only.** Corrections are new rows, never updates.
- **Customer = Guest.** No separate customer table. CRM extends the existing guest identity.
- **All writes through doors.** No direct INSERT/UPDATE from the client.
- **Org-scoped.** All CRM data is isolated by `organization_id` under RLS.
- **Relationships are bidirectional.** Creating A→B auto-creates B→A.
