/**
 * Finance Invoices — customer invoices for the organization.
 *
 * Phase 4 destination. This is the customer's business finance module —
 * invoices they issue to their customers, not the SaaS billing they pay
 * to AMRUT NIVAAS (which lives at /billing/invoices).
 *
 * Reads from existing operational tables (bills, folios) to show a unified
 * invoice view. Full invoice creation/editing comes in Phase 4.
 */

import { useEffect, useState } from "react";
import { FileText, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { useContextStore } from "@/state/context-store";
import { requireSupabase } from "@/db/client";

type Invoice = {
  id: string;
  number: string;
  customer: string;
  amount: number;
  status: "PAID" | "OUTSTANDING" | "OVERDUE";
  date: string;
  source: "Restaurant" | "Hotel" | "Event";
};

export default function FinanceInvoicesPage() {
  const context = useContextStore((s) => s.context);
  const organizationId = context.organizationId;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    let ignore = false;

    async function load() {
      setLoading(true);
      try {
        const sb = requireSupabase();

        // Load restaurant bills as invoices
        const { data: bills } = await sb
          .from("bills")
          .select("id, bill_number, grand_total, status, business_date, table_name")
          .eq("organization_id", organizationId)
          .order("business_date", { ascending: false })
          .limit(50);

        // Load hotel folios as invoices
        const { data: folios } = await sb
          .from("folios")
          .select("id, folio_number, total_charges, status, opened_at, guest_name")
          .eq("organization_id", organizationId)
          .order("opened_at", { ascending: false })
          .limit(50);

        const billInvoices: Invoice[] = (bills || []).map((b) => ({
          id: `bill-${b.id}`,
          number: b.bill_number || `B-${b.id.slice(0, 8)}`,
          customer: b.table_name || "Walk-in",
          amount: Number(b.grand_total || 0),
          status: b.status === "PAID" ? "PAID" : "OUTSTANDING",
          date: b.business_date,
          source: "Restaurant",
        }));

        const folioInvoices: Invoice[] = (folios || []).map((f) => ({
          id: `folio-${f.id}`,
          number: f.folio_number || `F-${f.id.slice(0, 8)}`,
          customer: f.guest_name || "Guest",
          amount: Number(f.total_charges || 0),
          status: f.status === "SETTLED" ? "PAID" : "OUTSTANDING",
          date: f.opened_at,
          source: "Hotel",
        }));

        const all = [...billInvoices, ...folioInvoices].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );

        if (!ignore) {
          setInvoices(all);
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

  if (loading) return <LoadingBlock label="Loading invoices" />;

  const totalInvoices = invoices.length;
  const outstanding = invoices.filter((i) => i.status === "OUTSTANDING");
  const paid = invoices.filter((i) => i.status === "PAID");
  const outstandingAmount = outstanding.reduce((sum, i) => sum + i.amount, 0);
  const paidAmount = paid.reduce((sum, i) => sum + i.amount, 0);
  const totalRevenue = invoices.reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Invoices</h1>
        <p className="mt-1 text-sm text-muted">
          Customer invoices and receivables for your business.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Total Invoices" description="All time">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <FileText className="size-5 text-brand-700" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{totalInvoices}</div>
          </div>
        </Card>
        <Card title="Outstanding" description="Awaiting payment">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-amber-50">
              <Clock className="size-5 text-amber-600" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">
              ₹{outstandingAmount.toLocaleString("en-IN")}
            </div>
          </div>
        </Card>
        <Card title="Paid" description="Collected">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success-soft">
              <CheckCircle2 className="size-5 text-success" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">
              ₹{paidAmount.toLocaleString("en-IN")}
            </div>
          </div>
        </Card>
        <Card title="Revenue" description="Total billed">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <TrendingUp className="size-5 text-brand-700" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">
              ₹{totalRevenue.toLocaleString("en-IN")}
            </div>
          </div>
        </Card>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No invoices yet"
          description="Invoices from restaurant bills, hotel stays, and events will appear here once you start serving customers."
        />
      ) : (
        <Card title="Recent Invoices">
          <div className="divide-y divide-line">
            {invoices.slice(0, 30).map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
                    <FileText className="size-5 text-brand-700" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink">{invoice.number}</div>
                    <div className="text-xs text-muted">
                      {invoice.customer} · {invoice.source}
                    </div>
                    <div className="text-xs text-muted">
                      {new Date(invoice.date).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-ink tabular-nums">
                    ₹{invoice.amount.toLocaleString("en-IN")}
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      invoice.status === "PAID"
                        ? "bg-success-soft text-success"
                        : invoice.status === "OVERDUE"
                          ? "bg-danger-soft text-danger"
                          : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {invoice.status}
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
