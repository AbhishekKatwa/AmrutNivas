# Guest Experience Hub

**Prompt #31**: Digital Guest Journey, Guest Portal & Hospitality Experience Hub  
**Phase**: 17  
**Status**: Implemented  
**Last Updated**: 2026-10-08

---

## Overview

The Guest Experience Hub is a customer-facing experience layer that overlays existing operational systems (PMS, Restaurant, Events, CRM, Loyalty) to provide guests with a unified portal for their entire journey.

Instead of internal module names, guests see:
- **My Trip, My Stay, My Orders, My Events, My Requests, My Bills, My Rewards, My Feedback, My Offers**

This creates a seamless, personalized experience from booking through post-stay engagement.

---

## Architecture

### Domain Structure

```
src/domain/guest-experience/
├── types.ts                          # Domain type definitions
└── guest-experience-service.ts       # In-memory service layer
```

### Service Pattern

- **In-memory storage**: `Map<EntityId, T>` for all entities
- **Deterministic seeding**: `ensureSeeding()` populates demo data
- **Scoped queries**: All list functions filter by `organizationId` + `customerId`
- **Immutable updates**: Spread operator for state changes

### Permission Model

All guest experience operations are gated by permissions in the `guest_experience` domain:

```typescript
"guest_experience.view"              // View dashboard and general pages
"guest_experience.request.view"      // View service requests
"guest_experience.request.create"    // Create service requests
"guest_experience.checkin.view"      // View digital check-in
"guest_experience.conversation.view" // View concierge conversations
```

---

## Core Entities

### 1. Guest Journey

Tracks the complete lifecycle of a guest's interaction with the property.

```typescript
type GuestJourney = {
  id: EntityId;
  organizationId: EntityId;
  customerId: EntityId;
  reservationId?: EntityId;
  stage: GuestJourneyStage;
  startedAt: string;
  lastActivityAt: string;
  completedAt?: string;
};

type GuestJourneyStage =
  | "DISCOVERY"
  | "BOOKING"
  | "PRE_ARRIVAL"
  | "ARRIVAL"
  | "IN_STAY"
  | "CHECKOUT"
  | "POST_STAY"
  | "RE_ENGAGEMENT";
```

### 2. Service Requests

Guest-initiated requests for services, amenities, or information.

```typescript
type GuestServiceRequest = {
  id: EntityId;
  organizationId: EntityId;
  customerId: EntityId;
  category: ServiceRequestCategory;
  title: string;
  description: string;
  priority: ServiceRequestPriority;
  status: ServiceRequestStatus;
  customerVisibleStatus: CustomerVisibleStatus;
  assignedTo?: EntityId;
  createdAt: string;
  acknowledgedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
};

type ServiceRequestCategory =
  | "HOUSEKEEPING"
  | "ROOM_SERVICE"
  | "MAINTENANCE"
  | "CONCIERGE"
  | "AMENITIES"
  | "TRANSPORT"
  | "OTHER";

type ServiceRequestPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

type ServiceRequestStatus =
  | "PENDING"
  | "ACKNOWLEDGED"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

type CustomerVisibleStatus =
  | "RECEIVED"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";
```

**Status Mapping**: Internal status maps to customer-visible status for transparency:
- `PENDING` → `RECEIVED`
- `ACKNOWLEDGED` → `ACKNOWLEDGED`
- `ASSIGNED`, `IN_PROGRESS` → `IN_PROGRESS`
- `COMPLETED` → `COMPLETED`
- `CANCELLED` → `CANCELLED`

### 3. Pre-Check-In

Digital check-in completion before arrival.

```typescript
type PreCheckIn = {
  id: EntityId;
  organizationId: EntityId;
  customerId: EntityId;
  reservationId: EntityId;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  adults: number;
  children: number;
  estimatedArrival?: string;
  documentStatus: "NOT_UPLOADED" | "UPLOADED" | "VERIFIED";
  specialRequests?: string;
  preferences?: string;
  status: PreCheckInStatus;
  createdAt: string;
  submittedAt?: string;
  completedAt?: string;
};

type PreCheckInStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "REVIEW_REQUIRED"
  | "COMPLETED"
  | "CANCELLED";
```

### 4. Guest Conversations

Concierge chat conversations between guests and staff.

```typescript
type GuestConversation = {
  id: EntityId;
  organizationId: EntityId;
  customerId: EntityId;
  subject: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  assignedTo?: EntityId;
  createdAt: string;
  lastMessageAt: string;
  messages: GuestMessage[];
};

type GuestMessage = {
  id: EntityId;
  conversationId: EntityId;
  senderType: "GUEST" | "STAFF" | "SYSTEM";
  senderId?: EntityId;
  content: string;
  createdAt: string;
};
```

### 5. Guest Notifications

Push notifications and alerts for guests.

```typescript
type GuestNotification = {
  id: EntityId;
  organizationId: EntityId;
  customerId: EntityId;
  category: GuestNotificationCategory;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

type GuestNotificationCategory =
  | "GENERAL"
  | "REQUESTS"
  | "PAYMENTS"
  | "OFFERS"
  | "REMINDERS";
```

### 6. Guest Feedback

Post-stay feedback and ratings.

```typescript
type GuestFeedback = {
  id: EntityId;
  organizationId: EntityId;
  customerId: EntityId;
  reservationId?: EntityId;
  overallRating: number; // 1-5
  categories: FeedbackCategoryRating[];
  comments?: string;
  wouldReturn: boolean;
  createdAt: string;
};

type FeedbackCategoryRating = {
  category: FeedbackCategory;
  rating: number; // 1-5
};

type FeedbackCategory =
  | "ROOM"
  | "SERVICE"
  | "CLEANLINESS"
  | "FOOD"
  | "AMENITIES"
  | "LOCATION"
  | "VALUE";
```

### 7. Loyalty Program

Guest loyalty points and rewards.

```typescript
type GuestLoyalty = {
  id: EntityId;
  organizationId: EntityId;
  customerId: EntityId;
  tier: LoyaltyTier;
  points: number;
  lifetimePoints: number;
  joinedAt: string;
  lastActivityAt: string;
};

type LoyaltyTier = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";

type LoyaltyReward = {
  id: EntityId;
  organizationId: EntityId;
  name: string;
  description: string;
  pointsRequired: number;
  category: "ROOM_UPGRADE" | "DINING" | "SPA" | "AMENITIES" | "OTHER";
  available: boolean;
};
```

### 8. Special Offers

Personalized offers and promotions.

```typescript
type GuestOffer = {
  id: EntityId;
  organizationId: EntityId;
  customerId?: EntityId; // null = available to all
  title: string;
  description: string;
  offerType: "DISCOUNT" | "UPGRADE" | "PACKAGE" | "COMPLIMENTARY";
  discountPercent?: number;
  discountAmount?: number;
  validFrom: string;
  validUntil: string;
  terms?: string;
  redeemed: boolean;
  redeemedAt?: string;
};
```

---

## Service Functions

### Journey Management

```typescript
getGuestJourney(organizationId, customerId): GuestJourney | null
advanceJourneyStage(organizationId, customerId, stage): void
```

### Service Requests

```typescript
listServiceRequests(organizationId, options): GuestServiceRequest[]
createServiceRequest(organizationId, data): GuestServiceRequest
transitionServiceRequestStatus(id, newStatus): GuestServiceRequest | undefined
```

### Pre-Check-In

```typescript
listPreCheckIns(organizationId, options): PreCheckIn[]
submitPreCheckIn(id): void
```

### Conversations

```typescript
listConversations(organizationId, options): GuestConversation[]
createConversation(organizationId, data): GuestConversation
sendMessage(conversationId, senderType, content): GuestMessage
```

### Notifications

```typescript
listGuestNotifications(organizationId, options): GuestNotification[]
markNotificationRead(id): void
markAllNotificationsRead(organizationId, customerId): void
```

### Feedback

```typescript
listGuestFeedback(organizationId, options): GuestFeedback[]
submitFeedback(organizationId, data): GuestFeedback
```

### Loyalty

```typescript
getGuestLoyalty(organizationId, customerId): GuestLoyalty | null
listLoyaltyRewards(organizationId): LoyaltyReward[]
redeemReward(rewardId, customerId): void
```

### Offers

```typescript
listGuestOffers(organizationId, customerId): GuestOffer[]
redeemOffer(offerId, customerId): void
```

### KPIs

```typescript
getGuestExperienceKPIs(organizationId): GuestExperienceKPIs
```

Returns aggregated metrics:
- Portal users count
- Digital check-ins count
- Digital requests count
- Request completion rate
- Room service orders
- Guest payments
- Guest feedback count
- Digital engagement rate
- Digital check-in rate

---

## Integration Points

### PMS Integration

- **Reservations**: Guest journey starts from reservation data
- **Stays**: Check-in/check-out triggers journey stage transitions
- **Folios**: Billing data feeds into "My Bills" view

### Restaurant Integration

- **Orders**: Guest can view their dining orders in "My Orders"
- **Room Service**: Service requests for room service integrate with restaurant POS

### Events Integration

- **Event Bookings**: Guest can view their event reservations in "My Events"

### CRM Integration

- **Customer Profile**: Guest data syncs with CRM customer records
- **Preferences**: Guest preferences feed into CRM for personalization

### Loyalty Integration

- **Points**: Earn points from stays, dining, events
- **Rewards**: Redeem points for upgrades, amenities, services

---

## Security Considerations

### Customer Isolation

All queries are scoped to `organizationId` + `customerId` to ensure guests only see their own data.

### Permission Gates

Every page checks permissions before rendering:

```typescript
const canView = can("guest_experience.view", permissions);
if (!canView) {
  return <EmptyState title="Access Denied" />;
}
```

### Data Validation

Service functions validate required fields and entity existence before operations.

---

## Demo Data

The service layer seeds deterministic demo data for testing:

- **1 guest journey**: Active IN_STAY journey for demo customer
- **3 service requests**: Various statuses (COMPLETED, IN_PROGRESS, PENDING)
- **2 pre-check-ins**: One completed, one in progress
- **2 conversations**: Open and resolved conversations
- **5 notifications**: Mix of read/unread across categories
- **2 feedback entries**: Recent feedback with ratings
- **1 loyalty profile**: Gold tier with 2,450 points
- **4 rewards**: Various categories and point requirements
- **3 offers**: Active offers available for redemption

Demo customer ID: `cust_demo_1`

---

## Future Enhancements

### Phase 2 Features

1. **Mobile App**: Native iOS/Android app for guest portal
2. **Push Notifications**: Real-time push notifications for requests and offers
3. **Digital Key**: Mobile room key via NFC/Bluetooth
4. **In-App Payments**: Pay bills and redeem rewards in-app
5. **Chat Bot**: AI-powered concierge for common requests
6. **Personalization Engine**: ML-driven offer recommendations
7. **Social Sharing**: Share experiences on social media
8. **Multi-Language Support**: i18n for international guests

### Integration Roadmap

1. **Channel Manager**: Sync availability and rates
2. **Revenue Management**: Dynamic pricing integration
3. **Housekeeping**: Real-time room status updates
4. **Maintenance**: Work order integration
5. **Accounting**: Automatic folio posting
6. **Analytics**: Guest behavior analytics and reporting

---

## Related Documentation

- [Digital Guest Journey](./DIGITAL_GUEST_JOURNEY.md) - Journey stages and automation
- [Guest Portal](./GUEST_PORTAL.md) - Customer-facing portal details
- [Hotel PMS](./HOTEL_PMS.md) - Property management system
- [CRM](./CRM.md) - Customer relationship management
- [Loyalty Programs](./LOYALTY.md) - Loyalty program details

---

## Implementation Notes

### Demo Customer Workaround

The `ActiveContext` type does not include `customerId` (only `organizationId`, `propertyId`, `outletId`). Pages use a demo customer ID constant:

```typescript
const DEMO_CUSTOMER_ID = "cust_demo_1";
```

In production, this would come from the authenticated session.

### Status Mapping

Service requests use internal status for staff workflows and customer-visible status for guest transparency. The mapping is handled automatically by `transitionServiceRequestStatus()`.

### Immutable Updates

All state updates use spread operator to maintain immutability:

```typescript
let updated = { ...existing, status: newStatus };
if (newStatus === "ACKNOWLEDGED") updated = { ...updated, acknowledgedAt: now() };
```

---

**Module Owner**: Guest Experience Team  
**Contact**: guest-experience@amrut.com  
**Version**: 1.0.0
