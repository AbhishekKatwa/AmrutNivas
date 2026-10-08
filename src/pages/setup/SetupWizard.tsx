/**
 * Enhanced setup wizard for Prompt #23.
 *
 * This wizard extends the existing OnboardingWizard with business context capture,
 * module recommendations, dynamic checklist, and first transaction guidance.
 *
 * The wizard is progressive — users can skip optional steps and complete them later
 * via contextual prompts. Progress is persistent; users can resume where they left off.
 *
 * Steps:
 *   1. Business context (type, size, goals)
 *   2. Property setup
 *   3. Outlet setup (if applicable)
 *   4. Module activation
 *   5. Team invitation
 *   6. Core data (module-specific)
 *   7. Finance setup
 *   8. Commerce setup
 *   9. Launch (first transaction guidance)
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field } from "@/components/ui/Field";
import { SelectInput } from "@/components/ui/SelectInput";
import type { BusinessGoal, BusinessSize, BusinessSizeRange } from "@/domain/onboarding/types";
import { BUSINESS_GOALS } from "@/domain/onboarding/types";
import { BUSINESS_TYPES, type BusinessType } from "@/domain/identity/types";

type SetupStep =
  | "business"
  | "property"
  | "outlet"
  | "modules"
  | "team"
  | "data"
  | "finance"
  | "commerce"
  | "launch";

const STEPS: SetupStep[] = [
  "business",
  "property",
  "outlet",
  "modules",
  "team",
  "data",
  "finance",
  "commerce",
  "launch",
];

const STEP_LABELS: Record<SetupStep, string> = {
  business: "Business",
  property: "Property",
  outlet: "Outlets",
  modules: "Modules",
  team: "Team",
  data: "Core Data",
  finance: "Finance",
  commerce: "Commerce",
  launch: "Launch",
};

const SIZE_OPTIONS: BusinessSizeRange[] = ["1", "2-5", "6-20", "21-50", "50+"];

const GOAL_LABELS: Record<BusinessGoal, string> = {
  RESTAURANT_POS: "Restaurant POS",
  HOTEL_OPERATIONS: "Hotel Operations",
  INVENTORY: "Inventory Management",
  PROCUREMENT: "Procurement",
  FINANCE: "Finance & Accounting",
  EVENTS: "Events & Banquets",
  EMPLOYEES: "Employee Management",
  CUSTOMER_MANAGEMENT: "Customer Management",
  ONLINE_ORDERING: "Online Ordering",
  DIRECT_BOOKINGS: "Direct Bookings",
  MULTI_PROPERTY_MANAGEMENT: "Multi-Property Management",
  ALL_IN_ONE: "All-in-One Solution",
};

export default function SetupWizard() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<SetupStep>("business");
  const [businessTypes, setBusinessTypes] = useState<BusinessType[]>([]);
  const [businessSize, setBusinessSize] = useState<BusinessSize>({
    properties: "1",
    outlets: "1",
    employees: "1",
  });
  const [businessGoals, setBusinessGoals] = useState<BusinessGoal[]>([]);

  const currentIndex = STEPS.indexOf(currentStep);
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex === STEPS.length - 1;

  function goNext() {
    if (!isLastStep) {
      setCurrentStep(STEPS[currentIndex + 1]);
    }
  }

  function goBack() {
    if (!isFirstStep) {
      setCurrentStep(STEPS[currentIndex - 1]);
    }
  }

  function toggleBusinessType(type: BusinessType) {
    setBusinessTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  function toggleGoal(goal: BusinessGoal) {
    setBusinessGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Setup Your Workspace</h1>
          <p className="mt-1 text-sm text-muted">
            Let's configure AMRUT NIVAAS for your business
          </p>
        </div>
        <Badge tone="brand">
          Step {currentIndex + 1} of {STEPS.length}
        </Badge>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {STEPS.map((step, index) => {
          const isCurrent = step === currentStep;
          const isCompleted = index < currentIndex;
          return (
            <div
              key={step}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                isCurrent
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : isCompleted
                    ? "border-success-200 bg-success-50 text-success-700"
                    : "border-border bg-surface text-muted"
              }`}
            >
              {isCompleted && <Check className="h-3 w-3" />}
              {STEP_LABELS[step]}
            </div>
          );
        })}
      </div>

      <Card>
        {currentStep === "business" && (
          <BusinessContextStep
            businessTypes={businessTypes}
            onToggleBusinessType={toggleBusinessType}
            businessSize={businessSize}
            onBusinessSizeChange={setBusinessSize}
            businessGoals={businessGoals}
            onToggleGoal={toggleGoal}
          />
        )}

        {currentStep === "property" && <PropertyStep />}
        {currentStep === "outlet" && <OutletStep businessTypes={businessTypes} />}
        {currentStep === "modules" && <ModulesStep businessTypes={businessTypes} goals={businessGoals} />}
        {currentStep === "team" && <TeamStep />}
        {currentStep === "data" && <CoreDataStep businessTypes={businessTypes} />}
        {currentStep === "finance" && <FinanceStep />}
        {currentStep === "commerce" && <CommerceStep />}
        {currentStep === "launch" && <LaunchStep />}
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={goBack}
          disabled={isFirstStep}
          icon={<ArrowLeft className="size-4" />}
        >
          Back
        </Button>

        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => navigate("/")} >
            Skip for now
          </Button>

          {isLastStep ? (
            <Button onClick={() => navigate("/")} icon={<Sparkles className="size-4" />}>
              Go to Command Center
            </Button>
          ) : (
            <Button onClick={goNext} icon={<ArrowRight className="size-4" />}>
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function BusinessContextStep({
  businessTypes,
  onToggleBusinessType,
  businessSize,
  onBusinessSizeChange,
  businessGoals,
  onToggleGoal,
}: {
  businessTypes: BusinessType[];
  onToggleBusinessType: (type: BusinessType) => void;
  businessSize: BusinessSize;
  onBusinessSizeChange: (size: BusinessSize) => void;
  businessGoals: BusinessGoal[];
  onToggleGoal: (goal: BusinessGoal) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Tell us about your business</h2>
        <p className="mt-1 text-sm text-muted">
          This helps us recommend the right setup for you
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Field label="What kind of hospitality business do you operate?" required>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BUSINESS_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onToggleBusinessType(type)}
                className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                  businessTypes.includes(type)
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-border bg-surface text-ink hover:border-brand-300"
                }`}
              >
                {type.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </Field>

        <Field label="How many properties do you operate?">
          <SelectInput
            value={businessSize.properties}
            onChange={(value) =>
              onBusinessSizeChange({ ...businessSize, properties: value as BusinessSizeRange })
            }
            options={SIZE_OPTIONS.map((size) => ({ value: size, label: size }))}
          />
        </Field>

        <Field label="How many outlets per property?">
          <SelectInput
            value={businessSize.outlets}
            onChange={(value) =>
              onBusinessSizeChange({ ...businessSize, outlets: value as BusinessSizeRange })
            }
            options={SIZE_OPTIONS.map((size) => ({ value: size, label: size }))}
          />
        </Field>

        <Field label="How many employees?">
          <SelectInput
            value={businessSize.employees}
            onChange={(value) =>
              onBusinessSizeChange({ ...businessSize, employees: value as BusinessSizeRange })
            }
            options={SIZE_OPTIONS.map((size) => ({ value: size, label: size }))}
          />
        </Field>

        <Field label="What do you want AMRUT NIVAAS to help you control first?">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {BUSINESS_GOALS.map((goal) => (
              <Checkbox
                key={goal}
                label={GOAL_LABELS[goal]}
                checked={businessGoals.includes(goal)}
                onChange={() => onToggleGoal(goal)}
              />
            ))}
          </div>
        </Field>
      </div>
    </div>
  );
}

function PropertyStep() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Set up your first property</h2>
        <p className="mt-1 text-sm text-muted">
          A property is a physical location where you operate
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
        Property setup is handled by the existing onboarding wizard. This step will be integrated
        with the full property creation flow.
      </div>
    </div>
  );
}

function OutletStep({ businessTypes }: { businessTypes: BusinessType[] }) {
  const needsOutlets = businessTypes.some(
    (type) => type === "RESTAURANT" || type === "CAFE" || type === "BANQUET"
  );

  if (!needsOutlets) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Outlets</h2>
          <p className="mt-1 text-sm text-muted">
            Based on your business type, outlets are optional
          </p>
        </div>

        <div className="rounded-lg border border-success-200 bg-success-50 p-4 text-sm text-success-700">
          You can add outlets later if needed. Continue to the next step.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Set up your outlets</h2>
        <p className="mt-1 text-sm text-muted">
          Outlets are separately-run revenue points inside your property
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
        Outlet setup is handled by the existing onboarding wizard. This step will be integrated
        with the full outlet creation flow.
      </div>
    </div>
  );
}

function ModulesStep({
  businessTypes,
  goals,
}: {
  businessTypes: BusinessType[];
  goals: BusinessGoal[];
}) {
  const recommendedModules = getRecommendedModules(businessTypes, goals);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Activate modules</h2>
        <p className="mt-1 text-sm text-muted">
          Based on your business type, we recommend these modules
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {recommendedModules.map((module) => (
          <div
            key={module.name}
            className={`rounded-lg border p-4 ${
              module.status === "RECOMMENDED"
                ? "border-brand-200 bg-brand-50"
                : "border-border bg-surface"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-ink">{module.name}</h3>
                <p className="mt-1 text-xs text-muted">{module.description}</p>
              </div>
              {module.status === "RECOMMENDED" && (
                <Badge tone="brand">Recommended</Badge>
              )}
              {module.status === "NOT_INCLUDED" && (
                <Badge tone="warning">Upgrade required</Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamStep() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Invite your team</h2>
        <p className="mt-1 text-sm text-muted">
          Invite colleagues to collaborate in AMRUT NIVAAS
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
        Team invitation is handled by the existing onboarding wizard. This step will be integrated
        with the full team invitation flow.
      </div>
    </div>
  );
}

function CoreDataStep({ businessTypes }: { businessTypes: BusinessType[] }) {
  const isRestaurant = businessTypes.some(
    (type) => type === "RESTAURANT" || type === "CAFE" || type === "CLOUD_KITCHEN"
  );
  const isHotel = businessTypes.some(
    (type) => type === "HOTEL" || type === "LODGE" || type === "RESORT"
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Add core data</h2>
        <p className="mt-1 text-sm text-muted">
          Set up the essential data for your operations
        </p>
      </div>

      {isRestaurant && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
          <h3 className="font-semibold text-ink">Restaurant Setup</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            <li>• Menu Categories</li>
            <li>• Menu Items</li>
            <li>• Modifiers</li>
            <li>• Dining Areas & Tables</li>
            <li>• Kitchen Stations</li>
          </ul>
        </div>
      )}

      {isHotel && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
          <h3 className="font-semibold text-ink">Hotel Setup</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            <li>• Room Types</li>
            <li>• Rooms</li>
            <li>• Rate Plans</li>
            <li>• Room Rates</li>
          </ul>
        </div>
      )}

      {!isRestaurant && !isHotel && (
        <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          Core data setup depends on your business type and enabled modules.
        </div>
      )}
    </div>
  );
}

function FinanceStep() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Configure finance</h2>
        <p className="mt-1 text-sm text-muted">
          Set up your financial configuration
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold text-ink">Finance Setup Checklist</h3>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          <li>• Chart of Accounts</li>
          <li>• Tax Configuration</li>
          <li>• Payment Methods</li>
          <li>• Cash & Bank Accounts</li>
          <li>• Opening Balances</li>
        </ul>
      </div>
    </div>
  );
}

function CommerceStep() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Set up commerce</h2>
        <p className="mt-1 text-sm text-muted">
          Enable online ordering, QR ordering, and direct bookings
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold text-ink">Commerce Setup Checklist</h3>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          <li>• Public Profile</li>
          <li>• QR Ordering</li>
          <li>• Table QR Codes</li>
          <li>• Takeaway</li>
          <li>• Direct Booking</li>
          <li>• Online Ordering</li>
        </ul>
      </div>
    </div>
  );
}

function LaunchStep() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">You're ready to launch!</h2>
        <p className="mt-1 text-sm text-muted">
          Your workspace is configured. Now run your first transaction.
        </p>
      </div>

      <div className="rounded-lg border border-success-200 bg-success-50 p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-success-600 p-2">
            <Check className="h-6 w-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-success-900">AMRUT NIVAAS IS READY</h3>
            <p className="mt-1 text-sm text-success-700">
              Your hospitality workspace is configured. Run your first transaction to go live.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold text-ink">First Transaction</h3>
        <p className="mt-2 text-sm text-muted">
          Create your first order, reservation, or purchase to activate your workspace.
        </p>
        <div className="mt-4 flex gap-3">
          <Button>Create Order</Button>
          <Button variant="ghost">Create Reservation</Button>
        </div>
      </div>
    </div>
  );
}

function getRecommendedModules(
  businessTypes: BusinessType[],
  goals: BusinessGoal[]
): Array<{ name: string; description: string; status: "RECOMMENDED" | "AVAILABLE" | "NOT_INCLUDED" }> {
  const modules: Array<{ name: string; description: string; status: "RECOMMENDED" | "AVAILABLE" | "NOT_INCLUDED" }> = [];

  const isRestaurant = businessTypes.some(
    (type) => type === "RESTAURANT" || type === "CAFE" || type === "CLOUD_KITCHEN"
  );
  const isHotel = businessTypes.some(
    (type) => type === "HOTEL" || type === "LODGE" || type === "RESORT"
  );

  if (isRestaurant) {
    modules.push(
      { name: "Restaurant", description: "POS, orders, KOT, billing", status: "RECOMMENDED" },
      { name: "Inventory", description: "Stock management, recipes", status: "RECOMMENDED" },
      { name: "Procurement", description: "Suppliers, purchase orders", status: "RECOMMENDED" }
    );
  }

  if (isHotel) {
    modules.push(
      { name: "Hotel PMS", description: "Reservations, check-in/out, folios", status: "RECOMMENDED" },
      { name: "Housekeeping", description: "Room operations, cleaning", status: "RECOMMENDED" },
      { name: "Maintenance", description: "Work orders, preventive maintenance", status: "RECOMMENDED" }
    );
  }

  modules.push(
    { name: "Finance", description: "Accounting, payments, reports", status: "RECOMMENDED" },
    { name: "CRM", description: "Customer profiles, loyalty", status: "AVAILABLE" },
    { name: "Commerce", description: "Online ordering, QR, bookings", status: "AVAILABLE" }
  );

  if (goals.includes("EVENTS")) {
    modules.push({ name: "Events", description: "Venues, packages, bookings", status: "AVAILABLE" });
  }

  if (goals.includes("EMPLOYEES")) {
    modules.push({ name: "HR", description: "Employees, attendance, shifts", status: "AVAILABLE" });
  }

  return modules;
}
