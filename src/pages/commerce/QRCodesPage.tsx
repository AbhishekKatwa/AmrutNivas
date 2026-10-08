/**
 * QR Codes — manage scannable QR codes for menus, tables, properties and bookings.
 *
 * Staff can generate new QR codes, activate/deactivate them, and see their status.
 * Each QR code resolves to a public URL for customer-facing flows.
 */

import { useEffect, useMemo, useState } from "react";
import { CircleSlash, LogIn, QrCode, Plus, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Button } from "@/components/ui/Button";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  listQRCodes,
  createQRCode,
  updateQRCodeStatus,
  type CommerceScope,
} from "@/domain/commerce/commerce-service";
import type { QRCode, QRCodeType, QRCodeStatus } from "@/domain/commerce/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type QRCodesView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): QRCodesView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read QR codes.";

export default function QRCodesPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo<CommerceScope | null>(
    () => (context.organizationId !== null ? { organizationId: context.organizationId } : null),
    [context.organizationId],
  );

  const canView = can("commerce.qr.view", permissions);
  const canCreate = can("commerce.qr.create", permissions);
  const canManage = can("commerce.qr.manage", permissions);

  const [qrCodes, setQRCodes] = useState<QRCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    void loadQRCodes();
  }, [view, scope, canView]);

  async function loadQRCodes() {
    if (scope === null) return;
    setLoading(true);
    setError(null);
    try {
      const codes = await listQRCodes(scope);
      setQRCodes(codes);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(params: { type: QRCodeType; propertyId?: string; outletId?: string; tableId?: string }) {
    if (scope === null) return;
    try {
      await createQRCode(scope, params);
      setShowCreateDialog(false);
      await loadQRCodes();
    } catch (err) {
      setError(toPublicError(err).message);
    }
  }

  async function handleStatusChange(qrCodeId: string, status: QRCodeStatus) {
    if (scope === null) return;
    try {
      await updateQRCodeStatus(scope, qrCodeId, status);
      await loadQRCodes();
    } catch (err) {
      setError(toPublicError(err).message);
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
            <QrCode className="size-5 shrink-0 text-brand-600" aria-hidden />
            QR Codes
          </h2>
          <p className="mt-1 text-sm text-muted">
            Generate and manage QR codes for menus, tables, properties and bookings.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreateDialog(true)} icon={<Plus className="size-4" aria-hidden />}>
            Generate QR
          </Button>
        )}
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
          title="Sign in to manage QR codes"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<QrCode aria-hidden />}
          title="Choose an organization first"
          description="QR codes belong to an organization. Pick one and this screen will show its codes."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view QR codes" permission="commerce.qr.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {error !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          {loading ? (
            <LoadingBlock label="Loading QR codes…" />
          ) : qrCodes.length === 0 ? (
            <EmptyState
              icon={<QrCode aria-hidden />}
              title="No QR codes yet"
              description="Generate your first QR code to enable digital ordering or public menus."
            />
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-left font-medium">Code</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Created</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {qrCodes.map((qr) => (
                    <tr key={qr.id} className="hover:bg-surface-muted/50">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
                          {qr.type.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink">{qr.code}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={qr.status} />
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {new Date(qr.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManage && (
                          <div className="flex justify-end gap-2">
                            {qr.status === "ACTIVE" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleStatusChange(qr.id, "INACTIVE")}
                              >
                                Deactivate
                              </Button>
                            )}
                            {qr.status !== "ACTIVE" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleStatusChange(qr.id, "ACTIVE")}
                              >
                                Activate
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<RefreshCw className="size-3" aria-hidden />}
                              onClick={() => handleStatusChange(qr.id, "REVOKED")}
                            >
                              Revoke
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {showCreateDialog && (
        <CreateQRCodeDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: QRCodeStatus }) {
  const styles = {
    ACTIVE: "bg-success-soft text-success",
    INACTIVE: "bg-muted text-ink",
    REVOKED: "bg-danger-soft text-danger",
  };

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

function CreateQRCodeDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (params: { type: QRCodeType; propertyId?: string; outletId?: string; tableId?: string }) => void;
}) {
  const [type, setType] = useState<QRCodeType>("MENU");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <h3 className="text-lg font-semibold text-ink">Generate QR Code</h3>
        <p className="mt-1 text-sm text-muted">
          Create a new QR code for digital ordering or public access.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as QRCodeType)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="MENU">Menu</option>
              <option value="TABLE_ORDER">Table Order</option>
              <option value="PROPERTY">Property</option>
              <option value="OUTLET">Outlet</option>
              <option value="BOOKING">Booking</option>
              <option value="EVENT">Event</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onCreate({ type })}>Generate</Button>
        </div>
      </Card>
    </div>
  );
}
