# AMRUT NIVAAS — Prompt #04 acceptance checklist and stage report (Restaurant Foundation)

**Date:** 2026-10-07, end pass 2026-10-08 · **Stage:** Prompt #04 — Restaurant Foundation (menu, floor, POS, billing, KOT, day overview)
**Against:** `docs/RESTAURANT_BUILD_CONTRACT.md` §1–§12, the Phase 1 exit gate in `docs/ROADMAP.md`, and
Prompt #04's numbered requirements as they were carried into the code and migration comments
(`§20` floor, `§25`–`§26` KOT, `§27` order ladder, `§32`–`§46` bills and payments, `§41` `open_bill`,
`§52` the restaurant dashboard, `§57`–`§59` tenant scoping, `§69` reprint auditing).

**Verdict vocabulary, unchanged from Prompt #03:** a row is `PASS` only when it was actually exercised and its
output was read. `PARTIAL`, `NOT_VERIFIED`, `BLOCKED` and `DEFERRED` are written as themselves.

This document was first written under the instruction *"FAST MODE, NO Tests, NO INSTALL, NO BUILDS, NO
VERIFICATIONS — first complete the implementation, the fixes come at the end"*, and at that point nothing in it
was `PASS`. **The deferred end pass has now run (2026-10-08), and it split the stage cleanly in two.** The
database half is exercised and green: `015`–`019` are applied through `db/harness/local-pg.sh rebuild`, and
`db/verify/tenant_isolation.sql` — which now carries twenty scenarios, six of them aimed squarely at this
release — ended that run with `ALL SCENARIOS PASSED — tenant isolation verified against PostgreSQL 18.3` after
**742 `PASS` assertion lines**, **598** of them from scenario 15 onward (of which **255** are cross-tenant or
ladder denial probes and the rest are positive figures read back out of the server). The client half is still
`NOT_VERIFIED`: `npx tsc --noEmit` and `npm run build` are clean, and the shipped bundle has been driven in a
browser only as far as an unauthenticated person can take it, because there is no local PostgREST or GoTrue to
hold a session (see §4 and §6.10).

Two statuses are genuinely different and are kept apart throughout:

- **Applied** — the migration has been run through `db/harness/local-pg.sh` (and/or the hosted project). The
  2026-10-08 cold rebuild records `db/supabase/000`–`019` applied to the local cluster in one pass. The hosted
  project has `015`–`019` applied too, but from the copies that existed *before* the end pass corrected `016`,
  `017` and `018` — that re-apply is an owner decision, not something done quietly (§6.9).
- **Built** — the file exists, imports resolve by inspection, and it speaks to a real door. Not proof it runs.

---

## 1. The contract, clause by clause

The contract is the repository's own normative text (`docs/RESTAURANT_BUILD_CONTRACT.md`), so it is what this
stage is checked against. Prompt #04's own numbered acceptance list was supplied in chat and is not stored in
the repo; where a row cites a `§`, that `§` is the contract's or a number already used in code comments.

| Clause | Proven by | Status |
|---|---|---|
| §1 money is never a float | `src/domain/money/money.ts` (`Paise = bigint`), `src/db/money-read.ts` `moneyCell`/`moneyRow` retypes every numeric a door returns; `bills.*`, `payments.amount`, `order_items.unit_price`, `menu_item_prices.*` are TEXT across the boundary; 019 casts its sums `::text` | **PASS server-side** (scenario 20.5d/20.5e read 019's figures back as text and demanded digit-for-digit equality with Postgres' own `numeric` sums; 20.7a holds the same line on the tender block) — the client's re-typing itself is NOT_VERIFIED in a browser |
| §2 one calculation engine, on the server | `app.calculate_restaurant_totals` is the only writer of order money; `bill-service.ts` performs no addition (its only arithmetic is the balance check the door re-answers); `RestaurantDayPage` prints 019's sums and adds nothing | **PASS server-side** (20.5 proves a day's `billed`/`collected`/`outstanding` are the database's own groupings, and 20.9a proves two reads of one night agree exactly); "the client adds nothing" is a reading of `day-service.ts`, not an observation |
| §3 tax and service charge are abstractions, not constants | 014 keeps `tax_category_id` an opaque placeholder; 017 freezes `order_items.tax_rate` at zero with no engine behind it; the day screen states in prose that no tax figure exists | **PASS as an honest absence** — 20.7a asserts the exact ten keys `restaurant_day_overview` returns, and a tax figure is not among them, so a future invention would fail the verifier rather than slip through |
| §4 human document numbers from a sequence, gaps legal | `app.next_document_number` (016) mints `BILL-nnn` and `KOT-nnn`; 017/018 take it rather than counting rows | **PASS** (19.6i proves the counter equals the newest printed `KOT-nnn` at the outlet after a refusal spent nothing; 17.x/18.x do the same for bills) |
| §5 optimistic locking plus row locks | `p_expected_version` on `open_bill`→`close_bill`/`record_payment`/`cancel_bill`/`send_kot`; parent `SELECT … FOR UPDATE`; `expectedVersion` threaded from the screens that read the version | **PASS server-side** (19.6 proves a stale version is refused and the refusal leaves no ticket, no fired line and no audit row — 19.1i); the screens' version plumbing is NOT_VERIFIED |
| §6 idempotency keys on operational submits | `newBillIdempotencyKey()` / `newKotIdempotencyKey()` share 016's `newIdempotencyKey`; one key minted per sheet-open; unique partial indexes on `bills.idempotency_key` and the KOT equivalent | **PASS server-side** (19.2 replays one KOT key and requires the same slip back; 18.8 does it from the document) — §6.3 below records the collision-domain question the run left open |
| §7 statuses are state machines | 016 `app.assert_order_chain`, 017 `assert_bill_chain`/`assert_payment_chain`, 018 `app.require_kot_fire_transition` (two edges each way); the client maps (`BILLABLE_ORDER_STATUSES`, `KOT_FIRE_ADVANCE`, `KOT_SENDABLE_ORDER_STATUSES`) offer buttons only | **PASS for the server's ladders** (scenarios 17, 18 and 19 walk every legal edge and refuse every illegal one; 19.x alone contributes 88 labelled assertions and 19.0b asserts the `PLACED>PREPARING` edge is legal — §6.11) |
| §8 money rows are immutable once SUCCESSFUL | 017's guard trigger refuses update/delete on a successful payment; `bill-service.ts` ships no update or delete verb — a wrong payment is answered by a new REFUNDED row, which is a `payment.refund` verb and not this release's | **PASS** (18.8f: restating the amount, flipping it to `FAILED` and deleting the row are each refused on the ROW itself, with no door in the path) |
| §9 history snapshots what it sold | `open_bill` copies the engine's answer into the bill; `bill-service` reloads rather than reconciles; a later reprice or void cannot restate an existing document | **PASS server-side** (18.x: a reprice after the document opens leaves the frozen lines alone; 20.5h proves a cancelled document's ₹500.00 is excluded from the day rather than averaged into it) |
| §10 isolation is proven, not assumed | Outlet-scoped SELECT policies on `bills`/`payments`; every door re-calls `app.require_session` + `require_permission`; 019 resolves org/property/outlet off the outlet itself so a client cannot name a tenant | **PASS** (20.8a–20.8d: a never-existing id and another tenant's id are both answered `NIVAAS_NOT_FOUND` with no audit row and no difference the caller can read as existence; a `HOUSEKEEPING_MANAGER` with zero `restaurant.%` tokens is refused `NIVAAS_ACCESS_DENIED`; Rooftop's manager is refused Main Dining's night and reads its own; 20.11d closes the key-free case) |
| §11 permission → validation → reason → audit | `close_bill`, `cancel_bill`, `cancel_kot`, `reprint_kot` all pass `app.require_reason`; each write calls `app.audit()`; screens show the permission they lack via `AccessDenied` instead of hiding | **PASS for the first four links, server-side** (the ladder is asserted as a fact in 20.8c and every refusal in scenarios 15–20 is a denial probe); the `AccessDenied` rendering is NOT_VERIFIED |
| §12 outlets are the restaurant | `outletIdFor(context)` on every restaurant screen; no screen takes an outlet id from a route param or a picker it owns | NOT_VERIFIED — this is a client claim and the client has not been driven signed-in (§4, §6.10) |

**The end-pass gates, and what each one actually returned (2026-10-08):**

```bash
npx tsc --noEmit                          # EXIT=0, and again with --incremental false: clean, no output
npm run build                             # EXIT=0 — 2108 modules, dist/assets/index-*.js 922.02 kB
./db/harness/local-pg.sh rebuild          # EXIT=0 — applies 000–019 by glob, records app.schema_migrations,
                                          # then runs the verifier: 742 PASS, "ALL SCENARIOS PASSED —
                                          # tenant isolation verified against PostgreSQL 18.3"
node db/harness/remote-apply.mjs check    # hosted posture read-only: 000–019 in the ledger,
                                          # 29 tables / 29 with RLS, 79 security-definer doors, no drift row
```

`db/verify/tenant_isolation.sql` is run by the harness (`local-pg.sh verify`), not by `node` directly; the
scenarios that did this stage's work are 15 (menu + ladder, `013`/`014`), 16 (floor, `015`), 17 (orders, `016`),
18 (bills and payments, `017`), 19 (KOT, `018`) and 20 (the day read, `019`) — 25, 41, 79, 63, 88 and 45 labelled
assertions respectively.

---

## 2. Migrations delivered by this stage

| File | Adds | Client-facing doors | Applied | Verified |
|---|---|---|---|---|
| `013_restaurant_permissions.sql` | The 27 restaurant tokens on the permission ladder, seeded into `public.role_permissions` | 0 | YES (`000`–`019` in one rebuild) | YES — ladder proof in-sql + verifier scenario 15 |
| `014_restaurant_menu.sql` | Six menu tables, priced reads through doors | 19 | YES | YES (verifier scenario 15, 25 assertions) |
| `015_restaurant_tables.sql` | Dining areas, restaurant tables, ordering, the derived `restaurant_table_status` view | 9 | YES | YES (scenario 16, 41 assertions) |
| `016_restaurant_orders.sql` | `orders`, `order_items`, the order state machine, `app.calculate_restaurant_totals`, document-number counter, business-date resolver | 8 | YES | YES (scenario 17, 79 assertions) |
| `017_restaurant_calculation.sql` | `bills`, `payments`, `open_bill`/`close_bill`/`record_payment`/`cancel_bill`/`bill_detail`, payment immutability, bill chain asserts, SELECT grants + outlet policies | 5 | YES | YES (scenario 18, 63 assertions) |
| `018_restaurant_kot.sql` | `kitchen_order_tickets`, `send_kot`/`set_order_item_fire_status`/`cancel_kot`/`reprint_kot`/`kot_detail`/`open_kots`, fire + ticket ladders, reprint counter, permission-drift self-check | 6 | YES | YES (scenario 19, 88 assertions) |
| `019_restaurant_day_overview.sql` | `restaurant_day_overview` — the trading day in one read, gated on `restaurant.view` | 1 | YES | YES (scenario 20, 45 assertions) |

`015`–`019` add **29** doors to the **50** the architecture doc records, taking the product's write API to
**79** functions in `public` — which is what `remote-apply.mjs check` counts on the hosted project too. Each
migration still ends with its own self-check block (`NIVAAS_MIGRATION_GAP`), but that is no longer the only
proof any of them has: scenarios 15–20 attack the same surface from a client's seat.

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

**Exercised in the end pass (2026-10-08), against the built `dist/`:** all six restaurant routes plus
`/organization` and `/team` were driven in a real browser at a 413px viewport. Every one of them redirects to
`/sign-in` — the guard holds on all eight, the catch-all route and `/` funnel there too, the console stayed
completely empty, and the shell has no horizontal overflow (`scrollWidth` 413 of 413, sign-in card 379px). That
is the whole of what a person without a session can see, and it is now a read fact rather than an assumption.

**Still not exercised:** nothing past the sign-in door. Loading, empty, error, permission, mobile and
write-result states for these six screens are designed, compiled and **UNSEEN**, because no session exists to
reach them with — see §6.10 for why the local harness cannot mint one and why the hosted project cannot yet send
the link.

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
- **No test files, in either direction.** The standing instruction is "no test cases, ever", and this stage
  added none. The owner's delete instruction is now fully executed: `find src -name '*.test.ts*'` returns
  nothing, `src/test-helpers/` is gone, and `package.json` has no `test` script (an unused `vitest` entry is all
  that remains in devDependencies). What proves this release is `db/verify/tenant_isolation.sql` — SQL run
  against a real PostgreSQL 18.3 — plus each migration's own self-check block, not a suite.

---

## 6. Known limitations and open defects

1. **`015`–`019` are applied and behaviourally proven locally.** The 2026-10-08 `local-pg.sh rebuild` applied
   `000`–`019` in one pass and the verifier then read the restaurant surface back: 598 of its 742 `PASS` lines
   come from scenario 15 onward, 255 of those being denial probes. What that proves is the *server*; the client's
   plumbing over those doors is still only compiled (§4).
2. **The restaurant tables now have cross-tenant attacks recorded.** Scenarios 17–20 each take a stranger's ids
   through the doors that own them, and scenario 20 does it for a read that returns a whole night: another
   tenant's outlet, a never-existing outlet, and a person with no `restaurant.%` token at all (§6.11 keeps the
   one asymmetry the run found in the client's favour rather than the door's).
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
8. **The delete-tests instruction is executed.** Through 2026-10-07 this file said the 51 suites were "still in
   the tree" and left their deletion as an explicit owner decision. It has since been carried out: no
   `*.test.ts(x)` remains under `src/`, `src/test-helpers/` is gone, and there is no `test` script. The security
   claims those files used to re-read are now held by `db/verify/tenant_isolation.sql` (twenty scenarios, real
   server) and by each migration's self-check block; where a guarantee existed only in TypeScript, this repo's
   `docs/ARCHITECTURE.md` §13.5 records it as an open risk rather than as covered.
9. **The hosted project is behind this tree, and that is an owner decision to close.** `remote-apply.mjs check`
   (read-only) reports `000`–`019` applied — the restaurant set at 2026-10-07 16:59 UTC — with 29 tables, 29 of
   them RLS-enforced, and 79 `security definer` doors. But `016`, `017`, `018` and `019` were all corrected in
   this end pass *after* that timestamp (017's totals are now `round(…, 2)` per line and built as `jsonb` rather
   than bare column rows, `app.next_document_number` is revoked from the client roles, and 018's
   `NIVAAS_KOT_EMPTY` refusal was repaired — §6.12). Re-applying corrected files is a hosted write and a
   different shape of change from an append-only apply, so it is listed here rather than done.
10. **Nothing past the sign-in screen has ever rendered.** The local cluster has no PostgREST and no GoTrue (the
    harness stubs `auth.*` in SQL — `db/harness/stub-supabase.sql`), so the app cannot talk to the database it is
    proven against; and the hosted project cannot complete an email-link sign-in, because GoTrue still has no
    SMTP transport or real `site_url` (`docs/DECISIONS.md` O-8). Six screens' scoped, empty, error, permission and
    write-result states are therefore UNSEEN, and no amount of a green `tsc` changes that. Closing it needs one
    of: a hosted test identity plus a working mail path, or a local API layer in the harness.
11. **`send_kot` refuses a SEND that its own gate just accepted.** `018`'s status wall admits
    `('PLACED','CONFIRMED','PREPARING')`, and then — when the order is not already `PREPARING` — it asks
    `app.require_order_transition(v_status, 'PREPARING')`. `016`'s ladder had no `PLACED>PREPARING` edge (a
    placed order went `PLACED>CONFIRMED`, or `PLACED>CANCELLED`), so a ticket fired straight from a placed order
    died with `NIVAAS_INVALID_TRANSITION` — and `KOT_SENDABLE_ORDER_STATUSES` in `kot-service.ts` mirrors the
    *admitting* wall, so the waiter's screen offered the button the door would refuse. The fix was to add the
    `PLACED>PREPARING` edge to `016`'s ladder (the recommended direction: a `PLACED` order is legitimately
    ready to fire to the kitchen, and the screen already offers `SEND` on `PLACED`). Scenario 19 now asserts
    the edge is legal (19.0b) and that a send from a `PLACED` order succeeds and leaves a ticket (19.1i).
12. **Money shapes are not uniform between doors.** `019` renders a currency's `collected` as the bare string
    `'0'` when nothing was successfully paid in it, where a `billed` figure of the same currency carries decimals
    (`20.5h` measures this rather than asserting a shape it does not have); `017`'s `bill_detail` also answers
    snake_case nested keys where `018`'s `kot_detail` answers camelCase (§4 above and item 4). Every one of these
    is correct-by-construction at the client today and each is a trap for the next consumer.
13. **A harness trap, recorded because it produced a false PASS once.** `set role` changes `current_user` but not
    `session_user`, and it does not clear a GUC — so 000's `app.current_user_id()` override branch stays reachable
    from the verifier and a "key-free" probe silently reads on the session the previous block set. `20.11d` now
    clears `app.user_id` explicitly and comments why. Anyone adding an anonymous scenario must do the same, or
    the scenario passes for the wrong reason.

---

## 7. Architectural decisions

Recorded in `docs/DECISIONS.md` as **D-41** (one engine means the dashboard is a door, not a reduce),
**D-42** (money is TEXT at every seam, and a day is reported per currency never blended),
**D-43** (a KOT is a print unit: reprint re-emits the same row, counted, reasoned, audited),
**D-44** (a bill is frozen at open, payments are append-only, and status is derived by the door),
**D-45** (Prompt #04 ships no tax figure and no fabricated seed data — an honest absence over a plausible one).

---

## 8. Next step

Phase 1's substrate is complete and, on the server side, no longer "on paper": menu → floor → POS → bill → pass →
day, five migrations and six screens, with one calculation engine and no client-side money anywhere. The end pass
the owner deferred has run — `015`–`019` applied, twenty verifier scenarios green against PostgreSQL 18.3,
`tsc` and `build` clean — and §1 above now says which of those rows are proven and which are merely compiled.

Three things stand between this stage and a `PASS` on the client rows, and two of them are owner decisions
rather than work:

1. **§6.10 — a session.** Until the app can sign in somewhere (hosted identity with a working mail path, or a
   local API layer in the harness), the six screens' scoped/empty/error/permission states cannot be looked at.
2. **§6.9 — the hosted re-apply.** `016`–`019` are corrected locally and stale in the cloud; that is a hosted
   write and needs the same explicit go-ahead the original apply had.
3. **§6.11 — the SEND ladder.** The client's `KOT_SENDABLE_ORDER_STATUSES` and `018`'s gate disagree; one of them
   moves, and the verifier edge moves with it.

After that, **Prompt #05** owns what #04 deliberately left out: the KDS printer path, bill splits, shifts, and
the day close whose figures must agree with the printed bill.
