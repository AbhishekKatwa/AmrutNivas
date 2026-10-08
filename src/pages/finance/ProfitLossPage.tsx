/**
 * Profit & Loss — financial performance for the organization.
 *
 * Phase 4 destination. Reads income from operational tables (bills, folios,
 * events) and expenses from procurement (supplier payments) to present
 * a P&L view. Full double-entry accounting comes in a later phase.
 */

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, DollarSign, BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { useContextStore } from "@/state/context-store";
import { requireSupabase } from "@/db/client";

type IncomeBreakdown = {
  restaurant: number;
  hotel: number;
  events: number;
};

export default function ProfitLossPage() {
  const context = useContextStore((s) => s.context);
  const organizationId = context.organizationId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [income, setIncome] = useState(0);
  const [incomeBreakdown, setIncomeBreakdown] = useState<IncomeBreakdown>({ restaurant: 0, hotel: 0, events: 0 });
  const [expenses, setExpenses] = useState(0);

  useEffect(() => {
    if (!organizationId) return;
    let ignore = false;

    async function load() {
      setLoading(true);
      try {
        const sb = requireSupabase();

        const [billsRes, foliosRes, eventsRes, expensesRes] = await Promise.all([
          sb
            .from("bills")
            .select("grand_total")
            .eq("organization_id", organizationId)
            .eq("status", "PAID"),
          sb
            .from("folios")
            .select("total_charges")
            .eq("organization_id", organizationId)
            .eq("status", "SETTLED"),
          sb
            .from("events")
            .select("total_amount")
            .eq("organization_id", organizationId)
            .eq("status", "COMPLETED"),
          sb
            .from("supplier_payments")
            .select("total_amount")
            .eq("organization_id", organizationId)
            .eq("status", "POSTED"),
        ]);

        const restaurantIncome = billsRes.data?.reduce((s, b) => s + Number(b.grand_total || 0), 0) || 0;
        const hotelIncome = foliosRes.data?.reduce((s, f) => s + Number(f.total_charges || 0), 0) || 0;
        const eventIncome = eventsRes.data?.reduce((s, e) => s + Number(e.total_amount || 0), 0) || 0;
        const totalExpenses = expensesRes.data?.reduce((s, p) => s + Number(p.total_amount || 0), 0) || 0;

        if (!ignore) {
          setIncomeBreakdown({ restaurant: restaurantIncome, hotel: hotelIncome, events: eventIncome });
          setIncome(restaurantIncome + hotelIncome + eventIncome);
          setExpenses(totalExpenses);
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

  if (loading) return <LoadingBlock label="Loading profit & loss" />;

  const netProfit = income - expenses;
  const margin = income > 0 ? (netProfit / income) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Profit & Loss</h1>
        <p className="mt-1 text-sm text-muted">
          Financial performance — income, expenses, and net profit.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Total Income" description="All sources">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success-soft">
              <TrendingUp className="size-5 text-success" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">
              ₹{income.toLocaleString("en-IN")}
            </div>
          </div>
        </Card>
        <Card title="Total Expenses" description="Procurement">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-danger-soft">
              <TrendingDown className="size-5 text-danger" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">
              ₹{expenses.toLocaleString("en-IN")}
            </div>
          </div>
        </Card>
        <Card title="Net Profit" description="Income minus expenses">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <DollarSign className="size-5 text-brand-700" />
            </div>
            <div className={`text-2xl font-semibold tabular-nums ${netProfit >= 0 ? "text-success" : "text-danger"}`}>
              ₹{netProfit.toLocaleString("en-IN")}
            </div>
          </div>
        </Card>
        <Card title="Margin" description="Profit percentage">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-surface-sunken">
              <BarChart3 className="size-5 text-muted" />
            </div>
            <div className={`text-2xl font-semibold tabular-nums ${margin >= 0 ? "text-ink" : "text-danger"}`}>
              {margin.toFixed(1)}%
            </div>
          </div>
        </Card>
      </div>

      {income === 0 && expenses === 0 ? (
        <EmptyState
          icon={<TrendingUp />}
          title="No financial activity yet"
          description="Income from restaurant bills, hotel stays, and events will appear here alongside procurement expenses once transactions are recorded."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Income Breakdown">
            <div className="space-y-3">
              {[
                { label: "Restaurant", amount: incomeBreakdown.restaurant, color: "bg-brand-50 text-brand-700" },
                { label: "Hotel", amount: incomeBreakdown.hotel, color: "bg-success-soft text-success" },
                { label: "Events", amount: incomeBreakdown.events, color: "bg-amber-50 text-amber-600" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex size-8 items-center justify-center rounded-md ${row.color}`}>
                      <TrendingUp className="size-4" />
                    </div>
                    <span className="text-sm text-ink">{row.label}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-ink tabular-nums">
                      ₹{row.amount.toLocaleString("en-IN")}
                    </div>
                    {income > 0 && (
                      <div className="text-xs text-muted tabular-nums">
                        {((row.amount / income) * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Summary">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-sm text-muted">Gross Income</span>
                <span className="text-sm font-medium text-ink tabular-nums">
                  ₹{income.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-sm text-muted">Total Expenses</span>
                <span className="text-sm font-medium text-danger tabular-nums">
                  −₹{expenses.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm font-semibold text-ink">Net Profit</span>
                <span className={`text-sm font-semibold tabular-nums ${netProfit >= 0 ? "text-success" : "text-danger"}`}>
                  ₹{netProfit.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
