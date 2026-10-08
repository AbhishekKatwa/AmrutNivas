/**
 * Finance Payments — payment ledger for the organization.
 *
 * Phase 4 destination. Reads from existing payment tables across domains
 * (restaurant, events, procurement) to show a unified payment view.
 */

import { useEffect, useState } from "react";
import { CreditCard, ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { useContextStore } from "@/state/context-store";
import { requireSupabase } from "@/db/client";

type Payment = {
  id: string;
  number: string;
  amount: number;
  method: string;
  date: string;
  direction: "IN" | "OUT";
  source: "Restaurant" | "Event" | "Procurement";
  reference?: string;
};

export default function FinancePaymentsPage() {
  const context = useContextStore((s) => s.context);
  const organizationId = context.organizationId;

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    let ignore = false;

    async function load() {
      setLoading(true);
      try {
        const sb = requireSupabase();

        const [restRes, eventRes, supplierRes] = await Promise.all([
          sb
            .from("payments")
            .select("id, payment_number, amount, method, business_date, reference_id, status")
            .eq("organization_id", organizationId)
            .eq("status", "SUCCESSFUL")
            .order("business_date", { ascending: false })
            .limit(50),
          sb
            .from("event_payments")
            .select("id, payment_number, amount, payment_method, payment_date, reference_number")
            .eq("organization_id", organizationId)
            .order("payment_date", { ascending: false })
            .limit(50),
          sb
            .from("supplier_payments")
            .select("id, payment_number, total_amount, payment_method, payment_date, reference_number, status")
            .eq("organization_id", organizationId)
            .eq("status", "POSTED")
            .order("payment_date", { ascending: false })
            .limit(50),
        ]);

        const incoming: Payment[] = [
          ...(restRes.data || []).map((p) => ({
            id: `pay-${p.id}`,
            number: p.payment_number || `PAY-${p.id.slice(0, 8)}`,
            amount: Number(p.amount || 0),
            method: p.method || "—",
            date: p.business_date,
            direction: "IN" as const,
            source: "Restaurant" as const,
            reference: p.reference_id,
          })),
          ...(eventRes.data || []).map((p) => ({
            id: `epay-${p.id}`,
            number: p.payment_number || `EVT-${p.id.slice(0, 8)}`,
            amount: Number(p.amount || 0),
            method: p.payment_method || "—",
            date: p.payment_date,
            direction: "IN" as const,
            source: "Event" as const,
            reference: p.reference_number,
          })),
        ];

        const outgoing: Payment[] = (supplierRes.data || []).map((p) => ({
          id: `spay-${p.id}`,
          number: p.payment_number || `SP-${p.id.slice(0, 8)}`,
          amount: Number(p.total_amount || 0),
          method: p.payment_method || "—",
          date: p.payment_date,
          direction: "OUT" as const,
          source: "Procurement" as const,
          reference: p.reference_number,
        }));

        const all = [...incoming, ...outgoing].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );

        if (!ignore) {
          setPayments(all);
          setLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }

    load();
    return () => { ignore = true; };
  }, [organizationId]);

  if (loading) return <LoadingBlock label="Loading payments" />;

  const received = payments.filter((p) => p.direction === "IN");
  const made = payments.filter((p) => p.direction === "OUT");
  const receivedTotal = received.reduce((sum, p) => sum + p.amount, 0);
  const madeTotal = made.reduce((sum, p) => sum + p.amount, 0);
  const netFlow = receivedTotal - madeTotal;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Payments</h1>
        <p className="mt-1 text-sm text-muted">
          Payment ledger — money in and money out for your business.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Received" description="Money in">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success-soft">
              <ArrowDownLeft className="size-5 text-success" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">
              ₹{receivedTotal.toLocaleString("en-IN")}
            </div>
          </div>
        </Card>
        <Card title="Made" description="Money out">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-danger-soft">
              <ArrowUpRight className="size-5 text-danger" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">
              ₹{madeTotal.toLocaleString("en-IN")}
            </div>
          </div>
        </Card>
        <Card title="Net Flow" description="In minus out">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <Wallet className="size-5 text-brand-700" />
            </div>
            <div className={`text-2xl font-semibold tabular-nums ${netFlow >= 0 ? "text-success" : "text-danger"}`}>
              ₹{netFlow.toLocaleString("en-IN")}
            </div>
          </div>
        </Card>
        <Card title="Transactions" description="Total count">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-surface-sunken">
              <CreditCard className="size-5 text-muted" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{payments.length}</div>
          </div>
        </Card>
      </div>

      {payments.length === 0 ? (
        <EmptyState
          icon={<CreditCard />}
          title="No payments yet"
          description="Payments from restaurant bills, events, and supplier payments will appear here as transactions are recorded."
        />
      ) : (
        <Card title="Recent Payments">
          <div className="divide-y divide-line">
            {payments.slice(0, 30).map((payment) => (
              <div key={payment.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className={`flex size-10 items-center justify-center rounded-lg ${
                    payment.direction === "IN" ? "bg-success-soft" : "bg-danger-soft"
                  }`}>
                    {payment.direction === "IN"
                      ? <ArrowDownLeft className="size-5 text-success" />
                      : <ArrowUpRight className="size-5 text-danger" />
                    }
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink">{payment.number}</div>
                    <div className="text-xs text-muted">
                      {payment.source} · {payment.method}
                    </div>
                    <div className="text-xs text-muted">
                      {new Date(payment.date).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-medium tabular-nums ${
                    payment.direction === "IN" ? "text-success" : "text-danger"
                  }`}>
                    {payment.direction === "IN" ? "+" : "−"}₹{payment.amount.toLocaleString("en-IN")}
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    payment.direction === "IN"
                      ? "bg-success-soft text-success"
                      : "bg-danger-soft text-danger"
                  }`}>
                    {payment.direction === "IN" ? "Received" : "Paid"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
