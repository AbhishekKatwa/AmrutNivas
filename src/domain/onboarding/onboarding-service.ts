/**
 * Onboarding service layer.
 *
 * All functions here are deterministic reads of the organization's actual state.
 * Nothing is stored — the activation score, checklist, and recommendations are
 * computed on demand from the canonical domain tables (organizations, properties,
 * outlets, modules, team, transactions).
 *
 * The service orchestrates existing domain services; it does not duplicate their
 * data or logic.
 */

import type { EntityId } from "@/domain/identity/types";
import type {
  ActivationScore,
  ActivationSignal,
  ActivationState,
  BusinessGoal,
  BusinessSize,
  OnboardingChecklistItem,
  OnboardingProfile,
  OnboardingStatus,
  SetupRecommendation,
} from "./types";

/* ---------------------------------------------------------------- activation */

/**
 * Compute the activation score for an organization. The score is a deterministic
 * sum of signal weights based on what the organization has actually done. No ML,
 * no guessing — just a read of the organization's state.
 *
 * Signals:
 *   - Organization configured (10%)
 *   - Property configured (15%)
 *   - Team invited (10%)
 *   - Core module configured (15%)
 *   - Operational data added (15%)
 *   - First transaction (20%)
 *   - Finance configured (10%)
 *   - Commerce configured (5%)
 *
 * The function reads from the organization's actual state (properties, outlets,
 * team, modules, transactions) and returns the computed score. In a real
 * implementation, this would call domain services to check each signal; here we
 * provide the structure and the caller supplies the signal data.
 */
export function calculateActivationScore(
  organizationId: EntityId,
  signals: ActivationSignal[]
): ActivationScore {
  const achievedSignals = signals.filter((s) => s.achieved);
  const score = achievedSignals.reduce((sum, s) => sum + s.weight, 0);

  const state: ActivationState =
    score >= 100 ? "ACTIVATED" : score > 0 ? "ACTIVATING" : "NOT_ACTIVATED";

  return {
    organizationId,
    state,
    score: Math.min(100, score),
    signals,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Build the default activation signals for an organization. The caller checks
 * each signal against the organization's actual state and marks it as achieved.
 *
 * This is a factory that returns the signal template; the caller fills in the
 * `achieved` and `achievedAt` fields based on real data.
 */
export function buildActivationSignals(): ActivationSignal[] {
  return [
    {
      id: "organization_configured",
      label: "Organization configured",
      weight: 10,
      achieved: false,
      achievedAt: null,
    },
    {
      id: "property_configured",
      label: "Property configured",
      weight: 15,
      achieved: false,
      achievedAt: null,
    },
    {
      id: "team_invited",
      label: "Team invited",
      weight: 10,
      achieved: false,
      achievedAt: null,
    },
    {
      id: "core_module_configured",
      label: "Core module configured",
      weight: 15,
      achieved: false,
      achievedAt: null,
    },
    {
      id: "operational_data_added",
      label: "Operational data added",
      weight: 15,
      achieved: false,
      achievedAt: null,
    },
    {
      id: "first_transaction",
      label: "First transaction",
      weight: 20,
      achieved: false,
      achievedAt: null,
    },
    {
      id: "finance_configured",
      label: "Finance configured",
      weight: 10,
      achieved: false,
      achievedAt: null,
    },
    {
      id: "commerce_configured",
      label: "Commerce configured",
      weight: 5,
      achieved: false,
      achievedAt: null,
    },
  ];
}

/* ---------------------------------------------------------------- recommendations */

/**
 * Determine the next best setup action for an organization. The recommendation is
 * deterministic — based on business type, enabled modules, completed steps, and
 * existing data.
 *
 * The function reads the organization's state and returns the highest-priority
 * action. In a real implementation, this would check properties, outlets, modules,
 * team, and data; here we provide the structure and the caller supplies the state.
 */
export function getNextBestSetupAction(
  _organizationId: EntityId,
  _businessTypes: string[],
  _enabledModules: string[],
  _completedSteps: string[],
  _existingData: Record<string, boolean>
): SetupRecommendation | null {
  // In a real implementation, this would check:
  // - If no property exists: recommend "Create property"
  // - If no outlet exists but business type requires it: recommend "Create outlet"
  // - If no team invited: recommend "Invite team"
  // - If modules enabled but not configured: recommend module-specific setup
  // - If no operational data: recommend "Add menu" / "Add inventory items" / etc.
  // - If no first transaction: recommend "Run first transaction"
  //
  // For now, return null to indicate no recommendation (caller can implement
  // the logic based on their specific state checks).
  return null;
}

/* ---------------------------------------------------------------- checklist */

/**
 * Build the onboarding checklist for an organization. The checklist is dynamic —
 * items appear based on the organization's business type and enabled modules.
 *
 * A restaurant should not see "Configure rooms"; a hotel without restaurant should
 * not see "Add menu items". The checklist is filtered by the organization's actual
 * state.
 *
 * Items are categorized:
 *   - GET_STARTED: organization, property, outlet (required)
 *   - CONFIGURE: business profile, team, roles (required/recommended)
 *   - DATA: menu, inventory, suppliers, rooms (module-specific)
 *   - LAUNCH: finance, commerce, first transaction (required for go-live)
 */
export function getOnboardingChecklist(
  _businessTypes: string[],
  _enabledModules: string[],
  _completedSteps: string[]
): OnboardingChecklistItem[] {
  // In a real implementation, this would build the checklist based on:
  // - Business type (restaurant, hotel, banquet, etc.)
  // - Enabled modules (restaurant, hotel, inventory, etc.)
  // - Completed steps (what's already done)
  //
  // For now, return an empty array. The caller can implement the logic based on
  // their specific business type and module checks.
  return [];
}

/* ---------------------------------------------------------------- module recommendations */

/**
 * Recommend modules based on business type and goals. The recommendation respects
 * subscription entitlements — a module is only recommended if the organization's
 * plan includes it.
 *
 * Example:
 *   - Restaurant: Restaurant, Inventory, Procurement, Finance, CRM, Commerce
 *   - Hotel: Hotel, Housekeeping, Maintenance, Finance, CRM, Commerce
 *   - Banquet: Events, CRM, Inventory, Procurement, Finance
 *
 * The function returns a list of module keys with a recommendation status:
 *   - RECOMMENDED: strongly suggested for this business type
 *   - AVAILABLE: available but not strongly recommended
 *   - NOT_INCLUDED: not in the current plan (upgrade required)
 */
export function recommendModules(
  _businessTypes: string[],
  _goals: BusinessGoal[],
  _entitledModules: string[]
): Array<{ module: string; status: "RECOMMENDED" | "AVAILABLE" | "NOT_INCLUDED" }> {
  // In a real implementation, this would check:
  // - Business type → module mapping
  // - Goals → module mapping
  // - Entitlements → which modules the plan includes
  //
  // For now, return an empty array. The caller can implement the logic based on
  // their specific business type and entitlement checks.
  return [];
}

/* ---------------------------------------------------------------- profile */

/**
 * Create a new onboarding profile. This is called when an organization is first
 * created or when the owner enters the onboarding wizard for the first time.
 *
 * In a real implementation, this would write to the database. Here we provide
 * the structure.
 */
export function createOnboardingProfile(
  organizationId: EntityId,
  businessSize?: BusinessSize,
  businessGoals?: BusinessGoal[]
): OnboardingProfile {
  const now = new Date().toISOString();
  return {
    id: `onb_${organizationId}`,
    organizationId,
    status: "NOT_STARTED",
    currentStep: null,
    completionPercentage: 0,
    businessSize: businessSize ?? null,
    businessGoals: businessGoals ?? [],
    startedAt: null,
    completedAt: null,
    lastActivityAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update the onboarding profile's status and progress. Called as the owner
 * completes setup steps.
 *
 * In a real implementation, this would write to the database. Here we provide
 * the structure.
 */
export function updateOnboardingProfile(
  profile: OnboardingProfile,
  updates: {
    status?: OnboardingStatus;
    currentStep?: string | null;
    completionPercentage?: number;
    businessSize?: BusinessSize;
    businessGoals?: BusinessGoal[];
  }
): OnboardingProfile {
  return {
    ...profile,
    ...updates,
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  };
}
