/**
 * Invoices page — list of SaaS invoices for the organization.
 *
 * Shows invoice number, date, period, total, status, and actions to view
 * details or download. This is the billing history for the organization.
 */

import { useEffect, useState } from "react";
import { FileText, Download, Eye } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { listInvoices, type SaaSInvoice } from "@/domain/billing/billing-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore } from "@/state/context-store";
import { format, parseISO } from "date-fns";

export default function InvoicesPage() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;

  const canView = can("billing.invoice.view", permissions);

  const [invoices, setInvoices] = useState<SaaSInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId || !canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    listInvoices(organizationId)
      .then((data) => {
        if (ignore) return;
        setInvoices(data);
      })
      .catch((err) => {
        if (ignore) return;
        setError(toPublicError(err).message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [organizationId, canView]);

  if (!canView) {
    return <AccessDenied capability="view invoices" permission="billing.invoice.view" />;
  }

  if (loading) {
    return <LoadingBlock label="Loading invoices..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="No invoices yet"
          description="Invoices will appear here once your subscription is active."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <p className="mt-1 text-sm text-gray-600">
          Your billing history and invoice downloads.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Invoice #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Total
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {invoice.invoiceNumber}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    {format(parseISO(invoice.invoiceDate), "MMM d, yyyy")}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    {format(parseISO(invoice.periodStart), "MMM d")} -{" "}
                    {format(parseISO(invoice.periodEnd), "MMM d")}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    ₹{invoice.total}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <InvoiceStatusBadge status={invoice.status} />
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                    <button className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100">
                      <Eye className="h-4 w-4" />
                      View
                    </button>
                    <button className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100">
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const styles = {
    DRAFT: "bg-gray-100 text-gray-800",
    OPEN: "bg-blue-100 text-blue-800",
    PAID: "bg-green-100 text-green-800",
    VOID: "bg-red-100 text-red-800",
    OVERDUE: "bg-amber-100 text-amber-800",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${styles[status as keyof typeof styles] || "bg-gray-100 text-gray-800"}`}
    >
      {status}
    </span>
  );
}
