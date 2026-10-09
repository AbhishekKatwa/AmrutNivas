/**
 * Accounting — financial overview derived from operational data.
 *
 * Phase 4 destination. Shows a summary of financial activity organized
 * by account categories. Full double-entry bookkeeping (chart of accounts,
 * journal entries, general ledger) comes in a later phase.
 */

import { useEffect, useState } from "react";
import { BookOpen, Layers, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { useContextStore } from "@/state/context-store";
import { requireSupabase } from "@/db/client";

type AccountSummary = {
  category: string;
  accounts: { name: string; amount: number; type: "debit" | "credit" }[];
};

export default function AccountingPage() {
  const context = useContextStore((s) => s.context);
  const organizationId = context.organizationId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [totalDebits, setTotalDebits] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);

  useEffect(() => {
    if (!organizationId) return;
    let ignore = false;

    async function load() {
      setLoading(true);
      try {
        const sb = requireSupabase();

        const [billsRes, foliosRes, eventPaymentsRes, supplierRes, poRes] = await Promise.all([
          sb.from("bills").select("grand_total").eq("organization_id", organizationId).eq("status", "PAID"),
          sb.from("folios").select("total_charges").eq("organization_id", organizationId).eq("status", "SETTLED"),
          sb.from("event_payments").select("amount").eq("organization_id", organizationId),
          sb.from("supplier_payments").select("total_amount").eq("organization_id", organizationId).eq("status", "POSTED"),
          sb.from("purchase_orders").select("grand_total").eq("organization_id", organizationId).in("status", ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "PARTIALLY_RECEIVED"]),
        ]);

        const firstError =
          billsRes.error || foliosRes.error || eventPaymentsRes.error || supplierRes.error || poRes.error;
        if (firstError) throw firstError;

        const restaurantRevenue = billsRes.data?.reduce((s, b) => s + Number(b.grand_total || 0), 0) || 0;
        const roomRevenue = foliosRes.data?.reduce((s, f) => s + Number(f.total_charges || 0), 0) || 0;
        const eventRevenue = eventPaymentsRes.data?.reduce((s, e) => s + Number(e.amount || 0), 0) || 0;
        const paymentsMade = supplierRes.data?.reduce((s, p) => s + Number(p.total_amount || 0), 0) || 0;
        const poValue = poRes.data?.reduce((s, p) => s + Number(p.grand_total || 0), 0) || 0;

        const totalIncome = restaurantRevenue + roomRevenue + eventRevenue;

        const summaries: AccountSummary[] = [
          {
            category: "Revenue",
            accounts: [
              { name: "Restaurant Sales", amount: restaurantRevenue, type: "credit" },
              { name: "Room Revenue", amount: roomRevenue, type: "credit" },
              { name: "Event Revenue", amount: eventRevenue, type: "credit" },
            ],
          },
          {
            category: "Expenses",
            accounts: [
              { name: "Procurement Payments", amount: paymentsMade, type: "debit" },
            ],
          },
          {
            category: "Commitments",
            accounts: [
              { name: "Purchase Orders (open)", amount: poValue, type: "debit" },
            ],
          },
        ];

        const credits = totalIncome;
        const debits = paymentsMade;

        if (!ignore) {
          setAccounts(summaries);
          setTotalCredits(credits);
          setTotalDebits(debits);
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

  if (loading) return <LoadingBlock label="Loading accounting" />;

  const accountCount = accounts.reduce((s, g) => s + g.accounts.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Accounting</h1>
        <p className="mt-1 text-sm text-muted">
          Financial overview derived from operational data.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Accounts" description="Active categories">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <Layers className="size-5 text-brand-700" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{accountCount}</div>
          </div>
        </Card>
        <Card title="Credits" description="Revenue accounts">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success-soft">
              <ArrowDownLeft className="size-5 text-success" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">
              ₹{totalCredits.toLocaleString("en-IN")}
            </div>
          </div>
        </Card>
        <Card title="Debits" description="Expense accounts">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-danger-soft">
              <ArrowUpRight className="size-5 text-danger" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">
              ₹{totalDebits.toLocaleString("en-IN")}
            </div>
          </div>
        </Card>
        <Card title="Net" description="Credits minus debits">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-surface-sunken">
              <BookOpen className="size-5 text-muted" />
            </div>
            <div className={`text-2xl font-semibold tabular-nums ${(totalCredits - totalDebits) >= 0 ? "text-success" : "text-danger"}`}>
              ₹{(totalCredits - totalDebits).toLocaleString("en-IN")}
            </div>
          </div>
        </Card>
      </div>

      {accountCount === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="No accounting data yet"
          description="Financial activity from restaurant bills, hotel folios, events, and procurement will be summarized here as transactions are recorded."
        />
      ) : (
        <div className="space-y-4">
          {accounts.map((group) => (
            <Card key={group.category} title={group.category}>
              <div className="divide-y divide-line">
                {group.accounts.map((account) => (
                  <div key={account.name} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex size-8 items-center justify-center rounded-md ${
                        account.type === "credit" ? "bg-success-soft" : "bg-danger-soft"
                      }`}>
                        {account.type === "credit"
                          ? <ArrowDownLeft className="size-4 text-success" />
                          : <ArrowUpRight className="size-4 text-danger" />
                        }
                      </div>
                      <span className="text-sm text-ink">{account.name}</span>
                    </div>
                    <div className={`text-sm font-medium tabular-nums ${
                      account.type === "credit" ? "text-success" : "text-danger"
                    }`}>
                      {account.type === "credit" ? "" : "−"}₹{account.amount.toLocaleString("en-IN")}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
