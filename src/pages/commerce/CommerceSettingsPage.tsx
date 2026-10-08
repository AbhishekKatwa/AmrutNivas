/**
 * Commerce Settings — per-property feature flags for the commerce module.
 *
 * Controls which digital commerce capabilities are enabled: QR ordering,
 * online ordering, takeaway, delivery, direct booking, guest checkout, etc.
 * Settings are scoped to a property within the organization.
 */

import { useEffect, useMemo, useState } from "react";
import { CircleSlash, LogIn, Settings, Save } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Button } from "@/components/ui/Button";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  getCommerceSettings,
  upsertCommerceSettings,
  type CommerceScope,
} from "@/domain/commerce/commerce-service";
import type { CommerceSettings } from "@/domain/commerce/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type CommerceSettingsView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "no_property"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): CommerceSettingsView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    if (context.organizationId === null) return "no_organization";
    if (context.propertyId === null) return "no_property";
    return "scoped";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read commerce settings.";

type SettingsForm = {
  qrOrderingEnabled: boolean;
  onlineOrderingEnabled: boolean;
  takeawayEnabled: boolean;
  deliveryEnabled: boolean;
  directBookingEnabled: boolean;
  requireCustomerMobile: boolean;
  allowGuestCheckout: boolean;
  serviceChargeEnabled: boolean;
  publicMenuEnabled: boolean;
  minimumOrderAmount: string;
};

function toForm(settings: CommerceSettings | null): SettingsForm {
  if (settings === null) {
    return {
      qrOrderingEnabled: false,
      onlineOrderingEnabled: false,
      takeawayEnabled: false,
      deliveryEnabled: false,
      directBookingEnabled: false,
      requireCustomerMobile: true,
      allowGuestCheckout: true,
      serviceChargeEnabled: false,
      publicMenuEnabled: true,
      minimumOrderAmount: "",
    };
  }
  return {
    qrOrderingEnabled: settings.qrOrderingEnabled,
    onlineOrderingEnabled: settings.onlineOrderingEnabled,
    takeawayEnabled: settings.takeawayEnabled,
    deliveryEnabled: settings.deliveryEnabled,
    directBookingEnabled: settings.directBookingEnabled,
    requireCustomerMobile: settings.requireCustomerMobile,
    allowGuestCheckout: settings.allowGuestCheckout,
    serviceChargeEnabled: settings.serviceChargeEnabled,
    publicMenuEnabled: settings.publicMenuEnabled,
    minimumOrderAmount: settings.minimumOrderAmount?.toString() ?? "",
  };
}

export default function CommerceSettingsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo<CommerceScope | null>(
    () =>
      context.organizationId !== null
        ? { organizationId: context.organizationId, propertyId: context.propertyId ?? undefined }
        : null,
    [context.organizationId, context.propertyId],
  );

  const canView = can("commerce.settings.view", permissions);
  const canManage = can("commerce.settings.manage", permissions);

  const [form, setForm] = useState<SettingsForm | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    void loadSettings();
  }, [view, scope, canView]);

  async function loadSettings() {
    if (scope === null || scope.propertyId === undefined) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getCommerceSettings(scope, scope.propertyId);
      setForm(toForm(data));
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (scope === null || scope.propertyId === undefined || form === null) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await upsertCommerceSettings(scope, scope.propertyId, {
        qrOrderingEnabled: form.qrOrderingEnabled,
        onlineOrderingEnabled: form.onlineOrderingEnabled,
        takeawayEnabled: form.takeawayEnabled,
        deliveryEnabled: form.deliveryEnabled,
        directBookingEnabled: form.directBookingEnabled,
        requireCustomerMobile: form.requireCustomerMobile,
        allowGuestCheckout: form.allowGuestCheckout,
        serviceChargeEnabled: form.serviceChargeEnabled,
        publicMenuEnabled: form.publicMenuEnabled,
        minimumOrderAmount: form.minimumOrderAmount ? parseFloat(form.minimumOrderAmount) : null,
      });
      await loadSettings();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((prev) => (prev === null ? prev : { ...prev, [key]: value }));
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Settings className="size-5 shrink-0 text-brand-600" aria-hidden />
          Commerce Settings
        </h2>
        <p className="mt-1 text-sm text-muted">
          Configure which digital commerce features are enabled for your property.
        </p>
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState
          icon={<CircleSlash aria-hidden />}
          title="Backend not configured"
          description={storeError ?? NO_BACKEND_COPY}
        />
      )}

      {view === "unauthenticated" && (
        <EmptyState
          icon={<LogIn aria-hidden />}
          title="Sign in to manage settings"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Settings aria-hidden />}
          title="Choose an organization first"
          description="Commerce settings belong to an organization. Pick one and this screen will show its settings."
        />
      )}

      {view === "no_property" && (
        <EmptyState
          icon={<Settings aria-hidden />}
          title="Choose a property first"
          description="Commerce settings are configured per property. Pick one and this screen will show its settings."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view commerce settings" permission="commerce.settings.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {error !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          {saved && (
            <p className="rounded-lg border border-success-soft bg-success-soft px-4 py-3 text-sm text-success">
              Settings saved successfully.
            </p>
          )}

          {loading || form === null ? (
            <LoadingBlock label="Loading settings…" />
          ) : (
            <div className="flex flex-col gap-6">
              <Card className="flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-ink">Ordering</h3>
                <ToggleRow
                  label="QR Ordering"
                  description="Allow customers to scan QR codes and order from their table."
                  checked={form.qrOrderingEnabled}
                  disabled={!canManage}
                  onChange={(v) => updateField("qrOrderingEnabled", v)}
                />
                <ToggleRow
                  label="Online Ordering"
                  description="Allow customers to place orders for pickup or delivery via the website."
                  checked={form.onlineOrderingEnabled}
                  disabled={!canManage}
                  onChange={(v) => updateField("onlineOrderingEnabled", v)}
                />
                <ToggleRow
                  label="Takeaway"
                  description="Allow customers to order for takeaway."
                  checked={form.takeawayEnabled}
                  disabled={!canManage}
                  onChange={(v) => updateField("takeawayEnabled", v)}
                />
                <ToggleRow
                  label="Delivery"
                  description="Allow customers to order for delivery."
                  checked={form.deliveryEnabled}
                  disabled={!canManage}
                  onChange={(v) => updateField("deliveryEnabled", v)}
                />
              </Card>

              <Card className="flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-ink">Booking</h3>
                <ToggleRow
                  label="Direct Booking"
                  description="Allow customers to book rooms directly through your website."
                  checked={form.directBookingEnabled}
                  disabled={!canManage}
                  onChange={(v) => updateField("directBookingEnabled", v)}
                />
              </Card>

              <Card className="flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-ink">Customer Experience</h3>
                <ToggleRow
                  label="Public Menu"
                  description="Make your menu publicly accessible via a unique URL."
                  checked={form.publicMenuEnabled}
                  disabled={!canManage}
                  onChange={(v) => updateField("publicMenuEnabled", v)}
                />
                <ToggleRow
                  label="Require Customer Mobile"
                  description="Require customers to provide their mobile number when ordering."
                  checked={form.requireCustomerMobile}
                  disabled={!canManage}
                  onChange={(v) => updateField("requireCustomerMobile", v)}
                />
                <ToggleRow
                  label="Allow Guest Checkout"
                  description="Allow customers to order without creating an account."
                  checked={form.allowGuestCheckout}
                  disabled={!canManage}
                  onChange={(v) => updateField("allowGuestCheckout", v)}
                />
                <ToggleRow
                  label="Service Charge"
                  description="Automatically add a service charge to orders."
                  checked={form.serviceChargeEnabled}
                  disabled={!canManage}
                  onChange={(v) => updateField("serviceChargeEnabled", v)}
                />
              </Card>

              <Card className="flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-ink">Order Limits</h3>
                <div>
                  <label className="block text-sm font-medium text-ink">
                    Minimum Order Amount (₹)
                  </label>
                  <p className="mt-0.5 text-xs text-muted">
                    Leave blank for no minimum.
                  </p>
                  <input
                    type="number"
                    value={form.minimumOrderAmount}
                    onChange={(e) => updateField("minimumOrderAmount", e.target.value)}
                    disabled={!canManage}
                    placeholder="0"
                    min="0"
                    step="1"
                    className="mt-2 w-full max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
                  />
                </div>
              </Card>

              {canManage && (
                <div className="flex justify-end">
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    icon={<Save className="size-4" aria-hidden />}
                  >
                    {saving ? "Saving…" : "Save Settings"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 rounded border-border text-brand-600 focus:ring-brand-500"
      />
      <div>
        <span className="text-sm font-medium text-ink">{label}</span>
        <p className="text-xs text-muted">{description}</p>
      </div>
    </label>
  );
}
