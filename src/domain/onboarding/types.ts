/**
 * Onboarding & activation contract.
 *
 * Onboarding is an orchestration layer, not a second source of truth. It reads the
 * organization's real state (properties, outlets, modules, team, transactions) and
 * presents it as a guided setup experience. The OnboardingProfile tracks progress
 * through that experience; activation signals measure whether the business is
 * actually using the system, not just filling forms.
 *
 * Hierarchy:
 *   OnboardingProfile = progress through setup wizard
 *   ActivationState   = real usage signals (first transaction, etc.)
 *   ActivationScore   = deterministic percentage based on signals
 *
 * The profile is persistent (database row), but the score is computed on demand from
 * the organization's actual state — never stored, never stale.
 */

import type { EntityId } from "@/domain/identity/types";

/* ---------------------------------------------------------------- statuses */

/**
 * The onboarding journey's lifecycle. NOT_STARTED is the default after sign-up;
 * IN_PROGRESS means the wizard has been entered; READY_TO_LAUNCH means critical
 * setup is done but the first transaction hasn't happened; COMPLETED means the
 * business is live; SKIPPED means the owner chose to bypass guided setup.
 */
export type OnboardingStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "READY_TO_LAUNCH"
  | "COMPLETED"
  | "SKIPPED";

/**
 * Activation is based on real usage, not form completion. NOT_ACTIVATED means no
 * meaningful transaction has occurred; ACTIVATING means setup is done but the first
 * operation is pending; ACTIVATED means at least one real business transaction has
 * been recorded (order, reservation, purchase, payment, etc.).
 */
export type ActivationState = "NOT_ACTIVATED" | "ACTIVATING" | "ACTIVATED";

/* ---------------------------------------------------------------- business context */

/**
 * Business size ranges, captured during onboarding to guide recommendations and
 * plan suggestions. Ranges rather than exact counts — the owner doesn't need to
 * know their employee count to the person.
 */
export type BusinessSizeRange =
  | "1"
  | "2-5"
  | "6-20"
  | "21-50"
  | "50+";

export type BusinessSize = {
  properties: BusinessSizeRange;
  outlets: BusinessSizeRange;
  rooms?: BusinessSizeRange;
  employees: BusinessSizeRange;
};

/**
 * Primary business goals — what the owner wants AMRUT NIVAAS to help control first.
 * Multiple selections allowed. Used to prioritize onboarding recommendations and
 * module activation order.
 */
export type BusinessGoal =
  | "RESTAURANT_POS"
  | "HOTEL_OPERATIONS"
  | "INVENTORY"
  | "PROCUREMENT"
  | "FINANCE"
  | "EVENTS"
  | "EMPLOYEES"
  | "CUSTOMER_MANAGEMENT"
  | "ONLINE_ORDERING"
  | "DIRECT_BOOKINGS"
  | "MULTI_PROPERTY_MANAGEMENT"
  | "ALL_IN_ONE";

export const BUSINESS_GOALS: readonly BusinessGoal[] = [
  "RESTAURANT_POS",
  "HOTEL_OPERATIONS",
  "INVENTORY",
  "PROCUREMENT",
  "FINANCE",
  "EVENTS",
  "EMPLOYEES",
  "CUSTOMER_MANAGEMENT",
  "ONLINE_ORDERING",
  "DIRECT_BOOKINGS",
  "MULTI_PROPERTY_MANAGEMENT",
  "ALL_IN_ONE",
];

/* ---------------------------------------------------------------- profile */

/**
 * Persistent onboarding progress. One row per organization. The profile tracks
 * where the owner is in the setup journey, but the actual setup state (properties,
 * outlets, modules, team) lives in the canonical domain tables — this profile just
 * reads that state and presents it as a guided experience.
 */
export type OnboardingProfile = {
  id: EntityId;
  organizationId: EntityId;
  status: OnboardingStatus;
  /** The current step in the wizard (e.g., "property", "module", "team"). */
  currentStep: string | null;
  /** 0-100, computed from completed checklist items. */
  completionPercentage: number;
  businessSize: BusinessSize | null;
  businessGoals: BusinessGoal[];
  startedAt: string | null;
  completedAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/* ---------------------------------------------------------------- checklist */

/**
 * A checklist item represents a setup task. Items are categorized as REQUIRED
 * (must complete before going live), RECOMMENDED (strongly suggested for the
 * business type), or OPTIONAL (nice to have). The checklist is dynamic — items
 * appear based on the organization's business type and enabled modules.
 */
export type OnboardingChecklistCategory = "GET_STARTED" | "CONFIGURE" | "DATA" | "LAUNCH";

export type OnboardingChecklistPriority = "REQUIRED" | "RECOMMENDED" | "OPTIONAL";

export type OnboardingChecklistItem = {
  id: string;
  category: OnboardingChecklistCategory;
  title: string;
  description: string;
  priority: OnboardingChecklistPriority;
  completed: boolean;
  route: string | null;
  /** Which modules this item applies to (empty = all). */
  applicableModules: string[];
};

/* ---------------------------------------------------------------- activation */

/**
 * Activation signals are real usage events. Each signal has a weight that
 * contributes to the activation score. The score is deterministic — no ML, no
 * guessing — just a sum of signal weights based on what the organization has
 * actually done.
 */
export type ActivationSignal = {
  id: string;
  label: string;
  weight: number;
  achieved: boolean;
  achievedAt: string | null;
};

export type ActivationScore = {
  organizationId: EntityId;
  state: ActivationState;
  score: number;
  signals: ActivationSignal[];
  computedAt: string;
};

/* ---------------------------------------------------------------- recommendations */

/**
 * The recommendation engine's output. Given the organization's current state,
 * it suggests the next best setup action. The recommendation is deterministic —
 * based on business type, enabled modules, completed steps, and existing data —
 * not a guess.
 */
export type SetupRecommendation = {
  action: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  route: string | null;
};

/* ---------------------------------------------------------------- health */

/**
 * Onboarding health for platform admin visibility. HEALTHY means active progress;
 * PROGRESSING means moving but slowly; STALLED means no activity for 7+ days;
 * AT_RISK means signed up but never started; ACTIVATED means live.
 */
export type OnboardingHealth = "HEALTHY" | "PROGRESSING" | "STALLED" | "AT_RISK" | "ACTIVATED";

export type OnboardingHealthSummary = {
  organizationId: EntityId;
  organizationName: string;
  signedUpAt: string;
  lastActivityAt: string | null;
  completionPercentage: number;
  health: OnboardingHealth;
  firstTransactionAt: string | null;
  activationState: ActivationState;
};
