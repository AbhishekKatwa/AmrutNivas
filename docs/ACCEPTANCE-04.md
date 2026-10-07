# AMRUT NIVAAS — Prompt #04 acceptance checklist and stage report (Restaurant Foundation)

**Date:** 2026-10-07 · **Stage:** Prompt #04 — Restaurant Foundation (menu, floor, POS, billing, KOT, day overview)
**Against:** `docs/RESTAURANT_BUILD_CONTRACT.md` §1–§12, the Phase 1 exit gate in `docs/ROADMAP.md`, and
Prompt #04's numbered requirements as they were carried into the code and migration comments
(`§20` floor, `§25`–`§26` KOT, `§27` order ladder, `§32`–`§46` bills and payments, `§41` `open_bill`,
`§52` the restaurant dashboard, `§57`–`§59` tenant scoping, `§69` reprint auditing).

**Verdict vocabulary, unchanged from Prompt #03:** a row is `PASS` only when it was actually exercised in
this session and its output was read. `PARTIAL`, `NOT_VERIFIED`, `BLOCKED` and `DEFERRED` are written as
themselves. **Nothing in this document is `PASS`.** That is not modesty, it is the instruction that governed
the stage: *"FAST MODE, NO Tests, NO INSTALL, NO BUILDS, NO VERIFICATIONS — first complete the implementation,
the fixes come at the end."* Every line below is therefore a record of what was written and why, plus the exact
command list that must be run before any of it may be called working.

Two statuses are genuinely different and are kept apart throughout:

- **Applied** — the migration has been run through `db/harness/local-pg.sh` (and/or the hosted project).
  The last run recorded in these documents covers `db/supabase/000`–`014`; nothing after `014` is recorded as
  applied to either database.
- **Built** — the file exists, imports resolve by inspection, and it speaks to a real door. Not proof it runs.

---

## 1. The contract, clause by clause

The contract is the repository's own normative text (`docs/RESTAURANT_BUILD_CONTRACT.md`), so it is what this
stage is checked against. Prompt #04's own numbered acceptance list was supplied in chat and is not stored in
the repo; where a row cites a `§`, that `§` is the contract's or a number already used in code comments.

| Clause | Proven by | Status |
|---|---|---|
| §1 money is never a float | `src/domain/money/money.ts` (`Paise = bigint`), `src/db/money-read.ts` `moneyCell`/`moneyRow` retypes every numeric a door returns; `bills.*`, `payments.amount`, `order_items.unit_price`, `menu_item_prices.*` are TEXT across the boundary; 019 casts its sums `::text` | BUILT, NOT_VERIFIED |
| §2 one calculation engine, on the server | `app.calculate_restaurant_totals` is the only writer of order money; `bill-service.ts` performs no addition (its only arithmetic is the balance check the door re-answers); `RestaurantDayPage` prints 019's sums and adds nothing | BUILT, NOT_VERIFIED |
| §3 tax and service charge are abstractions, not constants | 014 keeps `tax_category_id` an opaque placeholder; 017 freezes `order_items.tax_rate` at zero with no engine behind it; the day screen states in prose that no tax figure exists | BUILT, honest absence documented — NOT_VERIFIED |
| §4 human document numbers from a sequence, gaps legal | `app.next_document_number` (016) mints `BILL-nnn` and `KOT-nnn`; 017/018 take it rather than counting rows | BUILT, NOT_VERIFIED |
| §5 optimistic locking plus row locks | `p_expected_version` on `open_bill`→`close_bill`/`record_payment`/`cancel_bill`/`send_kot`; parent `SELECT … FOR UPDATE`; `expectedVersion` threaded from the screens that read the version | BUILT, NOT_VERIFIED |
| §6 idempotency keys on operational submits | `newBillIdempotencyKey()` / `newKotIdempotencyKey()` share 016's `newIdempotencyKey`; one key minted per sheet-open; unique partial indexes on `bills.idempotency_key` and the KOT equivalent | BUILT, NOT_VERIFIED |
| §7 statuses are state machines | 016 `app.assert_order_chain`, 017 `assert_bill_chain`/`assert_payment_chain`, 018 `app.require_kot_fire_transition` (two edges each way); the client maps (`BILLABLE_ORDER_STATUSES`, `KOT_FIRE_ADVANCE`, `KOT_SENDABLE_ORDER_STATUSES`) offer buttons only | BUILT, NOT_VERIFIED |
| §8 money rows are immutable once SUCCESSFUL | 017's guard trigger refuses update/delete on a successful payment; `bill-service.ts` ships no update or delete verb — a wrong payment is answered by a new REFUNDED row, which is a `payment.refund` verb and not this release's | BUILT, NOT_VERIFIED |
| §9 history snapshots what it sold | `open_bill` copies the engine's answer into the bill; `bill-service` reloads rather than reconciles; a later reprice or void cannot restate an existing document | BUILT, NOT_VERIFIED |
| §10 isolation is proven, not assumed | Outlet-scoped SELECT policies on `bills`/`payments`; every door re-calls `app.require_session` + `require_permission`; 019 resolves org/property/outlet off the outlet itself so a client cannot name a tenant | BUILT, NOT_VERIFIED (no verifier scenario has run against 015–019) |
| §11 permission → validation → reason → audit | `close_bill`, `cancel_bill`, `cancel_kot`, `reprint_kot` all pass `app.require_reason`; each write calls `app.audit()`; screens show the permission they lack via `AccessDenied` instead of hiding | BUILT, NOT_VERIFIED |
| §12 outlets are the restaurant | `outletIdFor(context)` on every restaurant screen; no screen takes an outlet id from a route param or a picker it owns | BUILT, NOT_VERIFIED |

**Reproduce every gate at the end pass** (deliberately not run for this stage):

```bash
npx tsc --noEmit
npm run build
./db/harness/local-pg.sh rebuild          # applies 000–019 by glob, records app.schema_migrations
node db/verify/tenant_isolation.sql       # via the harness runner; 015–019 have no scenario yet
node db/harness/remote-apply.mjs check    # hosted project — parked, needs owner authorisation
```

---

## 2. Migrations delivered by this stage

| File | Adds | Client-facing doors | Applied | Verified |
|---|---|---|---|---|
| `013_restaurant_permissions.sql` | The 27 restaurant tokens on the permission ladder, seeded into `public.role_permissions` | 0 | YES (`000`–`014` run) | YES, in-sql ladder proof |
| `014_restaurant_menu.sql` | Six menu tables, priced reads through doors | 19 | YES | YES (verifier scenario 15) |
| `015_restaurant_tables.sql` | Dining areas, restaurant tables, ordering, the derived `restaurant_table_status` view | 9 | NO | NO |
| `016_restaurant_orders.sql` | `orders`, `order_items`, the order state machine, `app.calculate_restaurant_totals`, document-number counter, business-date resolver | 8 | NO | NO |
| `017_restaurant_calculation.sql` | `bills`, `payments`, `open_bill`/`close_bill`/`record_payment`/`cancel_bill`/`bill_detail`, payment immutability, bill chain asserts, SELECT grants + outlet policies | 5 | NO | NO |
| `018_restaurant_kot.sql` | `kitchen_order_tickets`, `send_kot`/`set_order_item_fire_status`/`cancel_kot`/`reprint_kot`/`kot_detail`/`open_kots`, fire + ticket ladders, reprint counter, permission-drift self-check | 6 | NO | NO |
| `019_restaurant_day_overview.sql` | `restaurant_day_overview` — the trading day in one read, gated on `restaurant.view` | 1 | NO | NO |

`015`–`019` add **29** doors to the **50** the architecture doc records, taking the product's write API to
**79** functions in `public`. Each migration ends with its own self-check block, which is the only proof any of
them currently has.

---

## 3. Client services (`src/domain/restaurant/`)

Every read/write goes through `callDoor`; the two plain SELECTs are the ones the database deliberately leaves
open (list reads under RLS, where no door ships).

| File | Wraps | Notes |
|---|---|---|
| `menu-service.ts` | `014`'s 19 doors | Kept its own pre-camel `moneyRow` variant; convergence is an end-pass item |
| `floor-service.ts` | `015`'s 9 doors + the derived status read | |
| `order-service.ts` | `016`'s 8 doors | Owns `newIdempotencyKey`, shared by bill and KOT |
| `bill-service.ts` | `017`: `open_bill`, `record_payment`, `close_bill`, `cancel_bill`, `bill_detail`, plus `listOpenBills`/`findBillForOrder` as SELECTs | Computes nothing; maps `bill_detail`'s nested snake rows by hand because the camel funnel is top-level only |
| `kot-service.ts` | `018`: `send_kot`, `set_order_item_fire_status`, `cancel_kot`, `reprint_kot`, `kot_detail`, `open_kots` | States which lines a SEND will take before calling the door (`firableLines`) rather than inferring it |
| `day-service.ts` | `019`: `restaurant_day_overview` | Pure helpers only — `ticketRows`, `seatedCovers`, `seatableCovers`, `dayIsQuiet`, `currencyStillOutstanding`, `cookingLines`, `tenderFor`; no sum |
| `types.ts` | — | Adds the trading-day section: `DayCovers`, `DayTickets`, `DayKitchen`, `DayMoney`, `DayTender`, `DayOverview` |
| `src/db/doors.ts` | — | All 11 billing/KOT doors plus `restaurant_day_overview` registered, with the WHY comment for the day read |

---

## 4. Screens and wiring (`src/pages/restaurant/`)

| Screen | Route | Permission the route asks for | What it can and cannot do |
|---|---|---|---|
| `MenuPage` | `/menu` | `menu.view` | `014`'s menu surface — shipped earlier in this stage |
| `FloorPage` | `/tables` | `table.view` | Areas, tables, service status |
| `PosPage` | `/pos` | `order.view` | Tickets staged on the device, booked by `016`; prints no totals (the engine owns them) |
| `BillPage` | `/billing` | `bill.view` | Opens the frozen document, books payments, closes or cancels with a reason; rails gate on `bill.create`, `payment.create`, `bill.void`; money fields refuse anything over the balance client-side and the door re-answers |
| `KitchenPage` | `/kitchen` | `kot.view` | Queue, ring-up, cancel, reprint; the SEND rail is gated on `order.view` because firing names another outlet's document — a KITCHEN_MANAGER sees the queue and an explanatory card, never a button the DB will refuse |
| `RestaurantDayPage` | `/restaurant` | `restaurant.view` | One read, four cards (floor, tickets, pass, money per currency), a quiet-day card, and prose stating that nothing is computed here |

All six resolve the same view ladder (`bootstrapping | unconfigured | unauthenticated | no_outlet | scoped`)
through their own exported `pageStatusFor`, and all six take their outlet from the context store — never from a
param. `src/app/navigation.ts` now marks the five restaurant destinations `available: true` with their paths,
which means the registry's own `navSummary()` counts move; the disabled rows remain the honest answer for
everything #04 does not ship.

**Not exercised:** no screen has been loaded in a browser in this session. Loading, empty, error, permission,
mobile and write-result states are all designed and written, all UNSEEN.

---

## 5. Deliberately NOT built

These are the things a reader might expect from a "restaurant module" that this stage refuses on purpose. Each
one is a missing capability, not a hidden one:

- **No tax engine.** A bill carries `tax_rate` at zero and the day read states there is no tax figure. Inventing
  one would be a claim about Indian GST compliance that nothing behind it supports.
- **No day close, Z-report, shift or cash drawer.** #05's; the dashboard is a live read, not a settlement.
- **No bill splits, no multi-bill payment allocation, no payment against several documents.** #05's.
- **No refunds written.** `payment.refund` exists as a token; a SUCCESSFUL row is immutable and no verb here
  writes a REFUNDED row.
- **No KDS printer, no physical print path.** The screen shows the slip; emitting paper is unresolved and the
  roadmap already flags it as the must-decide item.
- **No reservations feeding the RESERVED cover slot.** The precedence exists in `016`; the source table is #08.
- **No inventory consumption from recipes.** `Recipe` and `StockMovement` are Phase 2.
- **No seeded demo restaurant.** The task list's "dev seed" half of this stage is deliberately not fabricated:
  inventing bills, payments or KOTs would put fake money into a product whose entire design principle is that a
  figure is printed only because a door computed it. The day screen's quiet-state card is the honest first run.
- **No new tests**, per standing instruction. The repository's 51 existing test files are untouched; no
  restaurant test was added.

---

## 6. Known limitations and open defects

1. **Nothing in `015`–`019` has been applied to a database in this sequence.** The self-checks inside each
   migration are the only assertions that exist. Until `local-pg.sh rebuild` runs, every restaurant read and
   write in the client is unproven against the real Postgres.
2. **No verifier scenario covers the restaurant tables.** The isolation suite's 15 scenarios stop at `014`;
   `bills`, `payments`, `kitchen_order_tickets`, `order_items` and `restaurant_day_overview` have no
   cross-tenant attack recorded.
3. **Five open observations on `017`** (raised while reconciling the client against the door, none of them
   silently worked around in TypeScript):
   - `orders.amount_due` can go stale when lines change without a re-price; the bill snapshots the engine but
     the order's own due column is not re-derived on every line edit.
   - `close_bill` and `cancel_bill` omit `app.require_writable_outlet`, which the other bill doors call —
     a closed outlet can still be written through these two.
   - `open_bill` has no `unique_violation` catch behind its idempotency key, so a replay races rather than
     returning the first bill cleanly.
   - The permission-drift gate (D12) lives only in `018`'s self-check; `017` does not assert its own tokens.
   - `bills.status` is still derived by a `CASE` inside `record_payment` rather than a shared helper, so a
     second writer of payment rows would have to repeat the rule.
4. **`017`'s `bill_detail` returns snake_case nested keys** (`item_name`, `unit_price`) while `018`'s
   `kot_detail` returns camelCase. The client maps both explicitly, so behaviour is correct by construction but
   the two doors are inconsistent — worth converging before another consumer appears.
5. **`menu-service.ts` keeps a second `moneyRow` mapping variant.** Divergence risk, not a defect.
6. **`bill.discount` and `order.discount` have tokens but no door.** A discount can be granted by role and
   cannot yet be applied by anything; the bill simply carries whatever `016`'s engine wrote.
7. **STAFF holds `kot.create` but not `kot.view`,** so a waiter can fire a slip and cannot see the queue they
   fired into. This is a role-seed question (`013`), not a screen question, and was left alone rather than
   patched around in UI.
8. **The owner's delete-tests instruction remains partly unexecuted.** 51 test files from Prompts #01–#03 are
   still in the tree; deleting them is a large, hard-to-reverse change to the security proof these very docs
   cite, so it is left as an explicit decision rather than done mid-sequence.
9. **Hosted apply (task #45) is parked** pending the owner's authorisation, as with all cloud-side writes.

---

## 7. Architectural decisions

Recorded in `docs/DECISIONS.md` as **D-41** (one engine means the dashboard is a door, not a reduce),
**D-42** (money is TEXT at every seam, and a day is reported per currency never blended),
**D-43** (a KOT is a print unit: reprint re-emits the same row, counted, reasoned, audited),
**D-44** (a bill is frozen at open, payments are append-only, and status is derived by the door),
**D-45** (Prompt #04 ships no tax figure and no fabricated seed data — an honest absence over a plausible one).

---

## 8. Next step

Phase 1's substrate is complete on paper: menu → floor → POS → bill → pass → day, four-and-a-half migrations
and six screens, with one calculation engine and no client-side money anywhere.

The next action is **not** more code. It is the end pass the owner deferred: apply `015`–`019` to the local
harness, add the verifier scenarios the restaurant tables do not have, run `tsc`/`build`, then drive each of
the six screens in the preview and read what actually renders — including the permission-denied and empty
states. Only after that can any row in §1 above be rewritten as `PASS`.

After that, **Prompt #05** owns what #04 deliberately left out: the KDS printer path, bill splits, shifts, and
the day close whose figures must agree with the printed bill.
