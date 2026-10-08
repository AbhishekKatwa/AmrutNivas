# Digital Guest Journey

**Prompt #31**: Digital Guest Journey Stages & Automation  
**Phase**: 17  
**Status**: Implemented  
**Last Updated**: 2026-10-08

---

## Overview

The Digital Guest Journey tracks every interaction a guest has with the property, from initial discovery through post-stay engagement. Each stage triggers automated workflows, notifications, and personalized experiences.

---

## Journey Stages

### 1. DISCOVERY

**Trigger**: Guest first interacts with the property (website visit, inquiry, referral)

**Activities**:
- Browse property information
- View room types and amenities
- Explore dining options
- Check event calendar
- View special offers

**Automations**:
- Send welcome email with property brochure
- Track browsing behavior for personalization
- Offer first-time visitor discount

**Data Captured**:
- Source channel (website, OTA, referral)
- Interests (room types, amenities, events)
- Contact information (if provided)

**Success Metrics**:
- Website conversion rate
- Inquiry-to-booking ratio
- Offer redemption rate

---

### 2. BOOKING

**Trigger**: Guest makes a reservation

**Activities**:
- Select dates and room type
- Choose rate plan
- Add special requests
- Provide guest information
- Complete payment or guarantee

**Automations**:
- Send booking confirmation email
- Create guest profile in CRM
- Initialize guest journey record
- Trigger pre-arrival sequence (7 days before arrival)
- Sync reservation to PMS

**Data Captured**:
- Reservation details (dates, room type, rate)
- Guest preferences (room location, bed type, etc.)
- Special requests (early check-in, amenities, etc.)
- Payment information

**Success Metrics**:
- Booking conversion rate
- Average lead time (booking to arrival)
- Special request fulfillment rate

**Integration Points**:
- **PMS**: Create reservation record
- **CRM**: Create/update customer profile
- **Channel Manager**: Update availability
- **Revenue Management**: Update forecasts

---

### 3. PRE_ARRIVAL

**Trigger**: 7 days before arrival (configurable)

**Activities**:
- Complete digital check-in
- Upload identification documents
- Select room preferences
- Order special amenities
- Schedule airport transfer
- Pre-order room service
- Make dining reservations
- Book spa treatments

**Automations**:
- Send pre-arrival email with digital check-in link
- Enable mobile check-in in guest portal
- Notify housekeeping of special requests
- Pre-assign room based on preferences
- Prepare welcome amenities

**Data Captured**:
- Digital check-in completion status
- Document upload status
- Special requests and preferences
- Pre-ordered services

**Success Metrics**:
- Digital check-in completion rate
- Pre-arrival engagement rate
- Upsell conversion rate

**Integration Points**:
- **Housekeeping**: Notify of special requests
- **Concierge**: Prepare for special arrangements
- **Restaurant**: Pre-ordered dining reservations
- **Spa**: Pre-booked treatments

---

### 4. ARRIVAL

**Trigger**: Guest arrives at property (check-in)

**Activities**:
- Verify identity and documents
- Receive room key (physical or digital)
- Get orientation to property
- Access welcome amenities
- Connect to Wi-Fi
- Download mobile app

**Automations**:
- Send welcome message with property information
- Enable in-stay services in guest portal
- Notify relevant staff of arrival
- Update journey stage to IN_STAY
- Trigger room service welcome offer

**Data Captured**:
- Actual arrival time
- Check-in method (digital, front desk)
- Document verification status
- Welcome amenity acceptance

**Success Metrics**:
- Check-in time (target < 3 minutes for digital)
- Guest satisfaction with arrival experience
- Mobile app download rate

**Integration Points**:
- **PMS**: Update stay record, assign room
- **Housekeeping**: Mark room as occupied
- **POS**: Enable charging to room
- **Loyalty**: Credit points for stay

---

### 5. IN_STAY

**Trigger**: Guest is actively staying at property

**Activities**:
- Make service requests (housekeeping, room service, maintenance)
- Chat with concierge
- View and pay bills
- Book additional services
- Provide real-time feedback
- Redeem loyalty rewards
- Access special offers

**Automations**:
- Send daily digest of available activities
- Notify of upcoming reservations (dining, spa)
- Trigger mid-stay satisfaction check (day 2+)
- Offer upgrades or extensions
- Send personalized recommendations

**Data Captured**:
- Service requests and response times
- Spending patterns (room service, amenities)
- Engagement with offers and recommendations
- Real-time feedback

**Success Metrics**:
- Service request response time
- Upsell conversion rate
- Guest engagement rate
- Mid-stay satisfaction score

**Integration Points**:
- **Service Requests**: Track and fulfill guest requests
- **Restaurant**: Room service orders
- **Spa/Activities**: Additional bookings
- **Billing**: Real-time folio updates
- **Loyalty**: Accrue points for spending

---

### 6. CHECKOUT

**Trigger**: Guest checks out (departure day)

**Activities**:
- Review final bill
- Settle outstanding charges
- Return room key
- Provide checkout feedback
- Request receipt
- Arrange transportation

**Automations**:
- Send checkout reminder (morning of departure)
- Prepare final folio
- Enable express checkout in portal
- Send checkout confirmation
- Trigger post-stay survey (24 hours after departure)

**Data Captured**:
- Checkout time
- Payment method
- Final bill amount
- Checkout feedback

**Success Metrics**:
- Express checkout adoption rate
- Checkout time (target < 2 minutes)
- Bill dispute rate
- Checkout satisfaction score

**Integration Points**:
- **PMS**: Close stay record, release room
- **Finance**: Post final charges, reconcile payments
- **Housekeeping**: Mark room for cleaning
- **Loyalty**: Final points credit

---

### 7. POST_STAY

**Trigger**: 24 hours after checkout

**Activities**:
- Complete post-stay survey
- Share experience on social media
- Write online review
- Redeem post-stay offers
- Plan next visit

**Automations**:
- Send thank-you email
- Deliver post-stay survey
- Request online review (TripAdvisor, Google)
- Send personalized rebooking offer
- Share experience highlights (photos, memories)

**Data Captured**:
- Post-stay survey responses
- Review ratings and comments
- Offer redemption
- Rebooking intent

**Success Metrics**:
- Survey completion rate
- Online review rate
- Rebooking rate
- Net Promoter Score (NPS)

**Integration Points**:
- **CRM**: Update guest profile with feedback
- **Marketing**: Trigger re-engagement campaigns
- **Reputation Management**: Monitor online reviews
- **Revenue Management**: Update forecasts

---

### 8. RE_ENGAGEMENT

**Trigger**: 30+ days after checkout (configurable)

**Activities**:
- Receive personalized offers
- Browse upcoming events
- Plan next visit
- Redeem loyalty rewards
- Refer friends

**Automations**:
- Send seasonal promotions
- Notify of relevant events
- Offer loyalty reward redemption
- Request referral
- Share property updates

**Data Captured**:
- Offer engagement
- Event interest
- Referral activity
- Rebooking behavior

**Success Metrics**:
- Re-engagement rate
- Offer redemption rate
- Referral conversion rate
- Repeat booking rate

**Integration Points**:
- **Marketing**: Personalized campaigns
- **Events**: Event recommendations
- **Loyalty**: Reward redemption
- **CRM**: Update guest preferences

---

## Journey Automation Rules

### Stage Transitions

```typescript
// Automatic transitions
DISCOVERY → BOOKING: On reservation creation
BOOKING → PRE_ARRIVAL: 7 days before arrival
PRE_ARRIVAL → ARRIVAL: On check-in
ARRIVAL → IN_STAY: After check-in completion
IN_STAY → CHECKOUT: On checkout
CHECKOUT → POST_STAY: 24 hours after checkout
POST_STAY → RE_ENGAGEMENT: 30 days after checkout

// Manual transitions (staff-initiated)
Any stage → RE_ENGAGEMENT: On guest request
Any stage → POST_STAY: On early departure
```

### Notification Triggers

| Stage | Trigger | Notification Type | Recipient |
|-------|---------|-------------------|-----------|
| BOOKING | Reservation created | Email | Guest |
| PRE_ARRIVAL | 7 days before | Email + Push | Guest |
| PRE_ARRIVAL | 1 day before | Email + SMS | Guest |
| ARRIVAL | Check-in complete | Push | Guest |
| IN_STAY | Service request created | Push | Staff |
| IN_STAY | Service request completed | Push | Guest |
| IN_STAY | Mid-stay check (day 2+) | Email | Guest |
| CHECKOUT | Morning of departure | Email + Push | Guest |
| CHECKOUT | Checkout complete | Email | Guest |
| POST_STAY | 24 hours after | Email | Guest |
| RE_ENGAGEMENT | 30 days after | Email | Guest |

### Escalation Rules

```typescript
// Service request escalation
PENDING → ACKNOWLEDGED: Within 15 minutes
ACKNOWLEDGED → ASSIGNED: Within 30 minutes
ASSIGNED → IN_PROGRESS: Within 1 hour
IN_PROGRESS → COMPLETED: Within 4 hours (or SLA)

// Escalation alerts
If PENDING > 15 min: Notify supervisor
If ASSIGNED > 1 hour: Notify manager
If IN_PROGRESS > SLA: Notify director
```

---

## Personalization Engine

### Data Sources

1. **Booking Data**: Room type, rate plan, special requests
2. **Stay History**: Previous visits, spending patterns
3. **Preferences**: Room location, bed type, amenities
4. **Behavior**: Portal activity, offer engagement
5. **Feedback**: Survey responses, reviews
6. **Loyalty**: Tier, points, reward preferences

### Personalization Rules

```typescript
// Room preferences
If guest prefers "high floor" AND available:
  Assign high floor room

// Amenity preferences
If guest ordered "extra pillows" in last 3 stays:
  Pre-place extra pillows in room

// Dining preferences
If guest is vegetarian:
  Highlight vegetarian options in restaurant menu

// Offer targeting
If guest is Gold tier AND hasn't visited in 6 months:
  Send "We miss you" offer with room upgrade

// Activity recommendations
If guest booked spa in last 2 stays:
  Recommend spa treatments in pre-arrival email
```

### Segmentation

| Segment | Criteria | Personalization |
|---------|----------|-----------------|
| Business Traveler | Frequent weekday stays, short lead time | Express check-in, Wi-Fi priority, business center info |
| Family Vacation | Multiple guests, children, longer stays | Family activities, kids' menu, connecting rooms |
| Romance Getaway | Couple, weekend, special occasion | Room upgrades, champagne, spa packages |
| Loyalty Champion | Platinum tier, frequent visits | Exclusive offers, early check-in, personal concierge |
| First-Time Guest | No previous stays | Property tour, welcome amenities, orientation |

---

## Journey Analytics

### Key Metrics

**Journey Progression**:
- Stage conversion rates
- Average time in each stage
- Drop-off points
- Re-engagement success rate

**Engagement Metrics**:
- Portal login frequency
- Service request volume
- Offer redemption rate
- Mobile app usage

**Satisfaction Metrics**:
- Mid-stay satisfaction score
- Post-stay survey score
- Net Promoter Score (NPS)
- Online review ratings

**Revenue Metrics**:
- Upsell conversion rate
- Average spend per stay
- Loyalty reward redemption value
- Rebooking rate

### Reporting

**Daily Reports**:
- Active journeys by stage
- Service request volume and status
- Digital check-in completion rate

**Weekly Reports**:
- Journey conversion funnel
- Guest satisfaction trends
- Offer performance

**Monthly Reports**:
- Journey analytics summary
- Personalization effectiveness
- Loyalty program performance
- Re-engagement campaign results

---

## Implementation Notes

### Demo Data

The service layer seeds one active journey for the demo customer:

```typescript
{
  stage: "IN_STAY",
  startedAt: "3 days ago",
  lastActivityAt: "2 hours ago"
}
```

### Stage Advancement

Journey stage is advanced automatically based on PMS events:

```typescript
// Check-in event
advanceJourneyStage(orgId, customerId, "ARRIVAL");

// Checkout event
advanceJourneyStage(orgId, customerId, "CHECKOUT");
```

Staff can manually advance stages for special cases.

### Journey Persistence

Journey records are retained for 2 years after the last activity for:
- Historical analysis
- Personalization
- Re-engagement targeting

---

## Related Documentation

- [Guest Experience Hub](./GUEST_EXPERIENCE_HUB.md) - Overall system overview
- [Guest Portal](./GUEST_PORTAL.md) - Customer-facing portal details
- [Hotel PMS](./HOTEL_PMS.md) - Property management system
- [CRM](./CRM.md) - Customer relationship management

---

**Module Owner**: Guest Experience Team  
**Contact**: guest-experience@amrut.com  
**Version**: 1.0.0
