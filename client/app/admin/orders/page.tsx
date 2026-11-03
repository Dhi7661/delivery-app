"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatPaise } from "@/lib/money";

interface OrderItemSummary {
  id: string;
  product_id: string;
  product_name: string;
  unit_size: string;
  brand: string;
  shop_name: string;
  qty: number;
  mrp_paise: number;
  shop_price_paise: number;
  selling_price_paise: number;
  line_total_paise: number;
  is_available: boolean;
  unavailable_noted_at: string | null;
}

interface OrderSummary {
  id: string;
  order_no: string;
  status: string;
  payment_method: string;
  payment_status: string;
  subtotal_paise: number;
  delivery_fee_paise: number;
  total_paise: number;
  customer_name: string;
  customer_phone: string;
  address: any;
  confirmed_with_customer_at: string | null;
  customer_confirmation_method: string | null;
  customer_accepted_changes_at: string | null;
  shop_packing_note: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItemSummary[];
  next_action: string;
}

interface ColumnData {
  PLACED: OrderSummary[];
  CONFIRMED: OrderSummary[];
  SENT_TO_SHOP: OrderSummary[];
  PACKED: OrderSummary[];
  OUT_FOR_DELIVERY: OrderSummary[];
  DELIVERED: OrderSummary[];
  ISSUES: OrderSummary[];
}

interface OrderCounts {
  PLACED: number;
  CONFIRMED: number;
  SENT_TO_SHOP: number;
  PACKED: number;
  OUT_FOR_DELIVERY: number;
  DELIVERED: number;
  ISSUES: number;
  TOTAL: number;
}

const COLUMN_KEYS: Array<keyof ColumnData> = [
  "PLACED",
  "CONFIRMED",
  "SENT_TO_SHOP",
  "PACKED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "ISSUES",
];

const COLUMN_LABELS: Record<keyof ColumnData, { label: string; color: string }> = {
  PLACED: { label: "New Orders", color: "bg-amber-100 text-amber-900 border-amber-300" },
  CONFIRMED: { label: "Confirmed", color: "bg-blue-100 text-blue-900 border-blue-300" },
  SENT_TO_SHOP: { label: "At Shop", color: "bg-purple-100 text-purple-900 border-purple-300" },
  PACKED: { label: "Packed", color: "bg-indigo-100 text-indigo-900 border-indigo-300" },
  OUT_FOR_DELIVERY: { label: "Out for Delivery", color: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  DELIVERED: { label: "Delivered", color: "bg-teal-100 text-teal-900 border-teal-300" },
  ISSUES: { label: "Issues / Cancelled", color: "bg-rose-100 text-rose-900 border-rose-300" },
};

function OrdersBoardContent() {
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter") || "all";

  const [columns, setColumns] = useState<ColumnData>({
    PLACED: [],
    CONFIRMED: [],
    SENT_TO_SHOP: [],
    PACKED: [],
    OUT_FOR_DELIVERY: [],
    DELIVERED: [],
    ISSUES: [],
  });
  const [counts, setCounts] = useState<OrderCounts>({
    PLACED: 0,
    CONFIRMED: 0,
    SENT_TO_SHOP: 0,
    PACKED: 0,
    OUT_FOR_DELIVERY: 0,
    DELIVERED: 0,
    ISSUES: 0,
    TOTAL: 0,
  });

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");

  // Action Loading & Modal States
  const [actionLoadingOrderNo, setActionLoadingOrderNo] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderSummary | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<OrderSummary | null>(null);
  const [confirmMethod, setConfirmMethod] = useState<"PHONE" | "WHATSAPP">("PHONE");
  const [showCancelModal, setShowCancelModal] = useState<OrderSummary | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  // Load orders
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);

      const res = await fetch(`http://localhost:4000/api/admin/orders?${params.toString()}`, {
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to load orders");
      const data = await res.json();
      setColumns(data.columns);
      setCounts(data.counts);
    } catch (err: any) {
      console.error("Error fetching orders:", err);
      setActionError(err.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Order Action Handlers
  const handleConfirmCustomer = async (order: OrderSummary) => {
    setActionLoadingOrderNo(order.order_no);
    setActionError(null);
    try {
      const res = await fetch(`http://localhost:4000/api/admin/orders/${order.order_no}/confirm-customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ method: confirmMethod }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Confirmation failed");
      setShowConfirmModal(null);
      await fetchOrders();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoadingOrderNo(null);
    }
  };

  const handleSendToShop = async (order: OrderSummary) => {
    setActionLoadingOrderNo(order.order_no);
    setActionError(null);
    try {
      const res = await fetch(`http://localhost:4000/api/admin/orders/${order.order_no}/send-to-shop`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send to shop");
      await fetchOrders();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoadingOrderNo(null);
    }
  };

  const handleMarkPacked = async (order: OrderSummary) => {
    setActionLoadingOrderNo(order.order_no);
    setActionError(null);
    try {
      const res = await fetch(`http://localhost:4000/api/admin/orders/${order.order_no}/mark-packed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ shop_packing_note: "Verified packed via shop confirmation" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark packed");
      await fetchOrders();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoadingOrderNo(null);
    }
  };

  const handleOutForDelivery = async (order: OrderSummary) => {
    setActionLoadingOrderNo(order.order_no);
    setActionError(null);
    try {
      const res = await fetch(`http://localhost:4000/api/admin/orders/${order.order_no}/out-for-delivery`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to dispatch order");
      await fetchOrders();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoadingOrderNo(null);
    }
  };

  const handleMarkDelivered = async (order: OrderSummary) => {
    setActionLoadingOrderNo(order.order_no);
    setActionError(null);
    try {
      const res = await fetch(`http://localhost:4000/api/admin/orders/${order.order_no}/mark-delivered`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cash_collected_paise: order.total_paise }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark delivered");
      await fetchOrders();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoadingOrderNo(null);
    }
  };

  const handleCancelOrder = async () => {
    if (!showCancelModal || !cancelReason.trim()) return;
    setActionLoadingOrderNo(showCancelModal.order_no);
    setActionError(null);
    try {
      const res = await fetch(`http://localhost:4000/api/admin/orders/${showCancelModal.order_no}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel order");
      setShowCancelModal(null);
      setCancelReason("");
      await fetchOrders();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoadingOrderNo(null);
    }
  };

  const handleMarkItemUnavailable = async (order: OrderSummary, itemId: string) => {
    setActionLoadingOrderNo(order.order_no);
    setActionError(null);
    try {
      const res = await fetch(`http://localhost:4000/api/admin/orders/${order.order_no}/item-unavailable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderItemId: itemId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark item unavailable");
      setSelectedOrder(data.order);
      await fetchOrders();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoadingOrderNo(null);
    }
  };

  // Helper to render next allowed action button per Section 3
  const renderActionButton = (order: OrderSummary) => {
    const isBusy = actionLoadingOrderNo === order.order_no;

    if (order.status === "PLACED") {
      if (order.payment_method === "COD" && !order.confirmed_with_customer_at) {
        return (
          <button
            onClick={() => setShowConfirmModal(order)}
            disabled={isBusy}
            className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors min-h-[44px] flex items-center justify-center gap-1.5 shadow-xs"
          >
            Confirm COD with Customer
          </button>
        );
      }
      return (
        <button
          onClick={() => handleSendToShop(order)}
          disabled={isBusy}
          className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors min-h-[44px] flex items-center justify-center gap-1.5 shadow-xs"
        >
          {isBusy ? "Sending..." : "Send to Shop (WhatsApp)"}
        </button>
      );
    }

    if (order.status === "CONFIRMED") {
      return (
        <button
          onClick={() => handleSendToShop(order)}
          disabled={isBusy}
          className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors min-h-[44px] flex items-center justify-center gap-1.5 shadow-xs"
        >
          {isBusy ? "Sending..." : "Send to Shop (WhatsApp)"}
        </button>
      );
    }

    if (order.status === "SENT_TO_SHOP") {
      return (
        <button
          onClick={() => handleMarkPacked(order)}
          disabled={isBusy}
          className="w-full py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-colors min-h-[44px] flex items-center justify-center gap-1.5 shadow-xs"
        >
          {isBusy ? "Updating..." : "Mark Packed (Shop Reply)"}
        </button>
      );
    }

    if (order.status === "PACKED") {
      return (
        <button
          onClick={() => handleOutForDelivery(order)}
          disabled={isBusy}
          className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors min-h-[44px] flex items-center justify-center gap-1.5 shadow-xs"
        >
          {isBusy ? "Dispatching..." : "Assign & Out for Delivery"}
        </button>
      );
    }

    if (order.status === "OUT_FOR_DELIVERY") {
      return (
        <button
          onClick={() => handleMarkDelivered(order)}
          disabled={isBusy}
          className="w-full py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors min-h-[44px] flex items-center justify-center gap-1.5 shadow-xs"
        >
          {isBusy ? "Saving..." : "Mark Delivered (Collect Cash)"}
        </button>
      );
    }

    return null;
  };

  const renderOrderCard = (order: OrderSummary) => {
    const isCodUnconfirmed = order.payment_method === "COD" && !order.confirmed_with_customer_at;
    const addressLine = typeof order.address === "object" ? order.address?.line1 || "" : String(order.address);

    return (
      <div
        key={order.id}
        className={`w-full max-w-full p-3.5 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-3 transition-all hover:border-gray-300 ${
          isCodUnconfirmed ? "ring-2 ring-amber-400/50" : ""
        }`}
      >
        {/* Header: Order Number & Time */}
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
          <button
            onClick={() => setSelectedOrder(order)}
            className="text-xs font-black text-gray-900 hover:text-emerald-700 underline truncate max-w-[170px] text-left whitespace-nowrap"
            title={`Order #${order.order_no} - click to view details`}
          >
            #{order.order_no}
          </button>
          <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap shrink-0">
            {new Date(order.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        {/* Customer Information */}
        <div className="space-y-1">
          <p className="text-xs font-bold text-gray-800 truncate" title={order.customer_name}>
            {order.customer_name}
          </p>
          <div>
            <a
              href={`tel:${order.customer_phone}`}
              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 min-h-[28px]"
              title={`Call ${order.customer_phone}`}
            >
              📞 {order.customer_phone}
            </a>
          </div>
          <p className="text-[11px] text-gray-500 line-clamp-1">{addressLine}</p>
        </div>

        {/* Warning Flags */}
        {isCodUnconfirmed && (
          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800 flex items-center gap-1.5">
            ⚠️ COD Unconfirmed &bull; Call customer before sending to shop
          </div>
        )}

        {order.shop_packing_note && (
          <p className="text-[11px] text-purple-700 bg-purple-50 p-2 rounded-lg border border-purple-200 line-clamp-2">
            💬 Shop: {order.shop_packing_note}
          </p>
        )}

        {/* Items Summary */}
        <div className="space-y-1 bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-[11px]">
          <div className="flex justify-between text-gray-500 font-semibold">
            <span>{order.items.length} item{order.items.length === 1 ? "" : "s"}</span>
            <span className="text-gray-900 font-black">{formatPaise(order.total_paise)}</span>
          </div>
          <div className="text-gray-600 line-clamp-2">
            {order.items.map((i) => `${i.qty}x ${i.product_name}`).join(", ")}
          </div>
        </div>

        {/* Payment Badge & Method */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="px-2 py-0.5 rounded-md font-bold bg-gray-100 text-gray-700">
            {order.payment_method}
          </span>
          <span
            className={`font-bold ${
              order.payment_status === "PAID" ? "text-emerald-700" : "text-amber-700"
            }`}
          >
            {order.payment_status}
          </span>
        </div>

        {/* Next Allowed Action */}
        <div className="space-y-2 pt-1 border-t border-gray-100">
          {renderActionButton(order)}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedOrder(order)}
              className="flex-1 min-w-[120px] py-1.5 px-2 rounded-lg border border-gray-200 text-[11px] font-bold text-gray-600 hover:bg-gray-50 min-h-[36px]"
            >
              Items / Availability
            </button>
            {!["DELIVERED", "CANCELLED"].includes(order.status) && (
              <button
                onClick={() => setShowCancelModal(order)}
                className="py-1.5 px-2.5 rounded-lg border border-rose-200 text-[11px] font-bold text-rose-700 hover:bg-rose-50 min-h-[36px]"
                title="Cancel order"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full max-w-full space-y-6">
      {/* Header & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-heading tracking-tight">
              Orders Board
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              {counts.TOTAL} orders
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Real-time fulfillment workflow from placement to door delivery
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchOrders()}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 shadow-xs transition-colors min-h-[44px] flex items-center gap-1.5"
          >
            <svg
              className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="p-1 font-bold">✕</button>
        </div>
      )}

      {/* Search Toolbar */}
      <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by order #, customer name, or phone..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
          />
          <svg className="w-5 h-5 text-gray-400 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Mobile Tab Filter (< 1024px) */}
        <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap min-h-[38px] ${
              activeTab === "all" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            All ({counts.TOTAL})
          </button>
          {COLUMN_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => setActiveTab(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap min-h-[38px] ${
                activeTab === k ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {COLUMN_LABELS[k].label} ({counts[k]})
            </button>
          ))}
        </div>
      </div>

      {/* Kanban Board Container */}
      {/* Desktop Multi-column Kanban View (>= 1024px) */}
      <div className="hidden lg:flex flex-row gap-4 items-start overflow-x-auto pb-4 admin-board-scroll">
        {COLUMN_KEYS.map((colKey) => {
          const colInfo = COLUMN_LABELS[colKey];
          const orders = columns[colKey] || [];

          return (
            <div
              key={colKey}
              className="w-[300px] min-w-[280px] shrink-0 flex flex-col max-h-[calc(100vh-220px)] bg-surface/60 rounded-2xl p-3 border border-border"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-2 border-b border-border shrink-0">
                <span className="text-xs font-bold text-gray-800">{colInfo.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-black border ${colInfo.color}`}>
                  {orders.length}
                </span>
              </div>

              {/* Cards List */}
              <div className="flex-1 overflow-y-auto space-y-3 pt-3 pr-1 admin-board-scroll">
                {orders.length === 0 ? (
                  <p className="text-center py-6 text-xs text-muted italic">No orders</p>
                ) : (
                  orders.map(renderOrderCard)
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile Active Tab View (< 1024px) */}
      <div className="lg:hidden space-y-4">
        {activeTab === "all" ? (
          COLUMN_KEYS.map((colKey) => {
            const orders = columns[colKey] || [];
            if (orders.length === 0) return null;
            return (
              <div key={colKey} className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-bold text-gray-900">{COLUMN_LABELS[colKey].label}</h2>
                  <span className="text-xs font-bold text-gray-500">{orders.length}</span>
                </div>
                {orders.map(renderOrderCard)}
              </div>
            );
          })
        ) : (
          <div className="space-y-3">
            {(columns[activeTab as keyof ColumnData] || []).length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-200 text-xs text-gray-400">
                No orders in this column
              </div>
            ) : (
              (columns[activeTab as keyof ColumnData] || []).map(renderOrderCard)
            )}
          </div>
        )}
      </div>

      {/* Modal: Confirm COD with Customer (Section 4) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-gray-200 space-y-4">
            <h3 className="text-base font-bold text-gray-900">
              Confirm COD with Customer &bull; #{showConfirmModal.order_no}
            </h3>
            <p className="text-xs text-gray-600">
              Per Section 4, COD orders must be confirmed before sending to shop to verify availability and prevent refusal at the door.
            </p>

            <div className="p-3 bg-gray-50 rounded-xl space-y-1 text-xs">
              <p><strong>Customer:</strong> {showConfirmModal.customer_name} ({showConfirmModal.customer_phone})</p>
              <p><strong>Amount:</strong> {formatPaise(showConfirmModal.total_paise)}</p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-700 uppercase">Confirmation Method</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmMethod("PHONE")}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold min-h-[44px] ${
                    confirmMethod === "PHONE"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                      : "border-gray-200 text-gray-700"
                  }`}
                >
                  📞 Phone Call
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmMethod("WHATSAPP")}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold min-h-[44px] ${
                    confirmMethod === "WHATSAPP"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                      : "border-gray-200 text-gray-700"
                  }`}
                >
                  💬 WhatsApp
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setShowConfirmModal(null)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmCustomer(showConfirmModal)}
                disabled={actionLoadingOrderNo === showConfirmModal.order_no}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white min-h-[44px]"
              >
                {actionLoadingOrderNo === showConfirmModal.order_no ? "Confirming..." : "Record Confirmation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Cancel Order with Reason (F18) */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-gray-200 space-y-4">
            <h3 className="text-base font-bold text-rose-800">
              Cancel Order #{showCancelModal.order_no}
            </h3>
            <p className="text-xs text-gray-600">
              Admin cancellation requires a non-empty reason. Any online payment will be refunded and a GST credit note issued.
            </p>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase">Cancellation Reason *</label>
              <textarea
                rows={3}
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Customer requested cancellation, shop out of stock..."
                className="w-full p-3 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => {
                  setShowCancelModal(null);
                  setCancelReason("");
                }}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 min-h-[44px]"
              >
                Close
              </button>
              <button
                onClick={handleCancelOrder}
                disabled={!cancelReason.trim() || actionLoadingOrderNo === showCancelModal.order_no}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white min-h-[44px] disabled:opacity-50"
              >
                {actionLoadingOrderNo === showCancelModal.order_no ? "Cancelling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Order Details & Item Partial Availability (Section 5) */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-xl border border-gray-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Order Details &bull; #{selectedOrder.order_no}
                </h3>
                <span className="text-xs text-gray-500">Status: {selectedOrder.status}</span>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Customer & Address */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-xl text-xs">
              <div>
                <span className="text-gray-400 font-bold block">CUSTOMER</span>
                <p className="font-bold text-gray-800">{selectedOrder.customer_name}</p>
                <p className="text-emerald-700 font-semibold">{selectedOrder.customer_phone}</p>
              </div>
              <div>
                <span className="text-gray-400 font-bold block">PAYMENT</span>
                <p className="font-bold text-gray-800">{selectedOrder.payment_method} &bull; {selectedOrder.payment_status}</p>
                <p className="text-gray-600 font-black">{formatPaise(selectedOrder.total_paise)}</p>
              </div>
            </div>

            {/* Items List with Partial Availability Toggles (Section 5) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-800 uppercase">Items Breakdown</span>
                <span className="text-[11px] text-gray-500">
                  Mark missing items to recalculate total
                </span>
              </div>

              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="p-3 flex items-center justify-between gap-3 text-xs bg-white">
                    <div className="min-w-0 flex-1">
                      <p className={`font-bold ${!item.is_available ? "line-through text-gray-400" : "text-gray-900"}`}>
                        {item.qty}x {item.product_name}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {item.unit_size} &bull; {item.shop_name} &bull; {formatPaise(item.selling_price_paise)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-black text-gray-900 whitespace-nowrap">
                        {formatPaise(item.line_total_paise)}
                      </span>
                      {item.is_available ? (
                        <button
                          onClick={() => handleMarkItemUnavailable(selectedOrder, item.id)}
                          className="px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 font-bold text-[11px] hover:bg-amber-100 min-h-[36px]"
                          title="Mark shop out of stock for this item"
                        >
                          Mark Unavailable
                        </button>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500">
                          Unavailable
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold min-h-[44px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm font-semibold text-gray-500">
          Loading Orders Board...
        </div>
      }
    >
      <OrdersBoardContent />
    </Suspense>
  );
}

