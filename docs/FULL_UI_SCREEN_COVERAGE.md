# AMRUT NIVAAS — FULL UI SCREEN COVERAGE

Per Master Prompt #36 §60. Every discoverable screen gets a coverage row.

## Coverage matrix columns

| Column | Meaning |
|---|---|
| Module | Which vertical owns the screen |
| Screen | The human name |
| Route | The path |
| Roles tested | Which demo users exercised it |
| C | Create — wrote a new record |
| R | Read — listed / viewed |
| U | Update — edited an existing record |
| D | Delete / Archive — soft-removed a record |
| S | Search — query worked |
| F | Filter — filter chips worked |
| V | Validation — required / format gates fired |
| P | Permission — denied rows / buttons hidden |
| X | Persistence — survived reload |
| M | Responsive — desktop + mobile widths |
| CM | Cross-module — at least one chain ran through here |
| Status | PASS / PASS WITH ISSUE / FAIL / BLOCKED / NOT TESTED |

Legend per cell: ✓ done · — not applicable / not yet · ✗ broken.

---

## AUTH (4 screens)

| Screen | Route | Roles | C | R | U | D | S | F | V | P | X | M | CM | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sign in (login matrix) | `/sign-in` | all | — | — | — | — | — | — | ✓ | ✓ | ✓ | ✓ | — | PASS |
| Logout + protected routes | header | all | — | — | — | — | — | — | ✓ | ✓ | ✓ | ✓ | — | PASS |
| Session persistence | all | all | — | — | — | — | — | — | — | ✓ | ✓ | — | — | PASS |
| Forgot password | `/sign-in` sheet | owner | — | — | — | — | — | — | ✓ | ✓ | — | ✓ | — | FAIL (UI-0004) |

## ORG (4 screens)

| Screen | Route | Roles | C | R | U | D | S | F | V | P | X | M | CM | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Organization | `/organization` | OWNER | ✓ | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | — | PASS |
| Departments | `/departments` | OWNER, MGR | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| Team (members) | `/team` | OWNER, MGR | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| Roles & permissions | `/roles` | OWNER | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |

## PROPERTY / OUTLET / DASH (3 screens)

| Screen | Route | Roles | C | R | U | D | S | F | V | P | X | M | CM | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Properties | `/properties` | OWNER, MGR | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS WITH ISSUE (UI-0010 fixed) |
| Outlets | `/outlets` | OWNER, MGR | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| Foundation status | `/` | OWNER | — | ✓ | — | — | — | — | — | ✓ | ✓ | ✓ | ✓ | PASS (UI-0001/0011/0012 fixed) |

## RESTAURANT (8 screens)

| Screen | Route | Roles | C | R | U | D | S | F | V | P | X | M | CM | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Menu management | `/menu` | OWNER, MGR | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| Tables & floor | `/tables` | OWNER, MGR | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | PASS WITH ISSUE (UI-0013 fixed) |
| POS | `/pos` | OWNER, MGR, STAFF | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS WITH ISSUE (UI-0014 fixed) |
| Bills & payments | `/billing` | OWNER, MGR, STAFF | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS WITH ISSUE (UI-0015/0016 fixed) |
| Shifts | `/shifts` | OWNER, MGR | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS WITH ISSUE (UI-0017 fixed) |
| Stations | `/stations` | OWNER, MGR | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| Restaurant day | `/restaurant` | OWNER, MGR | — | ✓ | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | PASS |
| Kitchen display | `/kitchen` | OWNER, MGR, STAFF | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS WITH ISSUE (UI-0018 fixed) |

---

## INVENTORY / PROCUREMENT (12 screens — Phase A)

The Create-dialog code is present and `tsc --noEmit` is clean for every page below (UI-0019 through UI-0026 are FIXED at the source level). The browser-level execution, RBAC checks, validation triggers, and persistence verification are all DEFERRED to a Phase A retest pass — none of the ✓ cells below have been actually exercised yet.

| Screen | Route | Roles | C | R | U | D | S | F | V | P | X | M | CM | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Inventory overview | `/inventory` | OWNER, MGR | — | — | — | — | — | — | — | — | — | — | — | NOT TESTED |
| Items | `/inventory/items` | OWNER, MGR | (UI ready, UI-0021) | — | — | — | — | — | — | — | — | — | — | FIXED code-level (not exercised) |
| Stock | `/inventory/stock` | OWNER, MGR, STAFF | — | — | — | — | — | — | — | — | — | — | — | NOT TESTED |
| Movements | `/inventory/movements` | OWNER, MGR | — | — | — | — | — | — | — | — | — | — | — | NOT TESTED |
| Locations | `/inventory/locations` | OWNER, MGR | — | — | — | — | — | — | — | — | — | — | — | NOT TESTED |
| Recipes | `/inventory/recipes` | OWNER, MGR | (UI ready, UI-0022) | — | — | — | — | — | — | — | — | — | — | FIXED code-level (not exercised) |
| Wastage | `/inventory/wastage` | OWNER, MGR, STAFF | — | — | — | — | — | — | — | — | — | — | — | NOT TESTED |
| Transfers | `/inventory/transfers` | OWNER, MGR | — | — | — | — | — | — | — | — | — | — | — | NOT TESTED |
| Stock takes | `/inventory/stock-takes` | OWNER, MGR | (UI ready, UI-0023) | — | — | — | — | — | — | — | — | — | — | FIXED code-level (not exercised) |
| Purchases | `/inventory/purchases` | OWNER, MGR, FINANCE | (UI ready, UI-0020/0024/0025/0026) | — | — | — | — | — | — | — | — | — | — | FIXED code-level (not exercised) |
| Suppliers | `/inventory/suppliers` | OWNER, MGR, FINANCE | (UI ready, UI-0019) | — | — | — | — | — | — | — | — | — | — | FIXED code-level (not exercised) |
| Procurement dashboard | `/procurement` | OWNER, MGR, FINANCE | — | — | — | — | — | — | — | — | — | — | — | NOT TESTED |

## HOTEL / HK / MX (11 screens — Phase B)

_(All NOT TESTED.)_

## FINANCE (4 screens — Phase C)

_(All NOT TESTED.)_

## CRM / EVENTS / HR (19 screens — Phase D)

_(All NOT TESTED.)_

## COMMERCE / PUBLIC (12 screens — Phase E)

_(All NOT TESTED.)_

## ENTERPRISE / BILLING / NOTIFICATIONS / AI / INTEGRATIONS / PLATFORM / ONBOARDING / DOCUMENTS (24 screens — Phase F)

_(All NOT TESTED.)_

## WORKFLOWS / REVENUE / PROCUREMENT / EXPERIENCE / MARKETING / GUEST / SETTINGS (33 screens — Phase G)

_(All NOT TESTED.)_
