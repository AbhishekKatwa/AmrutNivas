# Marketing, Campaigns & Customer Engagement

> Prompt #30 — Marketing, Campaigns & Customer Engagement

## Overview

Marketing is the campaign execution and customer engagement layer for AMRUT NIVAAS. It activates the existing Customer 360 graph (CRM customers, loyalty accounts, preferences, communication channels) for targeted campaigns, offers, and engagement tracking.

**Core principles:**
- **CRM-native** — operates on existing customers, preferences, and consent; never duplicates customer data
- **Deterministic audiences** — audience membership is computed from conditions, not guessed
- **Consent-first** — every message respects channel-level opt-in/opt-out from CustomerPreference
- **Attribution-aware** — every conversion traces back to a campaign touchpoint
- **Lifecycle-managed** — campaigns flow through explicit status transitions with validation gates

## Architecture

### Domain Model

```
MarketingCampaign
  ├── audience: MarketingAudience (dynamic or snapshot)
  ├── messages: CampaignMessage[] (per channel)
  ├── offers: MarketingOffer[] (linked promotions)
  ├── performance: CampaignPerformance (computed)
  └── attributions: CampaignAttribution[] (conversion links)

MarketingAudience
  ├── sourceType: DYNAMIC | SNAPSHOT
  ├── definition: AudienceDefinition (conditions + matchMode)
  └── members: resolved from CRM customer graph

MarketingOffer
  ├── offerType: DISCOUNT_PERCENT | DISCOUNT_AMOUNT | COMPLEMENTARY | BUNDLE
  ├── promoCodes: PromotionCode[]
  ├── redemptions: OfferRedemption[]
  └── scope: nullable entity filter (menu item, room type, etc.)

MarketingJourney
  ├── steps: JourneyStep[] (ordered automation flow)
  └── frequencyPolicy: FrequencyPolicy (throttle rules)

MarketingConsent
  └── extends CustomerPreference with channel-level opt-in/out
```

### Campaign Lifecycle

```
DRAFT → REVIEW → APPROVED → SCHEDULED → RUNNING → COMPLETED
                                         ↕
                                       PAUSED
         (any active state) → CANCELLED
```

**Validation gate** — `validateCampaignForLaunch()` checks:
- At least one message configured
- Audience has members
- Start/end dates are valid
- Offers are within validity window
- Consent compliance for all target channels

### Service Layer

In-memory `Map<EntityId, T>` stores with `ensureSeeding()` for deterministic demo data. All functions are company-scoped via `orgId`.

**Key services:**
- `listCampaigns(orgId)` / `getCampaign(id)` / `createCampaign()` / `updateCampaign()`
- `transitionCampaignStatus(id, target)` — enforces valid state transitions
- `validateCampaignForLaunch(id)` — returns array of blocking issues
- `listAudiences(orgId)` / `createAudience()` / `resolveAudienceMembers(id)`
- `listOffers(orgId)` / `createOffer()` / `redeemOffer()`
- `listDeliveries(campaignId)` / `getCampaignPerformance(campaignId)`
- `getMarketingKPIs(orgId)` / `getMarketingFunnel(campaignId)`
- `getChannelPerformance(orgId)` / `getCustomerGrowth(orgId)`

## Screens

### Marketing Dashboard (`/marketing`)

Executive overview with:
- KPI cards: active campaigns, total reach, delivery rate, open rate, click rate, conversions, attributed revenue, offer redemptions
- Campaign pipeline — campaigns grouped by status
- Channel performance — delivery/engagement rates per channel (SMS, EMAIL, WHATSAPP, PUSH)
- Active offers — current promotions with redemption progress
- Recent activity — latest deliveries and conversions

### Campaign List (`/marketing/campaigns`)

Searchable, filterable list of all campaigns with:
- Status badge (DRAFT, REVIEW, SCHEDULED, RUNNING, PAUSED, COMPLETED, CANCELLED)
- Campaign type + objective
- Date range and budget
- Click-through to detail page

### Campaign Detail (`/marketing/campaigns/:campaignId`)

Full campaign view with:
- Status transitions (Schedule, Launch, Pause, Resume, Approve, Cancel)
- Launch checklist (validation errors shown as warnings)
- Performance metrics: reach, delivered, opened, clicked, conversions, revenue
- Campaign details: audience size, channels, dates, budget
- Conversion funnel visualization
- Recent deliveries table

### Marketing Analytics (`/marketing/analytics`)

Deep analytics with:
- KPI trends over time
- Channel-level performance breakdown
- Customer growth (new, returning, reactivated)
- Overall delivery/open/click/conversion rates
- Revenue attribution by channel

### Audience List (`/marketing/audiences`)

Audience segment management:
- Dynamic vs snapshot audience types
- Condition-based membership rules
- Search and filter
- Audience detail with condition count and match mode

## Permissions

| Permission | Description |
|---|---|
| `marketing.dashboard.view` | View marketing dashboard |
| `marketing.campaign.view` | View campaigns |
| `marketing.campaign.create` | Create campaigns |
| `marketing.campaign.edit` | Edit campaigns |
| `marketing.campaign.launch` | Launch/schedule campaigns |
| `marketing.campaign.approve` | Approve campaigns for launch |
| `marketing.audience.view` | View audiences |
| `marketing.audience.create` | Create audiences |
| `marketing.offer.view` | View offers |
| `marketing.offer.create` | Create offers |
| `marketing.analytics.view` | View marketing analytics |

## Routes

| Path | Component |
|---|---|
| `/marketing` | MarketingDashboard |
| `/marketing/campaigns` | CampaignListPage |
| `/marketing/campaigns/new` | CampaignCreatePage |
| `/marketing/campaigns/:campaignId` | CampaignDetailPage |
| `/marketing/analytics` | MarketingAnalyticsPage |
| `/marketing/audiences` | AudienceListPage |
| `/marketing/offers` | OfferListPage |
| `/marketing/journeys` | JourneyListPage |
| `/marketing/consent` | ConsentManagementPage |
| `/marketing/settings` | MarketingSettingsPage |

## Integration Points

- **CRM** — audiences resolve from CRM customer graph; campaigns track customer attributions
- **Loyalty** — offers integrate with loyalty accounts; redemptions update point balances
- **Notifications** — campaigns use notification channels (SMS, EMAIL, WHATSAPP, PUSH)
- **Commerce** — offers scope to menu items, room types, event packages
- **Analytics** — marketing KPIs feed into the centralized analytics service

## Data Flow

```
Audience Resolution
  CRM customers → condition evaluation → member list → campaign targeting

Campaign Execution
  Campaign + Audience + Messages → delivery queue → channel dispatch → delivery tracking

Attribution
  Delivery → open/click tracking → conversion event → CampaignAttribution row

Offer Redemption
  PromotionCode scan → validity check → consent check → OfferRedemption → loyalty update
```

## Design Decisions

1. **No separate customer store** — marketing operates on CRM customers, not a parallel list
2. **Deterministic audiences** — conditions are re-evaluated, not cached with TTL
3. **Consent at delivery time** — checked per-message, not batch-filtered
4. **Revenue attribution is touchpoint-based** — first-touch for new customers, last-touch for conversions
5. **Journey steps are sequential** — no parallel branches in V1
6. **Frequency policies are global** — one throttle per customer per channel, not per campaign
