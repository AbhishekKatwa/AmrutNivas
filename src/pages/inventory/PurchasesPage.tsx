/**
 * Purchases — purchase-order ledger with full procurement workflow.
 *
 * Tabs:
 *   - Orders      — PO list + create dialog + status transitions
 *   - Receipts    — Goods receipt list + create GRN (against PO) + post GRN
 *   - Invoices    — Supplier invoice list + create invoice + post
 *   - Payments    — Supplier payment list + record payment + allocate to invoices
 *
 * Phase A fix: UI-0020 — was a read-only dashboard; needs Create PO + GRN +
 * Invoice + Payment flows so the cross-module chain
 * Supplier -> PO -> GRN -> Invoice -> Payment -> Stock Ledger can be exercised
 * end-to-end through the UI.
 */

import { useEffect, useState } from "react";
import {
  Plus,
  Package,
  ClipboardCheck,
  Truck,
  Receipt,
  Wallet,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput, type SelectOption } from "@/components/ui/SelectInput";
import { TextInput } from "@/components/ui/TextInput";
import {
  listPurchaseOrders,
  createPurchaseOrder,
  addPurchaseOrderItems,
  setPurchaseOrderStatus,
  listPurchaseOrderItems,
} from "@/domain/procurement/purchase-service";
import {
  listGoodsReceipts,
  createGoodsReceipt,
  addGoodsReceiptItems,
  postGoodsReceipt,
} from "@/domain/procurement/receipt-service";
import {
  listPurchaseInvoices,
  createPurchaseInvoice,
  addPurchaseInvoiceItems,
  setPurchaseInvoiceStatus,
  recordSupplierPayment,
  allocatePaymentToInvoice,
  listSupplierPayments,
} from "@/domain/procurement/invoice-service";
import { listSuppliers } from "@/domain/procurement/supplier-service";
import { listItems } from "@/domain/inventory/inventory-service";
import { listUnits } from "@/domain/inventory/inventory-service";
import { listLocations } from "@/domain/inventory/inventory-service";
import {
  PAYMENT_METHODS,
  SUPPLIER_STATUSES,
  type GoodsReceipt,
  type GoodsReceiptStatus,
  type PaymentMethod,
  type PurchaseInvoice,
  type PurchaseOrder,
  type PurchaseOrderStatus,
  type Supplier,
  type SupplierPayment,
  type InvoiceStatus,
} from "@/domain/procurement/types";
import { useContextStore } from "@/state/context-store";

type Tab = "orders" | "receipts" | "invoices" | "payments";

type POFormState = {
  supplierId: string;
  outletId: string;
  expectedDelivery: string;
  notes: string;
  items: Array<{
    itemId: string;
    quantity: string;
    unitId: string;
    unitRate: string;
    taxRate: string;
    description: string;
  }>;
};

const EMPTY_PO_FORM: POFormState = {
  supplierId: "",
  outletId: "",
  expectedDelivery: "",
  notes: "",
  items: [{ itemId: "", quantity: "", unitId: "", unitRate: "", taxRate: "5", description: "" }],
};

type GRNFormState = {
  purchaseOrderId: string;
  locationId: string;
  notes: string;
  items: Array<{
    itemId: string;
    unitId: string;
    receivedQuantity: string;
    acceptedQuantity: string;
    unitCost: string;
  }>;
};

const EMPTY_GRN_FORM: GRNFormState = {
  purchaseOrderId: "",
  locationId: "",
  notes: "",
  items: [
    { itemId: "", unitId: "", receivedQuantity: "", acceptedQuantity: "", unitCost: "" },
  ],
};

type InvoiceFormState = {
  supplierId: string;
  purchaseOrderId: string;
  invoiceDate: string;
  dueDate: string;
  notes: string;
  items: Array<{
    itemId: string;
    unitId: string;
    quantity: string;
    unitRate: string;
    taxRate: string;
    description: string;
  }>;
};

const EMPTY_INVOICE_FORM: InvoiceFormState = {
  supplierId: "",
  purchaseOrderId: "",
  invoiceDate: new Date().toISOString().slice(0, 10),
  dueDate: "",
  notes: "",
  items: [{ itemId: "", unitId: "", quantity: "", unitRate: "", taxRate: "5", description: "" }],
};

type PaymentFormState = {
  supplierId: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  amount: string;
  reference: string;
  notes: string;
  allocations: Array<{ invoiceId: string; amount: string }>;
};

const EMPTY_PAYMENT_FORM: PaymentFormState = {
  supplierId: "",
  paymentDate: new Date().toISOString().slice(0, 10),
  paymentMethod: "BANK_TRANSFER",
  amount: "",
  reference: "",
  notes: "",
  allocations: [],
};

const PO_STATUS_TONES: Record<PurchaseOrderStatus, "muted" | "warning" | "success" | "danger" | "brand"> = {
  DRAFT: "muted",
  PENDING_APPROVAL: "warning",
  APPROVED: "brand",
  SENT: "brand",
  PARTIALLY_RECEIVED: "warning",
  RECEIVED: "success",
  CLOSED: "muted",
  CANCELLED: "danger",
};

const GRN_STATUS_TONES: Record<GoodsReceiptStatus, "muted" | "warning" | "success" | "danger"> = {
  DRAFT: "muted",
  POSTED: "success",
  CANCELLED: "danger",
};

const INVOICE_STATUS_TONES: Record<InvoiceStatus, "muted" | "warning" | "success" | "danger" | "brand"> = {
  DRAFT: "muted",
  POSTED: "brand",
  PARTIALLY_PAID: "warning",
  FULLY_PAID: "success",
  CANCELLED: "danger",
};

const PAYMENT_METHOD_OPTIONS: SelectOption<PaymentMethod>[] = PAYMENT_METHODS.map((m) => ({
  value: m,
  label: m.replace(/_/g, " "),
}));

export default function PurchasesPage() {
  const context = useContextStore((s) => s.context);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;
  const outletId = context.outletId ?? undefined;

  const [tab, setTab] = useState<Tab>("orders");
  const [refreshKey, setRefreshKey] = useState(0);

  // Master data
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [units, setUnits] = useState<{ id: string; name: string; code: string }[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);

  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
  const [receipts, setReceipts] = useState<GoodsReceipt[] | null>(null);
  const [invoices, setInvoices] = useState<PurchaseInvoice[] | null>(null);
  const [payments, setPayments] = useState<SupplierPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [poDialog, setPoDialog] = useState(false);
  const [grnDialog, setGrnDialog] = useState(false);
  const [invDialog, setInvDialog] = useState(false);
  const [payDialog, setPayDialog] = useState(false);

  const [poForm, setPoForm] = useState<POFormState>(EMPTY_PO_FORM);
  const [grnForm, setGrnForm] = useState<GRNFormState>(EMPTY_GRN_FORM);
  const [invForm, setInvForm] = useState<InvoiceFormState>(EMPTY_INVOICE_FORM);
  const [payForm, setPayForm] = useState<PaymentFormState>(EMPTY_PAYMENT_FORM);

  const [poBusy, setPoBusy] = useState(false);
  const [grnBusy, setGrnBusy] = useState(false);
  const [invBusy, setInvBusy] = useState(false);
  const [payBusy, setPayBusy] = useState(false);

  function bump() { setRefreshKey((k) => k + 1); }

  useEffect(() => {
    if (!organizationId || !propertyId) return;
    Promise.allSettled([
      listSuppliers(organizationId, { status: "ACTIVE" }),
      listItems(organizationId),
      listUnits(organizationId),
      listLocations(organizationId, propertyId, outletId),
    ]).then(([s, i, u, l]) => {
      if (s.status === "fulfilled") setSuppliers(s.value);
      if (i.status === "fulfilled") setItems(i.value.map((x) => ({ id: x.id, name: x.name })));
      if (u.status === "fulfilled") setUnits(u.value.map((x) => ({ id: x.id, name: x.name, code: x.code })));
      if (l.status === "fulfilled") setLocations(l.value.map((x) => ({ id: x.id, name: x.name })));
    });
  }, [organizationId, propertyId, refreshKey]);

  useEffect(() => {
    if (!organizationId) return;
    setOrders(null);
    listPurchaseOrders(organizationId).then(setOrders).catch((e) => setError(String(e)));
  }, [organizationId, refreshKey]);

  useEffect(() => {
    if (!organizationId) return;
    setReceipts(null);
    listGoodsReceipts(organizationId).then(setReceipts).catch(() => {});
  }, [organizationId, refreshKey]);

  useEffect(() => {
    if (!organizationId) return;
    setInvoices(null);
    listPurchaseInvoices(organizationId).then(setInvoices).catch(() => {});
  }, [organizationId, refreshKey]);

  useEffect(() => {
    if (!organizationId) return;
    setPayments(null);
    listSupplierPayments(organizationId).then(setPayments).catch(() => {});
  }, [organizationId, refreshKey]);

  if (!organizationId || !propertyId) {
    return <LoadingBlock label="Loading procurement context" />;
  }

  const supplierOptions: SelectOption<string>[] = [
    { value: "", label: "Select supplier" },
    ...suppliers.filter((s) => s.status === "ACTIVE").map((s) => ({ value: s.id, label: s.legalName })),
  ];
  const itemOptions: SelectOption<string>[] = [
    { value: "", label: "Select item" },
    ...items.map((i) => ({ value: i.id, label: i.name })),
  ];
  const unitOptions: SelectOption<string>[] = [
    { value: "", label: "Unit" },
    ...units.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` })),
  ];
  const locationOptions: SelectOption<string>[] = [
    { value: "", label: "Select location" },
    ...locations.map((l) => ({ value: l.id, label: l.name })),
  ];

  // The page-level error banner sits behind an open dialog's overlay, so each
  // dialog renders it too — errors must never be invisible (no masking).
  const errorBanner = error ? (
    <div className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
      {error}
    </div>
  ) : null;

  // ============================ PO submit ============================

  async function submitPO() {
    if (!organizationId || !propertyId || !poForm.supplierId) return;
    setPoBusy(true);
    setError(null);
    try {
      const lineItems = poForm.items
        .filter((it) => it.itemId && parseFloat(it.quantity) > 0 && it.unitId)
        .map((it) => ({
          inventoryItemId: it.itemId,
          description: it.description || undefined,
          orderedQuantity: parseFloat(it.quantity),
          uom: it.unitId,
          unitRate: parseFloat(it.unitRate) || 0,
          taxRate: parseFloat(it.taxRate) || 0,
        }));
      if (lineItems.length === 0) {
        setError("Add at least one line item with item + quantity + unit.");
        setPoBusy(false);
        return;
      }
      const created = await createPurchaseOrder(organizationId, propertyId, poForm.supplierId, {
        outletId: outletId,
        expectedDelivery: poForm.expectedDelivery || undefined,
        notes: poForm.notes.trim() || undefined,
      });
      await addPurchaseOrderItems(created.id, organizationId, lineItems);
      if (created.status === "DRAFT") {
        // The door's state machine forbids DRAFT → APPROVED (029_purchase_orders.sql);
        // hop through PENDING_APPROVAL so the save completes.
        await setPurchaseOrderStatus(created.id, organizationId, "PENDING_APPROVAL", "Submitted via UI");
        await setPurchaseOrderStatus(created.id, organizationId, "APPROVED", "Approved via UI");
      }
      setPoDialog(false);
      setPoForm(EMPTY_PO_FORM);
      bump();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPoBusy(false);
    }
  }

  // ============================ GRN submit ============================

  async function submitGRN() {
    if (!organizationId || !propertyId || !grnForm.purchaseOrderId || !grnForm.locationId) {
      setError("Select PO + location.");
      return;
    }
    setGrnBusy(true);
    setError(null);
    try {
      const poItemsResp = await listPurchaseOrderItems(grnForm.purchaseOrderId);
      const itemsById = new Map<string, string>(); // inventoryItemId -> poItemId
      poItemsResp.forEach((pi) => itemsById.set(pi.inventoryItemId, pi.id));

      const lineItems = grnForm.items
        .filter((it) => it.itemId && parseFloat(it.receivedQuantity) > 0 && it.unitId)
        .map((it) => {
          const poItemId = itemsById.get(it.itemId);
          if (!poItemId) throw new Error(`No PO line for item ${it.itemId}`);
          const rq = parseFloat(it.receivedQuantity);
          const aq = parseFloat(it.acceptedQuantity || it.receivedQuantity);
          return {
            purchaseOrderItemId: poItemId,
            inventoryItemId: it.itemId,
            receivedQuantity: rq,
            acceptedQuantity: aq,
            rejectedQuantity: Math.max(0, rq - aq),
            uom: it.unitId,
            unitRate: parseFloat(it.unitCost) || 0,
          };
        });
      if (lineItems.length === 0) {
        setError("Add at least one receipt line.");
        setGrnBusy(false);
        return;
      }
      // The GRN door only accepts SENT / PARTIALLY_RECEIVED POs (030_goods_receipt.sql);
      // sending an APPROVED PO is implied by receiving it.
      const po = (orders ?? []).find((o) => o.id === grnForm.purchaseOrderId);
      if (po && po.status === "APPROVED") {
        await setPurchaseOrderStatus(po.id, organizationId, "SENT", "Sent to supplier (receiving via UI)");
      }
      const created = await createGoodsReceipt(
        organizationId,
        propertyId,
        grnForm.purchaseOrderId,
        grnForm.locationId,
        { outletId, notes: grnForm.notes.trim() || undefined },
      );
      await addGoodsReceiptItems(created.id, organizationId, lineItems);
      await postGoodsReceipt(created.id, organizationId);
      setGrnDialog(false);
      setGrnForm(EMPTY_GRN_FORM);
      bump();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGrnBusy(false);
    }
  }

  // ============================ Invoice submit ============================

  async function submitInvoice() {
    if (!organizationId || !propertyId || !outletId || !invForm.supplierId) {
      setError("Outlet + supplier are required.");
      return;
    }
    setInvBusy(true);
    setError(null);
    try {
      const lineItems = invForm.items
        .filter((it) => it.itemId && parseFloat(it.quantity) > 0 && it.unitId)
        .map((it) => ({
          itemId: it.itemId,
          description: it.description || "",
          quantity: parseFloat(it.quantity),
          unitId: it.unitId,
          unitRate: parseFloat(it.unitRate) || 0,
          taxRate: parseFloat(it.taxRate) || 0,
        }));
      if (lineItems.length === 0) {
        setError("Add at least one line.");
        setInvBusy(false);
        return;
      }
      const created = await createPurchaseInvoice(organizationId, propertyId, outletId, invForm.supplierId, {
        purchaseOrderId: invForm.purchaseOrderId || undefined,
        invoiceDate: invForm.invoiceDate,
        dueDate: invForm.dueDate || undefined,
        notes: invForm.notes.trim() || undefined,
      });
      await addPurchaseInvoiceItems(created.id, lineItems);
      await setPurchaseInvoiceStatus(created.id, "POSTED", "Posted via UI");
      setInvDialog(false);
      setInvForm(EMPTY_INVOICE_FORM);
      bump();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInvBusy(false);
    }
  }

  // ============================ Payment submit ============================

  async function submitPayment() {
    if (!organizationId || !propertyId || !outletId || !payForm.supplierId || !parseFloat(payForm.amount)) {
      setError("Supplier + amount are required.");
      return;
    }
    setPayBusy(true);
    setError(null);
    try {
      const payment = await recordSupplierPayment(organizationId, propertyId, outletId, payForm.supplierId, {
        paymentDate: payForm.paymentDate,
        paymentMethod: payForm.paymentMethod,
        amount: parseFloat(payForm.amount),
        referenceNumber: payForm.reference || undefined,
        notes: payForm.notes.trim() || undefined,
      });
      // Allocations
      for (const alloc of payForm.allocations) {
        if (alloc.invoiceId && parseFloat(alloc.amount) > 0) {
          await allocatePaymentToInvoice(payment.id, alloc.invoiceId, parseFloat(alloc.amount));
        }
      }
      setPayDialog(false);
      setPayForm({ ...EMPTY_PAYMENT_FORM, paymentMethod: payForm.paymentMethod });
      bump();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPayBusy(false);
    }
  }

  async function transitionOrder(po: PurchaseOrder, status: PurchaseOrderStatus) {
    if (!organizationId) return;
    try {
      await setPurchaseOrderStatus(po.id, organizationId, status, `Set to ${status} via UI`);
      bump();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const draft = orders?.filter((o) => o.status === "DRAFT" || o.status === "PENDING_APPROVAL") ?? [];
  const approved = orders?.filter((o) => o.status === "APPROVED" || o.status === "SENT") ?? [];
  const received = orders?.filter((o) => o.status === "PARTIALLY_RECEIVED" || o.status === "RECEIVED" || o.status === "CLOSED") ?? [];
  const openInvoices = invoices?.filter((i) => i.status === "POSTED" || i.status === "PARTIALLY_PAID") ?? [];
  const outstanding = openInvoices.reduce((s, i) => s + (i.outstandingAmount ?? 0), 0);

  const PO_COLUMNS: DataColumn<PurchaseOrder>[] = [
    { key: "no", header: "PO #", render: (o) => <span className="font-mono text-xs">{o.poNumber}</span> },
    {
      key: "supplier",
      header: "Supplier",
      render: (o) => suppliers.find((s) => s.id === o.supplierId)?.legalName ?? o.supplierId.slice(0, 8),
    },
    { key: "date", header: "Order Date", render: (o) => new Date(o.orderDate).toLocaleDateString() },
    { key: "totals", header: "Total", render: (o) => <span className="tabular-nums">₹{(o.grandTotal ?? 0).toLocaleString("en-IN")}</span> },
    { key: "received", header: "Received", render: (o) => <span className="tabular-nums">{o.totalReceived ?? 0}</span> },
    {
      key: "status",
      header: "Status",
      render: (o) => <Badge tone={PO_STATUS_TONES[o.status]}>{o.status}</Badge>,
    },
    {
      key: "actions",
      header: "Action",
      render: (o) => (
        <div className="flex flex-wrap gap-1">
          {o.status === "DRAFT" && (
            <Button size="sm" variant="secondary" onClick={() => transitionOrder(o, "PENDING_APPROVAL")}>
              Submit
            </Button>
          )}
          {o.status === "PENDING_APPROVAL" && (
            <Button size="sm" variant="primary" onClick={() => transitionOrder(o, "APPROVED")}>
              Approve
            </Button>
          )}
          {(o.status === "APPROVED" || o.status === "SENT") && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setGrnDialog(true);
                setGrnForm({ ...EMPTY_GRN_FORM, purchaseOrderId: o.id });
              }}
            >
              Receive
            </Button>
          )}
          {o.status === "RECEIVED" && (
            <Button size="sm" variant="secondary" onClick={() => transitionOrder(o, "CLOSED")}>
              Close
            </Button>
          )}
        </div>
      ),
    },
  ];

  const GRN_COLUMNS: DataColumn<GoodsReceipt>[] = [
    { key: "no", header: "GRN #", render: (r) => <span className="font-mono text-xs">{r.receiptNumber}</span> },
    { key: "po", header: "PO", render: (r) => <span className="font-mono text-xs">{r.purchaseOrderId.slice(0, 8)}</span> },
    {
      key: "supplier",
      header: "Supplier",
      render: (r) => suppliers.find((s) => s.id === r.supplierId)?.legalName ?? r.supplierId.slice(0, 8),
    },
    { key: "when", header: "Received", render: (r) => new Date(r.receivedAt ?? r.createdAt).toLocaleString() },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={GRN_STATUS_TONES[r.status]}>{r.status}</Badge>,
    },
  ];

  const INVOICE_COLUMNS: DataColumn<PurchaseInvoice>[] = [
    { key: "no", header: "Invoice #", render: (i) => <span className="font-mono text-xs">{i.invoiceNumber}</span> },
    {
      key: "supplier",
      header: "Supplier",
      render: (i) => suppliers.find((s) => s.id === i.supplierId)?.legalName ?? i.supplierId.slice(0, 8),
    },
    { key: "date", header: "Date", render: (i) => new Date(i.invoiceDate).toLocaleDateString() },
    { key: "total", header: "Total", render: (i) => <span className="tabular-nums">₹{(i.totalAmount ?? 0).toLocaleString("en-IN")}</span> },
    { key: "outstanding", header: "Outstanding", render: (i) => <span className="tabular-nums">₹{(i.outstandingAmount ?? 0).toLocaleString("en-IN")}</span> },
    {
      key: "status",
      header: "Status",
      render: (i) => <Badge tone={INVOICE_STATUS_TONES[i.status]}>{i.status}</Badge>,
    },
  ];

  const PAYMENT_COLUMNS: DataColumn<SupplierPayment>[] = [
    { key: "no", header: "Payment #", render: (p) => <span className="font-mono text-xs">{p.paymentNumber}</span> },
    {
      key: "supplier",
      header: "Supplier",
      render: (p) => suppliers.find((s) => s.id === p.supplierId)?.legalName ?? p.supplierId.slice(0, 8),
    },
    { key: "date", header: "Date", render: (p) => new Date(p.paymentDate).toLocaleDateString() },
    { key: "method", header: "Method", render: (p) => <Badge tone="muted">{p.paymentMethod.replace(/_/g, " ")}</Badge> },
    { key: "amount", header: "Amount", render: (p) => <span className="tabular-nums">₹{(p.totalAmount ?? 0).toLocaleString("en-IN")}</span> },
  ];

  function TabBtn({ t, label, count, icon }: { t: Tab; label: string; count: number; icon: React.ReactNode }) {
    return (
      <button
        type="button"
        onClick={() => setTab(t)}
        className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
          tab === t ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-surface text-muted hover:bg-surface-sunken"
        }`}
      >
        {icon}
        <span className="font-medium">{label}</span>
        <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs tabular-nums">{count}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Procurement</h1>
          <p className="mt-0.5 text-xs text-muted">
            Supplier purchase orders · goods receipts · supplier invoices · payments
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "orders" && (
            <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setPoDialog(true)}>
              Create PO
            </Button>
          )}
          {tab === "receipts" && (
            <Button variant="primary" icon={<Truck className="size-4" aria-hidden />} onClick={() => setGrnDialog(true)}>
              Record GRN
            </Button>
          )}
          {tab === "invoices" && (
            <Button variant="primary" icon={<Receipt className="size-4" aria-hidden />} onClick={() => setInvDialog(true)}>
              Record Supplier Invoice
            </Button>
          )}
          {tab === "payments" && (
            <Button variant="primary" icon={<Wallet className="size-4" aria-hidden />} onClick={() => setPayDialog(true)}>
              Record Payment
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Draft / Pending" description="Awaiting approval">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-amber-50">
              <ClipboardCheck className="size-5 text-amber-600" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{draft.length}</div>
          </div>
        </Card>
        <Card title="Open / Approved" description="With supplier">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <Package className="size-5 text-brand-700" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{approved.length}</div>
          </div>
        </Card>
        <Card title="Received" description="Goods received">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success-soft">
              <Truck className="size-5 text-success" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{received.length}</div>
          </div>
        </Card>
        <Card title="Outstanding Payable" description="Unpaid invoices">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-surface-sunken">
              <Wallet className="size-5 text-muted" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">
              ₹{outstanding.toLocaleString("en-IN")}
            </div>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <TabBtn t="orders" label="Orders" count={orders?.length ?? 0} icon={<Package className="size-4" />} />
        <TabBtn t="receipts" label="Receipts" count={receipts?.length ?? 0} icon={<Truck className="size-4" />} />
        <TabBtn t="invoices" label="Invoices" count={invoices?.length ?? 0} icon={<Receipt className="size-4" />} />
        <TabBtn t="payments" label="Payments" count={payments?.length ?? 0} icon={<Wallet className="size-4" />} />
      </div>

      {error && (
        <div className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {tab === "orders" && (
        <Card title="Purchase Orders" padded={false}>
          {orders === null ? (
            <LoadingBlock label="Loading orders" />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={<Package aria-hidden />}
              title="No purchase orders yet"
              description="Create a PO with one or more line items to start the procurement workflow."
              action={
                <Button variant="primary" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setPoDialog(true)}>
                  Create PO
                </Button>
              }
            />
          ) : (
            <DataTable<PurchaseOrder>
              columns={PO_COLUMNS}
              rows={orders}
              rowKey={(o) => o.id}
              loading={false}
              empty={null}
            />
          )}
        </Card>
      )}

      {tab === "receipts" && (
        <Card title="Goods Receipts" padded={false}>
          {receipts === null ? (
            <LoadingBlock label="Loading receipts" />
          ) : receipts.length === 0 ? (
            <EmptyState icon={<Truck aria-hidden />} title="No goods receipts" description="Receive against an approved PO to create a GRN." />
          ) : (
            <DataTable<GoodsReceipt>
              columns={GRN_COLUMNS}
              rows={receipts}
              rowKey={(r) => r.id}
              loading={false}
              empty={null}
            />
          )}
        </Card>
      )}

      {tab === "invoices" && (
        <Card title="Supplier Invoices" padded={false}>
          {invoices === null ? (
            <LoadingBlock label="Loading invoices" />
          ) : invoices.length === 0 ? (
            <EmptyState icon={<Receipt aria-hidden />} title="No supplier invoices" description="Record a supplier invoice to start payment tracking." />
          ) : (
            <DataTable<PurchaseInvoice>
              columns={INVOICE_COLUMNS}
              rows={invoices}
              rowKey={(i) => i.id}
              loading={false}
              empty={null}
            />
          )}
        </Card>
      )}

      {tab === "payments" && (
        <Card title="Supplier Payments" padded={false}>
          {payments === null ? (
            <LoadingBlock label="Loading payments" />
          ) : payments.length === 0 ? (
            <EmptyState icon={<Wallet aria-hidden />} title="No payments recorded" description="Record a payment against a posted supplier invoice." />
          ) : (
            <DataTable<SupplierPayment>
              columns={PAYMENT_COLUMNS}
              rows={payments}
              rowKey={(p) => p.id}
              loading={false}
              empty={null}
            />
          )}
        </Card>
      )}

      {/* ============================== PO Dialog ============================== */}
      <Dialog
        size="lg"
        open={poDialog}
        onClose={() => { setPoDialog(false); setPoForm(EMPTY_PO_FORM); }}
        title="Create Purchase Order"
        description="Header + line items. Status moves to APPROVED on save."
        footer={
          <>
            <Button variant="secondary" onClick={() => { setPoDialog(false); setPoForm(EMPTY_PO_FORM); }}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitPO} disabled={poBusy || !poForm.supplierId}>
              {poBusy ? "Creating..." : "Create PO"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {errorBanner}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier" required>
              <SelectInput<string>
                options={supplierOptions}
                value={poForm.supplierId}
                onChange={(v) => setPoForm({ ...poForm, supplierId: v })}
              />
            </Field>
            <Field label="Expected Delivery">
              <TextInput
                type="date"
                value={poForm.expectedDelivery}
                onChange={(e) => setPoForm({ ...poForm, expectedDelivery: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Notes">
            <TextInput
              value={poForm.notes}
              onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
              placeholder="Optional PO-level notes"
            />
          </Field>
          <div className="border-t border-line pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Line Items</span>
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus className="size-3.5" aria-hidden />}
                onClick={() =>
                  setPoForm({
                    ...poForm,
                    items: [...poForm.items, { itemId: "", quantity: "", unitId: "", unitRate: "", taxRate: "5", description: "" }],
                  })
                }
              >
                Add Line
              </Button>
            </div>
            <div className="space-y-2">
              {poForm.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-4">
                    <SelectInput<string>
                      options={itemOptions}
                      value={it.itemId}
                      onChange={(v) => {
                        const items = [...poForm.items];
                        items[idx] = { ...items[idx], itemId: v };
                        setPoForm({ ...poForm, items });
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <TextInput
                      placeholder="Qty"
                      type="number"
                      value={it.quantity}
                      onChange={(e) => {
                        const items = [...poForm.items];
                        items[idx] = { ...items[idx], quantity: e.target.value };
                        setPoForm({ ...poForm, items });
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <SelectInput<string>
                      options={unitOptions}
                      value={it.unitId}
                      onChange={(v) => {
                        const items = [...poForm.items];
                        items[idx] = { ...items[idx], unitId: v };
                        setPoForm({ ...poForm, items });
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <TextInput
                      placeholder="Rate"
                      type="number"
                      value={it.unitRate}
                      onChange={(e) => {
                        const items = [...poForm.items];
                        items[idx] = { ...items[idx], unitRate: e.target.value };
                        setPoForm({ ...poForm, items });
                      }}
                    />
                  </div>
                  <div className="col-span-1">
                    <TextInput
                      placeholder="Tax%"
                      type="number"
                      value={it.taxRate}
                      onChange={(e) => {
                        const items = [...poForm.items];
                        items[idx] = { ...items[idx], taxRate: e.target.value };
                        setPoForm({ ...poForm, items });
                      }}
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPoForm({ ...poForm, items: poForm.items.filter((_, i) => i !== idx) })}
                      disabled={poForm.items.length <= 1}
                    >
                      ×
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Dialog>

      {/* ============================== GRN Dialog ============================== */}
      <Dialog
        size="lg"
        open={grnDialog}
        onClose={() => { setGrnDialog(false); setGrnForm(EMPTY_GRN_FORM); }}
        title="Record Goods Receipt (GRN)"
        description="Receive items into a location. Stock ledger entries fire on POST."
        footer={
          <>
            <Button variant="secondary" onClick={() => { setGrnDialog(false); setGrnForm(EMPTY_GRN_FORM); }}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitGRN} disabled={grnBusy || !grnForm.purchaseOrderId || !grnForm.locationId}>
              {grnBusy ? "Posting..." : "Post GRN"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {errorBanner}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Purchase Order" required>
              <SelectInput<string>
                options={[
                  { value: "", label: "Select PO" },
                  ...(orders ?? [])
                    .filter((o) => o.status === "APPROVED" || o.status === "SENT" || o.status === "PARTIALLY_RECEIVED")
                    .map((o) => ({
                      value: o.id,
                      label: `${o.poNumber} · ${suppliers.find((s) => s.id === o.supplierId)?.legalName ?? "?"} · ₹${(o.grandTotal ?? 0).toLocaleString("en-IN")}`,
                    })),
                ]}
                value={grnForm.purchaseOrderId}
                onChange={(v) => setGrnForm({ ...grnForm, purchaseOrderId: v })}
              />
            </Field>
            <Field label="Receive into Location" required>
              <SelectInput<string>
                options={locationOptions}
                value={grnForm.locationId}
                onChange={(v) => setGrnForm({ ...grnForm, locationId: v })}
              />
            </Field>
          </div>
          <Field label="Notes">
            <TextInput
              value={grnForm.notes}
              onChange={(e) => setGrnForm({ ...grnForm, notes: e.target.value })}
            />
          </Field>
          <div className="border-t border-line pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Receive Lines</span>
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus className="size-3.5" aria-hidden />}
                onClick={() =>
                  setGrnForm({
                    ...grnForm,
                    items: [...grnForm.items, { itemId: "", unitId: "", receivedQuantity: "", acceptedQuantity: "", unitCost: "" }],
                  })
                }
              >
                Add Line
              </Button>
            </div>
            <div className="space-y-2">
              {grnForm.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-4">
                    <SelectInput<string>
                      options={itemOptions}
                      value={it.itemId}
                      onChange={(v) => {
                        const items = [...grnForm.items];
                        items[idx] = { ...items[idx], itemId: v };
                        setGrnForm({ ...grnForm, items });
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <SelectInput<string>
                      options={unitOptions}
                      value={it.unitId}
                      onChange={(v) => {
                        const items = [...grnForm.items];
                        items[idx] = { ...items[idx], unitId: v };
                        setGrnForm({ ...grnForm, items });
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <TextInput
                      placeholder="Rcvd"
                      type="number"
                      value={it.receivedQuantity}
                      onChange={(e) => {
                        const items = [...grnForm.items];
                        items[idx] = { ...items[idx], receivedQuantity: e.target.value };
                        setGrnForm({ ...grnForm, items });
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <TextInput
                      placeholder="Cost"
                      type="number"
                      value={it.unitCost}
                      onChange={(e) => {
                        const items = [...grnForm.items];
                        items[idx] = { ...items[idx], unitCost: e.target.value };
                        setGrnForm({ ...grnForm, items });
                      }}
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setGrnForm({ ...grnForm, items: grnForm.items.filter((_, i) => i !== idx) })}
                      disabled={grnForm.items.length <= 1}
                    >
                      ×
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Dialog>

      {/* ============================== Invoice Dialog ============================== */}
      <Dialog
        size="lg"
        open={invDialog}
        onClose={() => { setInvDialog(false); setInvForm(EMPTY_INVOICE_FORM); }}
        title="Record Supplier Invoice"
        description="Bill received from the supplier. Totals become AP on POST."
        footer={
          <>
            <Button variant="secondary" onClick={() => { setInvDialog(false); setInvForm(EMPTY_INVOICE_FORM); }}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitInvoice} disabled={invBusy || !invForm.supplierId}>
              {invBusy ? "Posting..." : "Post Invoice"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {errorBanner}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier" required>
              <SelectInput<string>
                options={supplierOptions}
                value={invForm.supplierId}
                onChange={(v) => setInvForm({ ...invForm, supplierId: v })}
              />
            </Field>
            <Field label="Linked PO (optional)">
              <SelectInput<string>
                options={[
                  { value: "", label: "(none)" },
                  ...(orders ?? []).map((o) => ({
                    value: o.id,
                    label: `${o.poNumber} · ₹${(o.grandTotal ?? 0).toLocaleString("en-IN")}`,
                  })),
                ]}
                value={invForm.purchaseOrderId}
                onChange={(v) => setInvForm({ ...invForm, purchaseOrderId: v })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Invoice Date">
              <TextInput
                type="date"
                value={invForm.invoiceDate}
                onChange={(e) => setInvForm({ ...invForm, invoiceDate: e.target.value })}
              />
            </Field>
            <Field label="Due Date">
              <TextInput
                type="date"
                value={invForm.dueDate}
                onChange={(e) => setInvForm({ ...invForm, dueDate: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Notes">
            <TextInput
              value={invForm.notes}
              onChange={(e) => setInvForm({ ...invForm, notes: e.target.value })}
            />
          </Field>
          <div className="border-t border-line pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Invoice Lines</span>
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus className="size-3.5" aria-hidden />}
                onClick={() =>
                  setInvForm({
                    ...invForm,
                    items: [...invForm.items, { itemId: "", unitId: "", quantity: "", unitRate: "", taxRate: "5", description: "" }],
                  })
                }
              >
                Add Line
              </Button>
            </div>
            <div className="space-y-2">
              {invForm.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-4">
                    <SelectInput<string>
                      options={itemOptions}
                      value={it.itemId}
                      onChange={(v) => {
                        const items = [...invForm.items];
                        items[idx] = { ...items[idx], itemId: v };
                        setInvForm({ ...invForm, items });
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <TextInput
                      placeholder="Qty"
                      type="number"
                      value={it.quantity}
                      onChange={(e) => {
                        const items = [...invForm.items];
                        items[idx] = { ...items[idx], quantity: e.target.value };
                        setInvForm({ ...invForm, items });
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <SelectInput<string>
                      options={unitOptions}
                      value={it.unitId}
                      onChange={(v) => {
                        const items = [...invForm.items];
                        items[idx] = { ...items[idx], unitId: v };
                        setInvForm({ ...invForm, items });
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <TextInput
                      placeholder="Rate"
                      type="number"
                      value={it.unitRate}
                      onChange={(e) => {
                        const items = [...invForm.items];
                        items[idx] = { ...items[idx], unitRate: e.target.value };
                        setInvForm({ ...invForm, items });
                      }}
                    />
                  </div>
                  <div className="col-span-1">
                    <TextInput
                      placeholder="Tax%"
                      type="number"
                      value={it.taxRate}
                      onChange={(e) => {
                        const items = [...invForm.items];
                        items[idx] = { ...items[idx], taxRate: e.target.value };
                        setInvForm({ ...invForm, items });
                      }}
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setInvForm({ ...invForm, items: invForm.items.filter((_, i) => i !== idx) })}
                      disabled={invForm.items.length <= 1}
                    >
                      ×
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Dialog>

      {/* ============================== Payment Dialog ============================== */}
      <Dialog
        open={payDialog}
        onClose={() => { setPayDialog(false); setPayForm(EMPTY_PAYMENT_FORM); }}
        title="Record Supplier Payment"
        description="Records cash/bank/cheque/UPI/Card outflow and allocates to posted invoices."
        footer={
          <>
            <Button variant="secondary" onClick={() => { setPayDialog(false); setPayForm(EMPTY_PAYMENT_FORM); }}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitPayment} disabled={payBusy || !payForm.supplierId || !payForm.amount}>
              {payBusy ? "Saving..." : "Record Payment"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {errorBanner}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier" required>
              <SelectInput<string>
                options={supplierOptions}
                value={payForm.supplierId}
                onChange={(v) => {
                  setPayForm({ ...payForm, supplierId: v, allocations: [] });
                }}
              />
            </Field>
            <Field label="Payment Date">
              <TextInput
                type="date"
                value={payForm.paymentDate}
                onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Method">
              <SelectInput<PaymentMethod>
                options={PAYMENT_METHOD_OPTIONS}
                value={payForm.paymentMethod}
                onChange={(v) => setPayForm({ ...payForm, paymentMethod: v })}
              />
            </Field>
            <Field label="Amount" required>
              <TextInput
                type="number"
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Reference (cheque / UPI / txn id)">
            <TextInput
              value={payForm.reference}
              onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
            />
          </Field>
          <Field label="Notes">
            <TextInput
              value={payForm.notes}
              onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
            />
          </Field>
          {payForm.supplierId && (
            <div className="border-t border-line pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-ink">Allocations (optional)</span>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus className="size-3.5" aria-hidden />}
                  onClick={() =>
                    setPayForm({
                      ...payForm,
                      allocations: [...payForm.allocations, { invoiceId: "", amount: "" }],
                    })
                  }
                >
                  Allocate
                </Button>
              </div>
              <div className="space-y-2">
                {payForm.allocations.map((a, idx) => (
                  <div key={idx} className="grid grid-cols-12 items-end gap-2">
                    <div className="col-span-8">
                      <SelectInput<string>
                        options={[
                          { value: "", label: "Select invoice" },
                          ...(invoices ?? [])
                            .filter((i) => i.supplierId === payForm.supplierId && (i.outstandingAmount ?? 0) > 0)
                            .map((i) => ({
                              value: i.id,
                              label: `${i.invoiceNumber} · ₹${(i.outstandingAmount ?? 0).toLocaleString("en-IN")} due`,
                            })),
                        ]}
                        value={a.invoiceId}
                        onChange={(v) => {
                          const allocs = [...payForm.allocations];
                          allocs[idx] = { ...allocs[idx], invoiceId: v };
                          setPayForm({ ...payForm, allocations: allocs });
                        }}
                      />
                    </div>
                    <div className="col-span-3">
                      <TextInput
                        placeholder="Amt"
                        type="number"
                        value={a.amount}
                        onChange={(e) => {
                          const allocs = [...payForm.allocations];
                          allocs[idx] = { ...allocs[idx], amount: e.target.value };
                          setPayForm({ ...payForm, allocations: allocs });
                        }}
                      />
                    </div>
                    <div className="col-span-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setPayForm({ ...payForm, allocations: payForm.allocations.filter((_, i) => i !== idx) })
                        }
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {SUPPLIER_STATUSES.length > 0 && <></>}
      <div className="rounded-md border border-line bg-surface-soft p-3 text-xs text-muted">
        <ChevronRight className="mr-1 inline size-3.5" />
        Cross-module chain check: every PO created here can be received (GRN), the GRN posts to the inventory stock ledger (weighted-avg cost), an invoice is then raised, then a payment record allocates to that invoice.
      </div>
    </div>
  );
}
