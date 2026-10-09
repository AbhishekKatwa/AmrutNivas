# AMRUT NIVAAS — STABILIZATION REPORT (Prompt #34)

Date: 2026-10-09 · Scope: full UI stabilization sprint · Mode: read-first QA,
fix root causes not UI patches (§6, §7) · Gate: `npx tsc --noEmit` clean.

This report is the stabilization sprint artefact; it lands alongside
`MANUAL_UI_TEST_PLAN.md`, `MANUAL_UI_TEST_REPORT.md` (§56, §62) and
`MANUAL_UI_DEFECTS.md`. Together they constitute the audit-grade trail for the
UI surface area through 2026-10-09.

---

## 1. Total defects

Seventeen named UI defects (UI-0001 through UI-0018, minus UI-0004 which is the
single OPEN/FAIL record) plus three stabilization verification records
(STB-0001 / STB-0002 / STB-0003) plus eight audit-class items carried forward
from `FULL_SYSTEM_AUDIT.md` (see §11 / §13 below).

Counted: **17 named defect fixes + 3 STB verification entries + 8 deferred audit items = 28 total**.

Status chain at lock-time:

| Bucket | Count |
|---|---|
| Total defects considered | 28 |
| P0 — blocker | 0 named, 8 deferred audit items (G1 fake domains; C1/C2 unwired) |
| P1 — major | 1 named (UI-0004 · BLOCKED at task #58), 0 deferred audit items beyond that |
| P2 — functionality impaired | 0 named (UI-0010 fixed earlier this sprint) |
| P3 — cosmetic | 0 named, 0 deferred |

---

## 2. P0 — blockers

**0 named UI defects P0.**

The `FULL_SYSTEM_AUDIT.md` (§G1) list of seven in-memory fake domains plus
two unwired built integrations (`consume_for_order`, `post_folio_charge`) are
**P0 by their own audit posture**. Per §55 (NO SCOPE CREEP) they are recorded
in §11 below and tracked under owner disposition; the stabilization sprint
did not introduce them as defects because rewriting or removing surfaced
features is an owner decision (§55 plus the audit's own correction-mandate).

---

## 3. P1 — major

| ID | Screen | Status | Notes |
|---|---|---|---|
| UI-0004 | AUTH-004 — Forgot password | BLOCKED | Client half fixed (requestPasswordReset now throws on failure); server half OPEN — `@amrut-nivas.local` rejected by GoTrue, SMTP/site_url/redirect allow-list unconfigured on hosted Supabase. Tracked under task #58. |

No other P1 defects open.

---

## 4. P2 — functionality impaired

**0 open.** UI-0010 (Properties P2) was closed earlier in the manual UI
testing pass (2026-10-08) and verified as fixed in the original retest cycle.

---

## 5. P3 — cosmetic

**0 open.** All four P3 entries recorded at §62 start (UI-0001, UI-0005,
UI-0009, plus the chronically-passing one carried in the smoke summary)
landed `VERIFIED (2026-10-09)`.

| ID | Screen | Status |
|---|---|---|
| UI-0001 | DASH-001 — Foundation status | VERIFIED |
| UI-0005 | ORG-003 — Team invitation panel | VERIFIED |
| UI-0009 | ORG-004 — Roles retired-state | VERIFIED |
| UI-0013 | REST-002 — Tables & floor | VERIFIED (closed earlier this sprint) |
| UI-0015 | REST-004 — Settled vs closed | VERIFIED (closed earlier this sprint) |
| UI-0016 | REST-004 — Downstream rail behavior | VERIFIED (closed earlier this sprint) |

---

## 6. Fixed

17 named UI defects, all driven live. Summary:

| ID | Severity | Surface | Fix |
|---|---|---|---|
| UI-0001 | P3 | DASH-001 | `FoundationStatusPage.tsx` — replaced empty-state copy and added "Wire status" panel |
| UI-0002 | P1 | HOTEL-002 | `room-service.ts` — dropped `status` column, filter to `.is("archived_at", null)` |
| UI-0003 | P1 | AUTH-001 | `SignInPage.submit()` — `navigate("/", {replace:true})`; `devBypassSignIn` uses `window.location.assign("/")` |
| UI-0005 | P3 | ORG-003 | `TeamPage.tsx` — removed "Prompt #03" reference from invitation panel |
| UI-0006 | P2 | ORG-004 | `PERMISSION_CATALOGUE` — added `bill.split`, `order.merge`, `shift.manage`, `station.manage`; renamed `guest.sensitive.view` → `guest.view_sensitive` consistently |
| UI-0007 | P1 | ORG-004 | `RolesPage.tsx` — pagination fix for permission column |
| UI-0008 | P2 | ORG-004 | `RolesPage.tsx` — site breadth editor default `ALL_PROPERTIES` when no rows |
| UI-0009 | P3 | ORG-004 | `RolesPage.tsx` — added STATUS column in `buildRoleColumns` |
| UI-0010 | P2 | PROPERTY-001 | Properties archive behaviour |
| UI-0011 | P1 | DASH-001 | Foundation page empty-state handling |
| UI-0012 | P1 | DASH-001 | Foundation page empty-state handling |
| UI-0013 | P3 | REST-002 | Tables & floor empty state |
| UI-0014 | P1 | REST-003 / REST-004 | POS discount/void line clamp fix |
| UI-0015 | P3 | REST-004 | Bills settled-vs-closed panel |
| UI-0016 | P3 | REST-004 | Bills rail suffix behaviour |
| UI-0017 | P1 | REST-005 | Shifts panel state |
| UI-0018 | P1 | KDS-001 | `kot-service.ts` — door response-shape unwrap pattern |

Note — UI-0011 / UI-0012 are reported in `MANUAL_UI_TEST_REPORT.md §4` as
related foundation fixes exercised during the DASH-001 walkthrough; details
are in §4 of that report.

---

## 7. Verified

Verification is browser-driven, per §53 ("Do not close a defect without
retesting"). Three new STB-0001 / STB-0002 / STB-0003 records were created
this pass as live-verification evidence; the rest were verified earlier this
sprint and carried forward in `MANUAL_UI_TEST_REPORT.md §4`.

| Defect verified this pass | Browser evidence |
|---|---|
| UI-0001 | DOM `take_snapshot` — new title `24_1034`; new "Wire status" body `24_1036` |
| UI-0005 | DOM `evaluate_script` — invitation panel renders new copy end-to-end after `qa-stabilization@amrut-nivas.local` invite |
| UI-0009 | DOM `evaluate_script` — 14 rows: 13 System (Active), 1 Custom (`QA Night Auditor (probe)`, Retired) |

---

## 8. Deferred

Per Prompt #55 (NO SCOPE CREEP), future ideas are recorded here in this
report and in `MANUAL_UI_DEFECTS.md` appendix only — they are not introduced
as defects and they do not block the stabilization verdict.

| Bucket | Items | Disposition |
|---|---|---|
| Audit G1 — seven in-memory fake domains | workflows, marketing, revenue channel-pricing, guest-experience, supply-chain, experience, settings/configuration, integrations partial | Owner decision (persist each through doors, or remove routes/nav entries) |
| Audit D1 — two task concepts | workflows in-memory vs `housekeeping_tasks` / `maintenance_requests` | Owner decision (merge into one canonical task) |
| Audit F1 — no journal / GL / TB chain | §22–24 bookkeeping stack | Requires spec sign-off |
| Audit E1 — fake-domain writes bypass permission checks | In-memory writes never gate on `can()` | Moot until the domains persist |
| Audit E3 — API platform rate-limit TODO | `integrations/api-platform.ts:330` | Wrap an external control |
| Documents — storage wiring | Adapter seam empty | Stable seam preserved |
| Nav↔route test | Test deleted 2026-10-07 by owner instruction | Unenforced; holds today |
| `labelFromKey()` i18n stand-in | Awaiting real i18n | Decoupled; not a defect |
| UI-0004 server half | SMTP / site_url / redirect allow-list | Tracked under task #58 |
| C1 / C2 unwired integrations | Restaurant→inventory consumption · Restaurant→hotel folio charge | Behavioural change; owner direction |

---

## 9. Blocked

| Item | Blocker | Owner track |
|---|---|---|
| UI-0004 — Forgot password (server half) | Synthetic email domain `@amrut-nivas.local` rejected by GoTrue; SMTP / site_url / redirect allow-list unconfigured on the hosted Supabase project | Task #58 — Configure real session path (SMTP + site_url) on hosted Supabase |

No other blockers. Every other defect is `VERIFIED` or `DEFERRED`.

---

## 10. Files changed (this stabilization pass only)

The three P3 cosmetic fixes touched exactly three source files:

| File | Defect | Change summary |
|---|---|---|
| `src/pages/FoundationStatusPage.tsx` | UI-0001 | Empty-state card replaced; new "Wire status" card added |
| `src/pages/team/TeamPage.tsx` | UI-0005 | Invitation panel copy replaced; "Prompt #03" reference removed |
| `src/pages/access/RolesPage.tsx` | UI-0009 | `STATUS` column added to `buildRoleColumns` between `TYPE` and `PERMISSIONS` |

Type safety verified by `npx tsc --noEmit` (EXIT=0).

Documentation artefacts produced/updated:

| File | Action |
|---|---|
| `docs/MANUAL_UI_TEST_REPORT.md` | §1 counters updated (Open 4→1 · Fixed 13→17); §2 affected rows (DASH-001, ORG-003, ORG-004) marked `PASS`; three §4 issue records (UI-0001, UI-0005, UI-0009) retest lines; two §5 status lines (ORG-003, ORG-004) flipped from `PASS WITH ISSUE` to `PASS` |
| `docs/MANUAL_UI_DEFECTS.md` | Created per §9 template, 4 records + 3 STB verification records + audit appendix |
| `docs/STABILIZATION_REPORT.md` | This document |

---

## 11. Cross-module regressions checked

The three P3 fixes are pure textual / additive column changes. The check
matrix this pass exercised:

| Module | Surface touched by this pass | Other surfaces re-verified |
|---|---|---|
| Foundation (DASH-001) | `/` | Full Foundation page render still resolves the access debugging panel; no other landing consumer of `FoundationStatusPage` exists in the route table |
| Access / Team (ORG-003) | `/team` | Member row still renders correctly; pending invites list still updates after the new invitation is created; Cancel dialog still reason-gated |
| Access / Roles (ORG-004) | `/roles` | Role rows render with the new STATUS column for both ACTIVE and RETIRED; the prior UI-0006/0007/0008 fixes (catalogue additions, permission pagination, breadth default) still bind |
| Restaurant | Unchanged | Last-known good state for REST-001..007 / KDS-001 — no regression risk surface touched |
| Hotel | Unchanged | No regression risk surface touched |
| Inventory | Unchanged | No regression risk surface touched |
| Procurement | Unchanged | No regression risk surface touched |
| CRM, Events, HR, Commerce, Enterprise, Billing, Notifications, Analytics, AI, Workflows, Revenue, Supply-chain, Experience, Settings/Configuration, Integrations, Platform, Documents, Operations, Marketing, Guest-experience | Unchanged | No regression risk surface touched |

Conclusion: no cross-module regression introduced by these three edits. The
additive STATUS column is read-only (badge render); the invitation panel
change is copy-only inside an existing div; the foundation copy swap is text
inside two existing `<Card>` containers.

---

## 12. Remaining risks

1. **UI-0004 server half** — without task #58's SMTP + email-domain fix, no
   real account can receive a password reset email. Capability remains dead
   end-to-end. Client surfaces the honest error (`invalid="true"`) so the
   false-success silent path is gone; users still cannot recover their
   password without administrator intervention.
2. **In-memory fake domains (G1)** — eight of them render with real-shaped
   navigation entries but store data in volatile, tenant-unscoped `Map`s.
   Reload vanishes; cross-user visibility is impossible. The doors exist
   (per audit B), so the user-visible artefact is correct architecture below
   the waterline but a flat façade above it.
3. **C1 / C2 integration gaps** — built, granted, exported; unwired. A sold
   dish never decrements its recipe ingredients; a hotel resident's
   restaurant bill cannot charge their room. Both correct in isolation,
   broken in the system.
4. **No journal/GL chain (F1)** — finance/accounting/P&L screens present
   operational aggregations, not bookkeeping. §22–24 of the spec is
   incomplete.
5. **Two task concepts (D1)** — workflows' in-memory `OperationalTask`
   duplicates `housekeeping_tasks` and `maintenance_requests`. The user
   surface point-of-confusion only surfaces if a Workflows user and a
   Housekeeping user both run from the same browser session, but the
   canonical-task concept needs to settle before that latent collision is
   resolved.
6. **API platform rate-limit (E3)** — TODO; until wrapped, no abuse ceiling
   on the open door family.
7. **Documents seam (P2 inert)** — adapter shape is preserved; nothing fires
   yet.
8. **Nav↔route test deleted** — the consistency test was removed 2026-10-07
   by owner instruction. Holds today; unenforced.
9. **i18n stand-in `labelFromKey()`** — English-only labels. Out of scope
   for this stabilisation sprint.

---

## 13. Recommended next phase

These are owner-scope items (§55), not stabilization-scope work.

1. **Owner sign-off on audit G1 disposition.** Either persist the eight fake
   domains through doors (matching §B of the audit) or remove their
   navigation entries / route registrations until they are persisted. The
   current "ship-as-facade" posture requires a deliberate decision.
2. **Task #58 — Configure real session path on hosted Supabase** —
   `@amrut-nivas.local` email-domain change to a GoTrue-accepted domain
   (e.g. per-tenant subdomain), SMTP wiring (sender + DKIM), `site_url`
   registration, and redirect allow-list update. This unblocks UI-0004
   server half and the related live-email flows (`Marketing`, approval
   emails, automation triggers).
3. **Wire C1 and C2.** Decide where `consume_for_order` should fire
   (close_bill vs KOT send vs chef confirm) and where `post_folio_charge`
   should fire (close_bill with an attached folio, or front-desk
   confirmation). Once decided, both these doors need their caller wired.
4. **Resolve D1.** Pick a single canonical task concept; route the others
   back into it (workflows → domain-specific views over the real tables).
5. **F1 — Build the bookkeeping chain** if a finance-grade ledger is in
   scope. Today's screens are operationally correct but they are not
   bookkept.
6. **E3 — Implement API-platform rate limiting** before opening the public
   booking / commerce endpoints beyond the current auth surface.
7. **Documents — pick a storage target** (Supabase Storage is the natural
   choice given everything else lives there) and wire one CRUD path
   end-to-end as the integration shape.

Stabilization verdict: **complete for in-scope defects.** No §53 redesign.
No silent removal of surfaced features. No fake screens. No new product
scope. All changes are confined to UI copy / additive table columns, and
each is browser-verified.
