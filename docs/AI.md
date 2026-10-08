# AI Command Center & Intelligence Layer

AMRUT NIVAAS AI intelligence layer — natural-language business analytics, recommendations, and decision support.

## Architecture Overview

```
User Question
    ↓
Intent Detection
    ↓
Permission Check
    ↓
Domain Routing
    ↓
Analytics Services (existing)
    ↓
AI Provider (pluggable)
    ↓
Grounded Response + Sources
    ↓
Human Review
    ↓
Action (with approval)
```

The AI layer **consumes** existing application data and analytics services. It does not replace them, recalculate metrics, or bypass permissions.

### Core Principles

1. **AI is NOT a source of truth** — operational systems are
2. **Permission-aware** — inherits user's RBAC, never bypasses
3. **Grounded responses** — every answer cites data sources
4. **Read-only by default** — actions require explicit approval
5. **No hallucination** — says "insufficient data" when data is unavailable

---

## AI Command Center

Accessible at `/ai` with `analytics.dashboard.view` permission.

### Features

- **Natural language queries** — ask questions about the business
- **Quick prompts** — pre-built questions for common scenarios
- **Daily briefing** — automated business summary with priorities
- **Conversation support** — follow-up questions with context
- **Source citations** — clickable links to source data
- **Suggested actions** — with approval flow for sensitive operations

### Example Queries

```
What needs my attention today?
Show today's business summary
Why is revenue changing?
Which inventory items need attention?
Which payments are overdue?
What are my top-selling menu items?
Why is occupancy low?
Which supplier increased prices?
```

---

## AI Service Layer

### Files

```
src/domain/ai/
├── types.ts              # Type definitions
├── ai-provider.ts        # Provider abstraction (stub + pluggable)
├── ai-tools.ts           # Tool registry (calls analytics services)
└── ai-service.ts         # Query processing pipeline
```

### Types

**AIContext** — scoped context for queries:
```typescript
{
  organizationId: string;
  propertyId?: string;
  outletId?: string;
  userId: string;
  permissions: string[];
  dateRange: { start: string; end: string };
  scope: "ALL_PROPERTIES" | "PROPERTY" | "OUTLET" | "DEPARTMENT";
}
```

**AIQuery** — user question with context:
```typescript
{
  id: string;
  question: string;
  intent?: AIIntent;
  domain?: AIDomain;
  context: AIContext;
  conversationId?: string;
}
```

**AIResponse** — grounded answer:
```typescript
{
  queryId: string;
  answer: string;
  findings: AIFinding[];
  recommendations: AIRecommendation[];
  sources: AISourceReference[];
  suggestedActions: AISuggestedAction[];
  confidence: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_DATA";
  dataFreshness: "LIVE" | "PARTIAL" | "STALE";
  timestamp: string;
}
```

### Intent Detection

Keyword-based intent classification:

- `REVENUE_ANALYSIS` — "why did revenue fall"
- `PROFIT_ANALYSIS` — "why is profit down"
- `OCCUPANCY_ANALYSIS` — "why is occupancy low"
- `INVENTORY_ANALYSIS` — "what is low in stock"
- `SUPPLIER_ANALYSIS` — "which supplier increased prices"
- `CUSTOMER_ANALYSIS` — "who are my best customers"
- `EVENT_ANALYSIS` — "which events need attention"
- `HR_ANALYSIS` — "who is absent today"
- `ATTENTION_CHECK` — "what needs my attention"
- `SUMMARY_REQUEST` — "show today's summary"
- `COMPARISON_REQUEST` — "compare properties"
- `SCENARIO_REQUEST` — "what if we increase prices"
- `ACTION_REQUEST` — "create a purchase request"
- `GENERAL_QUERY` — fallback

### Domain Routing

Routes queries to relevant domains:

- `RESTAURANT` — food, menu, orders
- `HOTEL` — rooms, occupancy, reservations
- `INVENTORY` — stock, items
- `PROCUREMENT` — suppliers, purchases
- `FINANCE` — revenue, profit, cash
- `CRM` — customers, loyalty
- `EVENTS` — bookings, venues
- `HR` — employees, attendance
- `COMMERCE` — QR, online orders
- `ENTERPRISE` — multi-property
- `OPERATIONS` — cross-domain

### Permission Checking

Each domain maps to a permission:

```typescript
{
  RESTAURANT: "analytics.restaurant.view",
  HOTEL: "analytics.hotel.view",
  INVENTORY: "analytics.inventory.view",
  PROCUREMENT: "analytics.inventory.view",
  FINANCE: "analytics.finance.view",
  CRM: "analytics.crm.view",
  EVENTS: "analytics.events.view",
  HR: "analytics.hr.view",
  COMMERCE: "analytics.commerce.view",
  ENTERPRISE: "analytics.dashboard.view",
}
```

If the user lacks permission for a domain, AI refuses to answer questions about it.

---

## AI Tools

Tools are registered functions that call existing analytics services.

### Registered Tools

1. **getRevenueSummary** — revenue breakdown by source
2. **getProfitabilitySummary** — profit/loss metrics
3. **getRestaurantSummary** — orders, AOV, covers
4. **getHotelSummary** — occupancy, ADR, RevPAR
5. **getEventSummary** — event pipeline, revenue
6. **getInventorySummary** — stock health, low items
7. **getFinanceSummary** — receivables, payables
8. **getCrmSummary** — customer metrics
9. **getHrSummary** — attendance, workforce
10. **getCommerceSummary** — channel performance
11. **getAttentionItems** — operational alerts

### Tool Execution

```typescript
executeTool(toolName: string, context: AIContext, params?: Record<string, any>)
executeTools(toolNames: string[], context: AIContext)
```

Each tool:
- Checks permission before execution
- Calls existing analytics service
- Returns structured data
- Never mutates data (read-only)

---

## AI Provider

Pluggable provider abstraction for AI models.

### Provider Interface

```typescript
interface AIProvider {
  generateResponse(prompt: string, context: AIContext): Promise<string>;
  generateStructuredResponse<T>(prompt: string, context: AIContext): Promise<T>;
  isAvailable(): Promise<boolean>;
}
```

### Stub Provider

Default provider returns deterministic responses without a real AI model. Used when no provider is configured.

### Configuring a Provider

```typescript
import { setAIProvider } from "@/domain/ai/ai-provider";
import { OpenAIProvider } from "@/domain/ai/providers/openai";

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4",
});

setAIProvider(provider);
```

Future providers: Anthropic, local models, Azure OpenAI, etc.

---

## Query Processing Pipeline

```typescript
processQuery(query: AIQuery): Promise<AIResponse>
```

Steps:

1. **Detect intent** — classify question type
2. **Detect domain** — route to relevant domains
3. **Check permissions** — filter domains by user access
4. **Fetch data** — execute tools for allowed domains
5. **Build prompt** — construct prompt with data
6. **Generate response** — call AI provider
7. **Extract findings** — build structured findings
8. **Extract sources** — build source references
9. **Generate recommendations** — suggest actions
10. **Return response** — grounded answer with citations

---

## Daily Briefing

Automated business summary generated on page load.

```typescript
generateDailyBriefing(context: AIContext): Promise<AIDailyBriefing>
```

Includes:

- Revenue highlights
- Key metrics (restaurant, hotel, events)
- Priority items
- Attention items (top 3)

---

## Action Categories

### Safe

May be executed automatically if permissions allow:

- Create notification
- Create internal task
- Prepare report
- Prepare draft

### Sensitive

Require explicit approval:

- Create purchase request
- Create purchase order
- Send external communication
- Create discount
- Create financial transaction
- Modify reservation
- Modify event
- Modify inventory

### Forbidden

AI must never directly perform:

- Delete organization
- Delete financial history
- Change owner permissions
- Bypass RBAC
- Modify audit logs
- Delete accounting records
- Delete customer history

---

## Response Format

Every AI response includes:

1. **Answer** — natural language explanation
2. **Findings** — key data points with evidence
3. **Recommendations** — suggested next steps
4. **Sources** — clickable links to source data
5. **Suggested Actions** — executable actions (with approval)
6. **Confidence** — HIGH / MEDIUM / LOW / INSUFFICIENT_DATA
7. **Data Freshness** — LIVE / PARTIAL / STALE

### Example Response

```
Revenue decreased 11.8% compared with last month.

Findings:
• Food cost increased ₹84,000
• Restaurant revenue decreased ₹1.2L
• Discount expense increased ₹31,000

Sources:
[Finance → Revenue] [Restaurant → Orders]

Recommendations:
• Review food cost drivers (chicken, edible oil prices increased)
• Analyze lunch-period order volume
• Review discount patterns

Suggested Actions:
[Review Inventory] [View Restaurant Analytics]
```

---

## Hallucination Control

If data is unavailable:

```
I don't have enough data to answer that reliably.
```

If only partial data exists:

```
Based on the available posted transactions...
```

AI never fills gaps with guesses or fabricates numbers.

---

## Audit Trail

Future: `AIInteraction` and `AIAction` tables to log:

- Questions asked
- Tools executed
- Sources referenced
- Actions requested
- Approvals granted
- Actions executed

---

## Permissions

AI Command Center requires `analytics.dashboard.view`.

Domain-specific queries also check:

- `analytics.restaurant.view`
- `analytics.hotel.view`
- `analytics.inventory.view`
- `analytics.finance.view`
- `analytics.events.view`
- `analytics.crm.view`
- `analytics.hr.view`
- `analytics.commerce.view`

---

## Data Flow

```
User Question
    ↓
AI Command Center (UI)
    ↓
AI Service (processQuery)
    ↓
Intent Detection + Domain Routing
    ↓
Permission Check
    ↓
Tool Execution (calls analytics services)
    ↓
Analytics Services (existing)
    ↓
AI Provider (generates response)
    ↓
Response with findings, sources, recommendations
    ↓
UI renders with citations
```

---

## Configuration

### Environment Variables

Future:

```
VITE_OPENAI_API_KEY=sk-...
VITE_AI_PROVIDER=openai
VITE_AI_MODEL=gpt-4
```

### Provider Selection

```typescript
import { setAIProvider } from "@/domain/ai/ai-provider";

// Stub (default)
setAIProvider(new StubAIProvider());

// OpenAI
setAIProvider(new OpenAIProvider({ apiKey: "..." }));

// Anthropic
setAIProvider(new AnthropicProvider({ apiKey: "..." }));
```

---

## Usage

### Programmatic

```typescript
import { processQuery, buildAIContext } from "@/domain/ai/ai-service";

const context = buildAIContext(
  organizationId,
  userId,
  permissions,
  propertyId,
);

const response = await processQuery({
  id: "q-123",
  question: "What needs my attention today?",
  context,
});

console.log(response.answer);
console.log(response.findings);
console.log(response.sources);
```

### UI

Navigate to `/ai` and type a question or click a quick prompt.

---

## File Structure

```
src/domain/ai/
├── types.ts              # AIContext, AIQuery, AIResponse, etc.
├── ai-provider.ts        # Provider interface + stub
├── ai-tools.ts           # Tool registry (11 tools)
└── ai-service.ts         # Query pipeline

src/pages/ai/
└── AICommandCenter.tsx   # Main UI

src/app/routes.ts         # /ai route
src/app/navigation.ts     # Nav entry (Phase 10)
```

---

## Future Enhancements

- Real AI provider integration (OpenAI, Anthropic)
- Conversation persistence
- Action execution with approval flow
- Anomaly detection engine
- Scenario modeling
- Voice input
- Multi-language support
- AI audit trail tables
- Scheduled briefings (email/notification)
- Custom AI tools per organization
