# Guest Portal

**Prompt #31**: Customer-Facing Guest Portal  
**Phase**: 17  
**Status**: Implemented  
**Last Updated**: 2026-10-08

---

## Overview

The Guest Portal is a customer-facing web application that provides guests with a unified interface to manage their entire journey. Instead of internal module names, guests see personalized sections: **My Trip, My Stay, My Orders, My Events, My Requests, My Bills, My Rewards, My Feedback, My Offers**.

---

## Portal Architecture

### Technology Stack

- **Frontend**: React 19 + TypeScript 5.7
- **Styling**: Tailwind CSS v4
- **State Management**: Zustand
- **Routing**: React Router
- **Icons**: Lucide React

### Design Principles

1. **Guest-Centric Language**: Use "My Trip" not "Reservation Management"
2. **Mobile-First**: Optimized for smartphone usage during stay
3. **Progressive Disclosure**: Show relevant information based on journey stage
4. **Real-Time Updates**: Live status for requests and bills
5. **Accessibility**: WCAG 2.1 AA compliance

---

## Portal Pages

### 1. Guest Experience Dashboard (`/guest`)

**Purpose**: Central hub showing journey status and quick actions

**Content**:
- Current journey stage with progress indicator
- Upcoming reservations summary
- Active service requests
- Recent notifications
- Quick action buttons (check-in, requests, concierge)
- Loyalty points summary
- Personalized offers

**Layout**:
```
┌─────────────────────────────────────────┐
│ Welcome back, [Guest Name]              │
│ Journey Stage: IN_STAY (Day 2 of 5)     │
├─────────────────────────────────────────┤
│ Quick Actions                           │
│ [Check-In] [Request] [Concierge]        │
├─────────────────────────────────────────┤
│ My Trip                                 │
│ Reservation #12345                      │
│ Oct 5 - Oct 10, 2026                   │
│ Deluxe Room, 2 Adults                   │
├─────────────────────────────────────────┤
│ Active Requests (2)                     │
│ • Extra towels - In Progress            │
│ • Room service - Received               │
├─────────────────────────────────────────┤
│ Notifications (3 unread)                │
│ • Your request has been acknowledged    │
│ • Dinner reservation confirmed          │
│ • Special offer just for you            │
├─────────────────────────────────────────┤
│ Loyalty Points                          │
│ Gold Tier • 2,450 points                │
└─────────────────────────────────────────┘
```

**Permissions**: `guest_experience.view`

---

### 2. My Bookings (`/guest/bookings`)

**Purpose**: View and manage all reservations

**Content**:
- Upcoming reservations list
- Past stays history
- Reservation details (dates, room type, rate, guests)
- Special requests
- Cancel or modify reservations (if allowed)
- Download confirmation letter

**Features**:
- Filter by status (upcoming, past, cancelled)
- Sort by arrival date
- Expandable reservation details
- Quick actions (modify, cancel, add requests)

**Layout**:
```
┌─────────────────────────────────────────┐
│ My Bookings                             │
│ View and manage your reservations       │
├─────────────────────────────────────────┤
│ [Upcoming] [Past] [Cancelled]           │
├─────────────────────────────────────────┤
│ Reservation #12345                      │
│ Oct 5 - Oct 10, 2026 (5 nights)        │
│ Deluxe Room • 2 Adults • 1 Child        │
│ Rate: ₹8,500/night                      │
│ Status: Confirmed                       │
│                                         │
│ [View Details] [Modify] [Cancel]        │
├─────────────────────────────────────────┤
│ Reservation #11234                      │
│ Aug 15 - Aug 18, 2026 (3 nights)       │
│ Standard Room • 2 Adults                │
│ Status: Completed                       │
│                                         │
│ [View Details] [Book Again]             │
└─────────────────────────────────────────┘
```

**Permissions**: `guest_experience.view`

---

### 3. My Stay (`/guest/stay`)

**Purpose**: Current stay information and room details

**Content**:
- Current reservation details
- Room information (number, type, floor)
- Check-in/check-out times
- Housekeeping schedule
- Room amenities
- Property facilities and hours
- Wi-Fi information
- Emergency contacts

**Features**:
- Digital room key (if enabled)
- Request housekeeping
- Report maintenance issue
- View property map
- Access in-room dining menu

**Layout**:
```
┌─────────────────────────────────────────┐
│ My Stay                                 │
│ Room 501 • Deluxe Room                  │
├─────────────────────────────────────────┤
│ Check-in: Oct 5, 2026 • 2:00 PM        │
│ Check-out: Oct 10, 2026 • 11:00 AM     │
│ Day 2 of 5                              │
├─────────────────────────────────────────┤
│ Room Amenities                          │
│ ✓ King Bed  ✓ Wi-Fi  ✓ Mini Bar        │
│ ✓ Smart TV  ✓ Safe   ✓ Coffee Maker    │
├─────────────────────────────────────────┤
│ Wi-Fi                                   │
│ Network: Amrut_Guests                   │
│ Password: welcome2026                   │
├─────────────────────────────────────────┤
│ Property Facilities                     │
│ • Restaurant: 7 AM - 11 PM             │
│ • Spa: 9 AM - 9 PM                     │
│ • Pool: 6 AM - 10 PM                   │
│ • Gym: 24 hours                         │
├─────────────────────────────────────────┤
│ Quick Actions                           │
│ [Request Housekeeping] [Report Issue]   │
└─────────────────────────────────────────┘
```

**Permissions**: `guest_experience.view`

---

### 4. My Dining (`/guest/dining`)

**Purpose**: View dining options and order room service

**Content**:
- Restaurant information (hours, cuisine, dress code)
- Room service menu
- Current orders and status
- Dining reservations
- Special dietary information

**Features**:
- Browse room service menu by category
- Add items to cart
- Place room service order
- Track order status
- Make dining reservations
- View past dining orders

**Layout**:
```
┌─────────────────────────────────────────┐
│ My Dining                               │
│ Order room service and view restaurants │
├─────────────────────────────────────────┤
│ Room Service                            │
│ [Breakfast] [Lunch] [Dinner] [Drinks]   │
├─────────────────────────────────────────┤
│ Breakfast Menu                          │
│                                         │
│ Continental                             │
│ • Pancakes with Maple Syrup  ₹350       │
│ • French Toast             ₹320        │
│ • Omelette (3 eggs)        ₹280        │
│                                         │
│ Indian                                  │
│ • Masala Dosa              ₹250        │
│ • Poha                     ₹180        │
│ • Paratha with Curd        ₹220        │
├─────────────────────────────────────────┤
│ Cart (2 items)                          │
│ • Pancakes with Maple Syrup  ₹350      │
│ • Masala Dosa              ₹250        │
│ Subtotal: ₹600                          │
│                                         │
│ [Place Order]                           │
├─────────────────────────────────────────┤
│ Current Orders                          │
│ Order #RS-2026-001                      │
│ 2 items • ₹600                          │
│ Status: Preparing                       │
│ Estimated: 25 minutes                   │
└─────────────────────────────────────────┘
```

**Permissions**: `guest_experience.view`

---

### 5. My Requests (`/guest/requests`)

**Purpose**: Create and track service requests

**Content**:
- Active service requests with status
- Request history
- Create new request form
- Request categories (housekeeping, room service, maintenance, concierge, amenities, transport)
- Priority levels (low, medium, high, urgent)

**Features**:
- Filter by status (active, completed, cancelled)
- Sort by date or priority
- Expandable request details
- Status updates in real-time
- Cancel pending requests
- Rate completed requests

**Status Flow**:
```
PENDING → ACKNOWLEDGED → ASSIGNED → IN_PROGRESS → COMPLETED
   ↓
CANCELLED
```

**Customer-Visible Status**:
- RECEIVED (PENDING)
- ACKNOWLEDGED (ACKNOWLEDGED)
- IN_PROGRESS (ASSIGNED, IN_PROGRESS)
- COMPLETED (COMPLETED)
- CANCELLED (CANCELLED)

**Layout**:
```
┌─────────────────────────────────────────┐
│ My Requests                             │
│ Track and manage your service requests  │
├─────────────────────────────────────────┤
│ [+ New Request]                         │
├─────────────────────────────────────────┤
│ [Active] [Completed] [All]              │
├─────────────────────────────────────────┤
│ Request #SR-2026-001                    │
│ Housekeeping • Extra Towels             │
│ Priority: Medium                        │
│ Status: In Progress                     │
│ Created: 2 hours ago                    │
│                                         │
│ Request #SR-2026-002                    │
│ Room Service • Dinner Order             │
│ Priority: Medium                        │
│ Status: Completed                       │
│ Created: Yesterday                      │
│                                         │
│ Request #SR-2026-003                    │
│ Maintenance • TV Remote Not Working     │
│ Priority: High                          │
│ Status: Received                        │
│ Created: 30 minutes ago                 │
└─────────────────────────────────────────┘
```

**Permissions**: 
- View: `guest_experience.request.view`
- Create: `guest_experience.request.create`

---

### 6. My Bills (`/guest/bills`)

**Purpose**: View and pay bills

**Content**:
- Current folio with charges
- Payment history
- Bill breakdown by category (room, dining, services, amenities)
- Download invoice
- Make payment
- Dispute charges

**Features**:
- Real-time charge updates
- Filter by date range
- Export to PDF
- Split bill (if multiple guests)
- Request itemized receipt
- Pay online (credit card, UPI, wallet)

**Layout**:
```
┌─────────────────────────────────────────┐
│ My Bills                                │
│ View and settle your charges            │
├─────────────────────────────────────────┤
│ Current Folio                           │
│ Reservation #12345                      │
│ Oct 5 - Oct 10, 2026                   │
├─────────────────────────────────────────┤
│ Room Charges                            │
│ Oct 5: ₹8,500                           │
│ Oct 6: ₹8,500                           │
│ Oct 7: ₹8,500                           │
│ Subtotal: ₹25,500                       │
├─────────────────────────────────────────┤
│ Dining                                  │
│ Room Service: ₹1,200                    │
│ Restaurant: ₹2,800                      │
│ Subtotal: ₹4,000                        │
├─────────────────────────────────────────┤
│ Services                                │
│ Spa: ₹3,500                             │
│ Laundry: ₹450                           │
│ Subtotal: ₹3,950                        │
├─────────────────────────────────────────┤
│ Total: ₹33,450                          │
│ Paid: ₹10,000                           │
│ Balance: ₹23,450                        │
├─────────────────────────────────────────┤
│ [Pay Now] [Download Invoice] [Dispute]  │
└─────────────────────────────────────────┘
```

**Permissions**: `guest_experience.view`

---

### 7. My Rewards (`/guest/rewards`)

**Purpose**: View loyalty points and redeem rewards

**Content**:
- Current loyalty tier and points
- Points history (earned, redeemed)
- Available rewards catalog
- Redeem rewards
- Tier benefits
- Progress to next tier

**Features**:
- View points breakdown (stay, dining, events)
- Browse rewards by category
- Redeem points for rewards
- View redemption history
- Share points (if allowed)
- Purchase points (if allowed)

**Loyalty Tiers**:
- Bronze: 0 - 999 points
- Silver: 1,000 - 4,999 points
- Gold: 5,000 - 14,999 points
- Platinum: 15,000+ points

**Layout**:
```
┌─────────────────────────────────────────┐
│ My Rewards                              │
│ Loyalty points and rewards              │
├─────────────────────────────────────────┤
│ Gold Tier                               │
│ 2,450 points                            │
│ 2,550 points to Platinum                │
├─────────────────────────────────────────┤
│ Points History                          │
│ Oct 7: +150 (Room Service)              │
│ Oct 6: +850 (Stay)                      │
│ Oct 5: +200 (Dining)                    │
│ Sep 15: -500 (Room Upgrade)             │
├─────────────────────────────────────────┤
│ Available Rewards                       │
│                                         │
│ Room Upgrades                           │
│ • Suite Upgrade           3,000 pts     │
│ • Late Checkout           500 pts       │
│                                         │
│ Dining                                  │
│ • Complimentary Breakfast 800 pts       │
│ • Dinner for Two         2,500 pts      │
│                                         │
│ Spa & Wellness                          │
│ • 30-min Spa Treatment   1,500 pts      │
│ • Full Day Spa Pass      4,000 pts      │
├─────────────────────────────────────────┤
│ [Redeem] [View History] [Tier Benefits] │
└─────────────────────────────────────────┘
```

**Permissions**: `guest_experience.view`

---

### 8. My Offers (`/guest/offers`)

**Purpose**: View and redeem special offers

**Content**:
- Personalized offers
- Available promotions
- Redeemed offers history
- Offer terms and conditions
- Expiry dates

**Features**:
- Filter by category (discount, upgrade, package, complimentary)
- Sort by expiry date
- Redeem offers
- Share offers (if allowed)
- View offer history

**Offer Types**:
- **Discount**: Percentage or fixed amount off
- **Upgrade**: Room upgrade or amenity inclusion
- **Package**: Bundled services (spa + dining)
- **Complimentary**: Free service or amenity

**Layout**:
```
┌─────────────────────────────────────────┐
│ My Offers                               │
│ Special offers just for you             │
├─────────────────────────────────────────┤
│ [Available] [Redeemed] [Expired]        │
├─────────────────────────────────────────┤
│ 20% Off Spa Treatment                   │
│ Valid until Oct 15, 2026                │
│                                         │
│ Enjoy 20% off any spa treatment during  │
│ your stay. Valid for 30, 60, or 90      │
│ minute treatments.                      │
│                                         │
│ Terms: Cannot be combined with other    │
│ offers. One redemption per guest.       │
│                                         │
│ [Redeem Now] [View Details]             │
├─────────────────────────────────────────┤
│ Complimentary Breakfast                 │
│ Valid until Oct 10, 2026                │
│                                         │
│ Enjoy complimentary breakfast for two   │
│ at our all-day dining restaurant.       │
│                                         │
│ [Redeem Now] [View Details]             │
└─────────────────────────────────────────┘
```

**Permissions**: `guest_experience.view`

---

### 9. My Events (`/guest/events`)

**Purpose**: View event bookings and discover upcoming events

**Content**:
- Booked events
- Event calendar
- Event details (date, time, venue, dress code)
- Available events to book
- Event tickets

**Features**:
- View upcoming events
- Browse event calendar
- Book event tickets
- Cancel event bookings
- Download event tickets
- Add to calendar

**Layout**:
```
┌─────────────────────────────────────────┐
│ My Events                               │
│ View and book events                    │
├─────────────────────────────────────────┤
│ My Bookings                             │
│                                         │
│ Wine Tasting Evening                    │
│ Oct 7, 2026 • 7:00 PM                   │
│ Venue: Rooftop Lounge                   │
│ 2 Tickets                               │
│                                         │
│ [View Details] [Cancel] [Add to Cal]    │
├─────────────────────────────────────────┤
│ Upcoming Events                         │
│                                         │
│ Live Music Night                        │
│ Oct 8, 2026 • 8:00 PM                   │
│ Venue: Garden Terrace                   │
│                                         │
│ [Book Now] [View Details]               │
├─────────────────────────────────────────┤
│ Cooking Masterclass                     │
│ Oct 9, 2026 • 10:00 AM                  │
│ Venue: Main Kitchen                     │
│                                         │
│ [Book Now] [View Details]               │
└─────────────────────────────────────────┘
```

**Permissions**: `guest_experience.view`

---

### 10. My Feedback (`/guest/feedback`)

**Purpose**: Submit and view feedback

**Content**:
- Submit new feedback form
- Past feedback history
- Overall rating (1-5 stars)
- Category ratings (room, service, cleanliness, food, amenities, location, value)
- Comments
- Would return recommendation

**Features**:
- Rate overall experience
- Rate individual categories
- Add written comments
- Anonymous feedback option
- View feedback history
- Edit pending feedback

**Layout**:
```
┌─────────────────────────────────────────┐
│ My Feedback                             │
│ Share your experience with us           │
├─────────────────────────────────────────┤
│ Submit New Feedback                     │
│                                         │
│ Overall Rating                          │
│ ★ ★ ★ ★ ☆  (4/5)                       │
├─────────────────────────────────────────┤
│ Category Ratings                        │
│                                         │
│ Room:          ★ ★ ★ ★ ★  (5/5)        │
│ Service:       ★ ★ ★ ★ ☆  (4/5)        │
│ Cleanliness:   ★ ★ ★ ★ ★  (5/5)        │
│ Food:          ★ ★ ★ ★ ☆  (4/5)        │
│ Amenities:     ★ ★ ★ ★ ☆  (4/5)        │
│ Location:      ★ ★ ★ ★ ★  (5/5)        │
│ Value:         ★ ★ ★ ★ ☆  (4/5)        │
├─────────────────────────────────────────┤
│ Comments                                │
│                                         │
│ [Textarea for detailed feedback...]     │
├─────────────────────────────────────────┤
│ Would you return?                       │
│ ○ Yes  ○ Maybe  ○ No                    │
├─────────────────────────────────────────┤
│ [Submit Feedback]                       │
└─────────────────────────────────────────┘
```

**Permissions**: `guest_experience.view`

---

### 11. My Profile (`/guest/profile`)

**Purpose**: Manage personal information and preferences

**Content**:
- Personal information (name, email, phone)
- Address
- Preferences (room type, bed type, amenities)
- Dietary restrictions
- Special requirements
- Communication preferences
- Password change

**Features**:
- Update personal information
- Manage preferences
- Set communication preferences
- Change password
- View stay history
- Download data (GDPR)
- Delete account (GDPR)

**Layout**:
```
┌─────────────────────────────────────────┐
│ My Profile                              │
│ Manage your personal information        │
├─────────────────────────────────────────┤
│ Personal Information                    │
│                                         │
│ Name: John Smith                        │
│ Email: john.smith@example.com           │
│ Phone: +1 555-0123                      │
│                                         │
│ [Edit]                                  │
├─────────────────────────────────────────┤
│ Preferences                             │
│                                         │
│ Room Type: Deluxe Room                  │
│ Bed Type: King Bed                      │
│ Floor Preference: High Floor            │
│ Amenities: Extra Pillows, Hypoallergenic│
│                                         │
│ [Edit Preferences]                      │
├─────────────────────────────────────────┤
│ Dietary Restrictions                    │
│                                         │
│ Vegetarian                              │
│ Nut Allergy                             │
│                                         │
│ [Edit]                                  │
├─────────────────────────────────────────┤
│ Communication Preferences               │
│                                         │
│ ✓ Email notifications                   │
│ ✓ SMS notifications                     │
│ ✓ Special offers                        │
│ ○ Newsletter                            │
│                                         │
│ [Update]                                │
├─────────────────────────────────────────┤
│ [Change Password] [Download Data]       │
└─────────────────────────────────────────┘
```

**Permissions**: `guest_experience.view`

---

### 12. Digital Check-In (`/guest/checkin`)

**Purpose**: Complete check-in before arrival

**Content**:
- Upcoming reservations requiring check-in
- Check-in form (guest details, documents, preferences)
- Document upload (ID, passport, visa)
- Special requests
- Estimated arrival time
- Check-in status

**Features**:
- Fill check-in form
- Upload identification documents
- Select room preferences
- Add special requests
- Provide estimated arrival time
- Submit check-in
- View check-in status

**Check-In Status Flow**:
```
NOT_STARTED → IN_PROGRESS → SUBMITTED → REVIEW_REQUIRED → COMPLETED
```

**Layout**:
```
┌─────────────────────────────────────────┐
│ Digital Check-in                        │
│ Complete your check-in before arrival   │
├─────────────────────────────────────────┤
│ Reservation #12345                      │
│ Oct 5 - Oct 10, 2026                   │
│ Status: In Progress                     │
├─────────────────────────────────────────┤
│ Guest Information                       │
│                                         │
│ Name: John Smith                        │
│ Email: john.smith@example.com           │
│ Phone: +1 555-0123                      │
│                                         │
│ Adults: [2]  Children: [1]              │
├─────────────────────────────────────────┤
│ Estimated Arrival                       │
│                                         │
│ Date: [Oct 5, 2026]                     │
│ Time: [2:00 PM]                         │
├─────────────────────────────────────────┤
│ Document Upload                         │
│                                         │
│ ID Document: [Upload File]              │
│ Status: Uploaded                        │
│                                         │
│ [View Document]                         │
├─────────────────────────────────────────┤
│ Special Requests                        │
│                                         │
│ [Textarea for special requests...]      │
├─────────────────────────────────────────┤
│ Preferences                             │
│                                         │
│ [Textarea for preferences...]           │
├─────────────────────────────────────────┤
│ [Submit Check-in]                       │
└─────────────────────────────────────────┘
```

**Permissions**: `guest_experience.checkin.view`

---

### 13. Concierge Chat (`/guest/concierge`)

**Purpose**: Chat with concierge for assistance

**Content**:
- Active conversations
- Conversation history
- Chat interface
- Message history
- Create new conversation

**Features**:
- Start new conversation
- Send messages
- Receive real-time responses
- View conversation status
- Close resolved conversations
- Rate conversation quality

**Layout**:
```
┌─────────────────────────────────────────┐
│ Concierge                               │
│ Chat with our concierge team            │
├─────────────────────────────────────────┤
│ [+ New Conversation]                    │
├─────────────────────────────────────────┤
│ Restaurant Recommendation               │
│ Status: Resolved                        │
│ Last message: 2 hours ago               │
│                                         │
│ [View Conversation]                     │
├─────────────────────────────────────────┤
│ Airport Transfer                        │
│ Status: Open                            │
│ Last message: 30 minutes ago            │
│                                         │
│ [View Conversation]                     │
└─────────────────────────────────────────┘
```

**Conversation View**:
```
┌─────────────────────────────────────────┐
│ Restaurant Recommendation               │
│ Status: Resolved                        │
├─────────────────────────────────────────┤
│                                         │
│ You (2 hours ago):                      │
│ Can you recommend a good Italian        │
│ restaurant nearby?                      │
│                                         │
│ Concierge (1 hour ago):                 │
│ I'd recommend "La Trattoria" - it's     │
│ a 5-minute walk from the hotel. They    │
│ have excellent pasta and a great wine   │
│ list. Would you like me to make a       │
│ reservation?                            │
│                                         │
│ You (30 minutes ago):                   │
│ Yes please, for 2 people at 8 PM        │
│                                         │
│ Concierge (15 minutes ago):             │
│ Done! I've reserved a table for 2 at    │
│ 8 PM. Confirmation #LT-2026-042.        │
│ Enjoy your dinner!                      │
│                                         │
├─────────────────────────────────────────┤
│ [Type your message...] [Send]           │
└─────────────────────────────────────────┘
```

**Permissions**: `guest_experience.conversation.view`

---

### 14. Notifications (`/guest/notifications`)

**Purpose**: View all notifications and alerts

**Content**:
- Unread notifications
- All notifications history
- Notification categories (general, requests, payments, offers, reminders)
- Mark as read
- Mark all as read

**Features**:
- Filter by category
- Filter by read/unread
- Mark individual notification as read
- Mark all as read
- View notification details
- Navigate to related page

**Layout**:
```
┌─────────────────────────────────────────┐
│ Notifications                           │
│ 3 unread                                │
├─────────────────────────────────────────┤
│ [All] [Unread]                          │
├─────────────────────────────────────────┤
│ [Mark all as read]                      │
├─────────────────────────────────────────┤
│ ● REQUESTS                              │
│ Your request has been acknowledged      │
│ We've received your request for extra   │
│ towels. Housekeeping will deliver       │
│ shortly.                                │
│ 2 hours ago                             │
│                                         │
│ [Mark read]                             │
├─────────────────────────────────────────┤
│ ● PAYMENTS                              │
│ Payment received                        │
│ We've received your payment of ₹10,000. │
│ Thank you!                              │
│ Yesterday                               │
│                                         │
│ [Mark read]                             │
├─────────────────────────────────────────┤
│ ● OFFERS                                │
│ Special offer just for you              │
│ Enjoy 20% off spa treatments during     │
│ your stay.                              │
│ 2 days ago                              │
│                                         │
│ [Mark read] [View Offer]                │
└─────────────────────────────────────────┘
```

**Permissions**: `guest_experience.view`

---

### 15. My Timeline (`/guest/timeline`)

**Purpose**: View complete journey timeline

**Content**:
- Chronological journey events
- All interactions and activities
- Past, current, and upcoming events
- Filter by event type

**Features**:
- View complete journey history
- Filter by event type (booking, check-in, requests, payments, feedback)
- Expand event details
- Navigate to related page
- Download timeline

**Layout**:
```
┌─────────────────────────────────────────┐
│ My Timeline                             │
│ Your complete journey with us           │
├─────────────────────────────────────────┤
│ [All] [Bookings] [Requests] [Payments]  │
├─────────────────────────────────────────┤
│ Oct 7, 2026                             │
│                                         │
│ 2:00 PM                                 │
│ 🍽️ Room Service Order                    │
│ Order #RS-2026-001                      │
│ 2 items • ₹600                          │
│                                         │
│ 10:00 AM                                │
│ 📝 Service Request                      │
│ Request #SR-2026-001                    │
│ Extra towels - In Progress              │
├─────────────────────────────────────────┤
│ Oct 6, 2026                             │
│                                         │
│ 8:00 PM                                 │
│ 💳 Payment                              │
│ Payment #PAY-2026-001                   │
│ ₹10,000 • Credit Card                   │
│                                         │
│ 3:00 PM                                 │
│ 🏨 Check-in                             │
│ Room 501 • Deluxe Room                  │
├─────────────────────────────────────────┤
│ Oct 5, 2026                             │
│                                         │
│ 10:00 AM                                │
│ ✈️ Booking Confirmed                     │
│ Reservation #12345                      │
│ Oct 5 - Oct 10, 2026                   │
└─────────────────────────────────────────┘
```

**Permissions**: `guest_experience.view`

---

## Navigation

### Portal Navigation Structure

```
Guest Portal
├── Dashboard (/guest)
├── My Bookings (/guest/bookings)
├── My Stay (/guest/stay)
├── My Dining (/guest/dining)
├── My Requests (/guest/requests)
├── My Bills (/guest/bills)
├── My Rewards (/guest/rewards)
├── My Offers (/guest/offers)
├── My Events (/guest/events)
├── My Feedback (/guest/feedback)
├── My Profile (/guest/profile)
├── Digital Check-in (/guest/checkin)
├── Concierge (/guest/concierge)
├── Notifications (/guest/notifications)
└── My Timeline (/guest/timeline)
```

### Navigation Permissions

All pages require `guest_experience.view` except:
- My Requests: Requires `guest_experience.request.view` + `guest_experience.request.create`
- Digital Check-in: Requires `guest_experience.checkin.view`
- Concierge: Requires `guest_experience.conversation.view`

---

## Mobile Optimization

### Responsive Design

The portal is mobile-first with responsive breakpoints:
- **Mobile**: 360px - 767px
- **Tablet**: 768px - 1023px
- **Desktop**: 1024px+

### Mobile-Specific Features

1. **Touch-Friendly**: Large tap targets (min 44x44px)
2. **Swipe Gestures**: Swipe to delete notifications
3. **Pull to Refresh**: Refresh data on pull-down
4. **Offline Support**: Cache critical data for offline access
5. **Push Notifications**: Real-time alerts for requests and offers
6. **Digital Key**: NFC/Bluetooth room key (future)

### Mobile Layout Adjustments

- Single-column layout on mobile
- Collapsible sections
- Bottom navigation for primary actions
- Floating action button for quick requests
- Full-screen modals for forms

---

## Security

### Authentication

- Session-based authentication
- JWT tokens with 1-hour expiry
- Secure token storage (httpOnly cookies)
- Automatic logout on token expiry

### Authorization

- All API calls check `organizationId` + `customerId`
- Permission gates on every page
- Customer isolation enforced at service layer

### Data Protection

- HTTPS only
- Sensitive data encrypted at rest
- PCI DSS compliance for payment data
- GDPR compliance for personal data

### Privacy

- Data retention policy (2 years)
- Right to access data
- Right to delete account
- Cookie consent management

---

## Performance

### Optimization Strategies

1. **Code Splitting**: Lazy-load pages
2. **Image Optimization**: WebP format, lazy loading
3. **Caching**: Service worker for static assets
4. **API Optimization**: Batch requests, pagination
5. **Bundle Size**: Tree shaking, minification

### Performance Targets

- **First Contentful Paint**: < 1.5s
- **Time to Interactive**: < 3s
- **Lighthouse Score**: > 90

---

## Accessibility

### WCAG 2.1 AA Compliance

- Semantic HTML
- ARIA labels for interactive elements
- Keyboard navigation support
- Screen reader compatibility
- Color contrast ratio > 4.5:1
- Focus indicators
- Alt text for images

### Testing

- Automated accessibility testing (axe-core)
- Manual testing with screen readers
- Keyboard-only navigation testing
- Color blindness simulation

---

## Future Enhancements

### Phase 2

1. **Progressive Web App (PWA)**: Installable app with offline support
2. **Push Notifications**: Real-time alerts
3. **Digital Key**: Mobile room key via NFC/Bluetooth
4. **In-App Payments**: Apple Pay, Google Pay
5. **Multi-Language**: i18n support for 10+ languages
6. **Voice Assistant**: Integration with Alexa/Google Home
7. **AR Navigation**: Augmented reality property navigation
8. **Social Sharing**: Share experiences on social media

### Phase 3

1. **AI Concierge**: Chatbot for common requests
2. **Personalization Engine**: ML-driven recommendations
3. **Facial Recognition**: Contactless check-in
4. **IoT Integration**: Smart room controls
5. **Virtual Tours**: 360° property tours
6. **Gamification**: Earn badges for activities
7. **Social Features**: Connect with other guests

---

## Related Documentation

- [Guest Experience Hub](./GUEST_EXPERIENCE_HUB.md) - Overall system overview
- [Digital Guest Journey](./DIGITAL_GUEST_JOURNEY.md) - Journey stages and automation
- [Hotel PMS](./HOTEL_PMS.md) - Property management system
- [CRM](./CRM.md) - Customer relationship management

---

**Module Owner**: Guest Experience Team  
**Contact**: guest-experience@amrut.com  
**Version**: 1.0.0
