/**
 * Reports — the analytics report catalog.
 *
 * Phase 4 destination. A curated catalog of pre-built reports across
 * all domains — operations, finance, inventory, CRM, HR, and more.
 */

import { useState } from "react";
import {
  BarChart3,
  FileText,
  PieChart,
  TrendingUp,
  Users,
  Package,
  DollarSign,
  Calendar,
  Download,
  Eye,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useContextStore } from "@/state/context-store";

type ReportCategory = {
  title: string;
  description: string;
  icon: React.ReactNode;
  count: number;
  reports: Report[];
};

type Report = {
  id: string;
  title: string;
  description: string;
  category: string;
  available: boolean;
};

const REPORTS: Report[] = [
  // Operations
  { id: "ops-daily-summary", title: "Daily Operations Summary", description: "Covers, tickets, KOT performance", category: "Operations", available: true },
  { id: "ops-peak-hours", title: "Peak Hours Analysis", description: "Busy times and staffing needs", category: "Operations", available: true },
  { id: "ops-table-turnover", title: "Table Turnover Report", description: "Table utilization and turnover rates", category: "Operations", available: true },
  { id: "ops-staff-performance", title: "Staff Performance", description: "Server efficiency and order times", category: "Operations", available: true },
  { id: "ops-menu-mix", title: "Menu Mix Analysis", description: "Item popularity and profitability", category: "Operations", available: true },
  { id: "ops-wastage", title: "Wastage Report", description: "Stock wastage and reasons", category: "Operations", available: true },
  { id: "ops-occupancy", title: "Occupancy Report", description: "Room occupancy and availability", category: "Operations", available: true },
  { id: "ops-housekeeping", title: "Housekeeping Efficiency", description: "Room cleaning times and status", category: "Operations", available: true },

  // Finance
  { id: "fin-revenue", title: "Revenue Report", description: "Revenue by source and period", category: "Finance", available: true },
  { id: "fin-expenses", title: "Expense Breakdown", description: "Expenses by category", category: "Finance", available: true },
  { id: "fin-pnl", title: "Profit & Loss Statement", description: "Income, expenses, net profit", category: "Finance", available: true },
  { id: "fin-cashflow", title: "Cash Flow Statement", description: "Cash in and out", category: "Finance", available: true },
  { id: "fin-receivables", title: "Receivables Aging", description: "Outstanding customer invoices", category: "Finance", available: true },
  { id: "fin-payables", title: "Payables Aging", description: "Outstanding supplier bills", category: "Finance", available: true },
  { id: "fin-tax", title: "Tax Summary", description: "Tax collected and paid", category: "Finance", available: true },
  { id: "fin-budget-variance", title: "Budget vs Actual", description: "Budget variance analysis", category: "Finance", available: true },
  { id: "fin-shed-pnl", title: "Shed-wise P&L", description: "Profitability per shed", category: "Finance", available: true },
  { id: "fin-batch-pnl", title: "Batch-wise P&L", description: "Profitability per batch", category: "Finance", available: true },
  { id: "fin-godown-ledger", title: "Godown Ledger", description: "Godown inventory and expenses", category: "Finance", available: true },
  { id: "fin-shortage", title: "Shortage Report", description: "Inventory shortages and losses", category: "Finance", available: true },
  { id: "fin-trader-statement", title: "Trader Statement", description: "Trader outstanding and payments", category: "Finance", available: true },
  { id: "fin-supplier-statement", title: "Supplier Statement", description: "Supplier outstanding and payments", category: "Finance", available: true },

  // Inventory
  { id: "inv-stock-movement", title: "Stock Movement Report", description: "Stock in, out, and transfers", category: "Inventory", available: true },
  { id: "inv-consumption", title: "Consumption Report", description: "Item consumption by period", category: "Inventory", available: true },
  { id: "inv-valuation", title: "Inventory Valuation", description: "Current stock value", category: "Inventory", available: true },
  { id: "inv-expiry", title: "Expiry Report", description: "Items nearing expiry", category: "Inventory", available: true },
  { id: "inv-reorder", title: "Reorder Report", description: "Items below reorder level", category: "Inventory", available: true },
  { id: "inv-feed-coverage", title: "Feed Coverage Forecast", description: "Days of stock coverage", category: "Inventory", available: true },

  // Sales
  { id: "sales-item-performance", title: "Item Performance", description: "Best and worst sellers", category: "Sales", available: true },
  { id: "sales-trends", title: "Sales Trends", description: "Sales over time", category: "Sales", available: true },
  { id: "sales-channel-mix", title: "Channel Mix", description: "Sales by channel", category: "Sales", available: true },
  { id: "sales-hourly", title: "Hourly Sales", description: "Sales by hour of day", category: "Sales", available: true },
  { id: "sales-daily", title: "Daily Sales", description: "Sales by day of week", category: "Sales", available: true },
  { id: "sales-forecast", title: "Sales Forecast", description: "Predicted sales", category: "Sales", available: true },
  { id: "sales-egg-rates", title: "Egg Rate Trends", description: "Egg selling rates over time", category: "Sales", available: true },
  { id: "sales-trader-analysis", title: "Trader Analysis", description: "Trader purchase patterns", category: "Sales", available: true },
  { id: "sales-grade-mix", title: "Grade Mix Report", description: "Sales by egg grade", category: "Sales", available: true },
  { id: "sales-bird-sales", title: "Bird Sales Report", description: "Flock sale performance", category: "Sales", available: true },

  // CRM
  { id: "crm-customer-analytics", title: "Customer Analytics", description: "Customer behavior and trends", category: "CRM", available: true },
  { id: "crm-loyalty", title: "Loyalty Program Report", description: "Loyalty points and redemptions", category: "CRM", available: true },
  { id: "crm-feedback", title: "Feedback Summary", description: "Customer feedback analysis", category: "CRM", available: true },
  { id: "crm-complaints", title: "Complaint Report", description: "Complaints and resolution times", category: "CRM", available: true },
  { id: "crm-segments", title: "Customer Segments", description: "Customer segment breakdown", category: "CRM", available: true },
  { id: "crm-retention", title: "Retention Report", description: "Customer retention rates", category: "CRM", available: true },
  { id: "crm-lifetime-value", title: "Lifetime Value", description: "Customer lifetime value", category: "CRM", available: true },

  // HR
  { id: "hr-attendance", title: "Attendance Report", description: "Employee attendance", category: "HR", available: true },
  { id: "hr-shifts", title: "Shift Report", description: "Shift coverage and hours", category: "HR", available: true },
  { id: "hr-labor-cost", title: "Labor Cost Report", description: "Labor costs by period", category: "HR", available: true },
  { id: "hr-leave", title: "Leave Report", description: "Leave taken by employee", category: "HR", available: true },
  { id: "hr-overtime", title: "Overtime Report", description: "Overtime hours and costs", category: "HR", available: true },
];

export default function ReportsPage() {
  const context = useContextStore((s) => s.context);
  const hasOrg = context.organizationId !== null;
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories: ReportCategory[] = [
    {
      title: "Operations",
      description: "Daily ops, covers, tickets, KOT performance",
      icon: <BarChart3 className="size-5 text-brand-700" />,
      count: REPORTS.filter((r) => r.category === "Operations").length,
      reports: REPORTS.filter((r) => r.category === "Operations"),
    },
    {
      title: "Finance",
      description: "Revenue, expenses, P&L, cash flow",
      icon: <DollarSign className="size-5 text-brand-700" />,
      count: REPORTS.filter((r) => r.category === "Finance").length,
      reports: REPORTS.filter((r) => r.category === "Finance"),
    },
    {
      title: "Inventory",
      description: "Stock movements, consumption, wastage",
      icon: <Package className="size-5 text-brand-700" />,
      count: REPORTS.filter((r) => r.category === "Inventory").length,
      reports: REPORTS.filter((r) => r.category === "Inventory"),
    },
    {
      title: "Sales",
      description: "Menu mix, item performance, trends",
      icon: <TrendingUp className="size-5 text-brand-700" />,
      count: REPORTS.filter((r) => r.category === "Sales").length,
      reports: REPORTS.filter((r) => r.category === "Sales"),
    },
    {
      title: "CRM",
      description: "Customer analytics, loyalty, feedback",
      icon: <Users className="size-5 text-brand-700" />,
      count: REPORTS.filter((r) => r.category === "CRM").length,
      reports: REPORTS.filter((r) => r.category === "CRM"),
    },
    {
      title: "HR",
      description: "Attendance, shifts, labor cost",
      icon: <Calendar className="size-5 text-brand-700" />,
      count: REPORTS.filter((r) => r.category === "HR").length,
      reports: REPORTS.filter((r) => r.category === "HR"),
    },
  ];

  const totalReports = REPORTS.length;
  const filteredReports = selectedCategory
    ? REPORTS.filter((r) => r.category === selectedCategory)
    : REPORTS;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Reports</h1>
        <p className="mt-1 text-sm text-muted">
          Pre-built reports across all business domains.
        </p>
      </div>

      {!hasOrg ? (
        <EmptyState
          icon={<FileText />}
          title="No organization selected"
          description="Select an organization to access reports."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card title="Available Reports" description="Pre-built templates">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
                  <FileText className="size-5 text-brand-700" />
                </div>
                <div className="text-2xl font-semibold text-ink tabular-nums">{totalReports}</div>
              </div>
            </Card>
            <Card title="Categories" description="Report domains">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
                  <PieChart className="size-5 text-brand-700" />
                </div>
                <div className="text-2xl font-semibold text-ink tabular-nums">
                  {categories.length}
                </div>
              </div>
            </Card>
            <Card title="Ready to Use" description="Available now">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-success-soft">
                  <BarChart3 className="size-5 text-success" />
                </div>
                <div className="text-2xl font-semibold text-ink tabular-nums">{totalReports}</div>
              </div>
            </Card>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedCategory === null
                    ? "bg-brand-700 text-white"
                    : "bg-surface-sunken text-muted hover:bg-surface-sunken/80"
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.title}
                  onClick={() => setSelectedCategory(cat.title)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    selectedCategory === cat.title
                      ? "bg-brand-700 text-white"
                      : "bg-surface-sunken text-muted hover:bg-surface-sunken/80"
                  }`}
                >
                  {cat.title}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredReports.map((report) => {
                const category = categories.find((c) => c.title === report.category);
                return (
                  <div
                    key={report.id}
                    className="group rounded-lg border border-line bg-surface p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/30"
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {category?.icon}
                        <span className="text-xs font-medium text-muted">{report.category}</span>
                      </div>
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          className="rounded p-1 hover:bg-surface-sunken"
                          title="View report"
                        >
                          <Eye className="size-4 text-muted" />
                        </button>
                        <button
                          className="rounded p-1 hover:bg-surface-sunken"
                          title="Export report"
                        >
                          <Download className="size-4 text-muted" />
                        </button>
                      </div>
                    </div>
                    <div className="text-sm font-medium text-ink">{report.title}</div>
                    <div className="mt-1 text-xs text-muted">{report.description}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
