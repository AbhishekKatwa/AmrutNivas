/**
 * Payments page — list of SaaS payments for the organization.
 *
 * Shows payment date, invoice, amount, method, status, and transaction reference.
 * This is the payment history for the organization.
 */

import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { listPayments, type SaaSPayment } from "@/domain/billing/billing-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore } from "@/state/context-store";
import { format, parseISO } from "date-fns";

export default function PaymentsPage() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;

  const canView = can("billing.payment.view", permissions);

  const [payments, setPayments] = useState<SaaSPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId || !canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    listPayments(organizationId)
      .then((data) => {
        if (ignore) return;
        setPayments(data);
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
    return <AccessDenied capability="view payments" permission="billing.payment.view" />;
  }

  if (loading) {
    return <LoadingBlock label="Loading payments..." />;
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

  if (payments.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<CreditCard className="h-12 w-12" />}
          title="No payments yet"
          description="Payments will appear here once you make your first payment."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
        <p className="mt-1 text-sm text-gray-600">
          Your payment history and transaction records.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Method
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Transaction Ref
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    {payment.paidAt ? format(parseISO(payment.paidAt), "MMM d, yyyy") : "—"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    ₹{payment.amount}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    {payment.method}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <PaymentStatusBadge status={payment.status} />
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    {payment.transactionReference || "—"}
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

function PaymentStatusBadge({ status }: { status: string }) {
  const styles = {
    PENDING: "bg-amber-100 text-amber-800",
    COMPLETED: "bg-green-100 text-green-800",
    FAILED: "bg-red-100 text-red-800",
    REFUNDED: "bg-gray-100 text-gray-800",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${styles[status as keyof typeof styles] || "bg-gray-100 text-gray-800"}`}
    >
      {status}
    </span>
  );
}
