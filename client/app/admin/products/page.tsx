"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatPaise } from "@/lib/money";

interface CategoryOption {
  id: string;
  name: string;
}

interface ShopOption {
  id: string;
  name: string;
}

interface ProductItem {
  id: string;
  name: string;
  brand: string | null;
  unit_size: string;
  hsn_code: string | null;
  gst_rate: number;
  mrp_paise: number;
  shop_price_paise: number;
  selling_price_paise: number;
  margin_paise: number;
  margin_pct: number;
  is_low_margin: boolean;
  is_available: boolean;
  is_active: boolean;
  category: { id: string; name: string };
  shop: { id: string; name: string };
  updated_at: string;
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedShop, setSelectedShop] = useState("");
  const [selectedStock, setSelectedStock] = useState("");
  const [selectedActive, setSelectedActive] = useState("");
  const [selectedWarning, setSelectedWarning] = useState("");

  // Selection & Bulk Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Inline Editing of Selling Price
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editPriceRupees, setEditPriceRupees] = useState<string>("");
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  // CSV Import / Export State
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvFileContent, setCsvFileContent] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importErrors, setImportErrors] = useState<Array<{ row: number; error: string }>>([]);
  const [importPreview, setImportPreview] = useState<{ count: number; preview: any[] } | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (selectedCategory) params.set("categoryId", selectedCategory);
      if (selectedShop) params.set("shopId", selectedShop);
      if (selectedStock) params.set("stock", selectedStock);
      if (selectedActive) params.set("active", selectedActive);
      if (selectedWarning) params.set("warning", selectedWarning);

      const res = await fetch(`http://localhost:4000/api/admin/products?${params.toString()}`, {
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to load products");
      const data = await res.json();
      setProducts(data.products || []);
      setCategories(data.categories || []);
      setShops(data.shops || []);
      setTotal(data.pagination?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory, selectedShop, selectedStock, selectedActive, selectedWarning]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Toggle single item stock
  const handleToggleStock = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:4000/api/admin/products/${id}/toggle-stock`, {
        method: "PATCH",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setProducts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, is_available: data.product.is_available } : p))
        );
      }
    } catch (err) {
      console.error("Failed to toggle stock", err);
    }
  };

  // Toggle single item active status
  const handleToggleActive = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:4000/api/admin/products/${id}/toggle-active`, {
        method: "PATCH",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setProducts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, is_active: data.product.is_active } : p))
        );
      }
    } catch (err) {
      console.error("Failed to toggle active", err);
    }
  };

  // In-place price edit save
  const handleSavePrice = async (p: ProductItem) => {
    const rupees = parseFloat(editPriceRupees);
    if (isNaN(rupees) || rupees <= 0) {
      setPriceError("Enter a valid price in ₹");
      return;
    }
    const paise = Math.round(rupees * 100);

    if (paise > p.mrp_paise) {
      setPriceError(`Price cannot exceed MRP (${formatPaise(p.mrp_paise)})`);
      return;
    }
    if (paise < p.shop_price_paise) {
      setPriceError(`Price cannot be below buy price (${formatPaise(p.shop_price_paise)})`);
      return;
    }

    setPriceSaving(true);
    setPriceError(null);
    try {
      const res = await fetch(`http://localhost:4000/api/admin/products/${p.id}/price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selling_price_paise: paise }),
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update price");

      setProducts((prev) =>
        prev.map((item) => (item.id === p.id ? { ...item, ...data.product } : item))
      );
      setEditingPriceId(null);
    } catch (err: any) {
      setPriceError(err.message);
    } finally {
      setPriceSaving(false);
    }
  };

  // Bulk actions
  const handleBulkAction = async (action: "set_in_stock" | "set_out_of_stock" | "show" | "hide") => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch("http://localhost:4000/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: Array.from(selectedIds),
          action,
        }),
        credentials: "include",
      });

      if (res.ok) {
        await fetchProducts();
        setSelectedIds(new Set());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(products.map((p) => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleExportCsv = async () => {
    try {
      const res = await fetch("http://localhost:4000/api/admin/products/export/csv", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to export catalog CSV");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plukit-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert("Failed to export CSV: " + err.message);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportErrors([]);
    setImportPreview(null);
    setImportSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvFileContent(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleDryRun = async () => {
    if (!csvFileContent) return;
    setImportLoading(true);
    setImportErrors([]);
    setImportPreview(null);
    try {
      const res = await fetch("http://localhost:4000/api/admin/products/import/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ csvText: csvFileContent, dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportErrors(data.errors || [{ row: 1, error: data.error || "Dry run validation failed" }]);
      } else {
        setImportPreview({ count: data.count, preview: data.preview });
      }
    } catch (err: any) {
      setImportErrors([{ row: 1, error: err.message || "Failed to run dry run" }]);
    } finally {
      setImportLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!csvFileContent) return;
    setImportLoading(true);
    setImportErrors([]);
    try {
      const res = await fetch("http://localhost:4000/api/admin/products/import/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ csvText: csvFileContent, dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportErrors(data.errors || [{ row: 1, error: data.error || "Import failed" }]);
      } else {
        setImportSuccess(
          `Successfully processed ${data.total} products (${data.createdCount} new created, ${data.updatedCount} updated)!`
        );
        fetchProducts();
        setTimeout(() => {
          setShowImportModal(false);
          setImportSuccess(null);
          setCsvFileContent(null);
          setCsvFileName(null);
          setImportPreview(null);
        }, 2000);
      }
    } catch (err: any) {
      setImportErrors([{ row: 1, error: err.message || "Failed to commit import" }]);
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-heading tracking-tight">
              Products
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              {total} items
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Manage catalog pricing, availability &amp; visibility
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 shadow-xs transition-colors min-h-[44px] flex items-center gap-1.5"
            title="Download full catalog as CSV"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>

          <button
            onClick={() => {
              setShowImportModal(true);
              setImportErrors([]);
              setImportPreview(null);
              setImportSuccess(null);
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 shadow-xs transition-colors min-h-[44px] flex items-center gap-1.5"
            title="Bulk import or price update via CSV"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import CSV
          </button>

          <Link
            href="/admin/products/new"
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-colors min-h-[44px] flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Product
          </Link>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-3">
        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products by name, brand, or SKU..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[44px]"
          />
          <svg className="w-5 h-5 text-gray-400 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Dropdowns Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Shop Filter */}
          <select
            value={selectedShop}
            onChange={(e) => setSelectedShop(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
          >
            <option value="">All Shops</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Stock Filter */}
          <select
            value={selectedStock}
            onChange={(e) => setSelectedStock(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
          >
            <option value="">All Stock</option>
            <option value="in_stock">In Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>

          {/* Active / Visibility Filter */}
          <select
            value={selectedActive}
            onChange={(e) => setSelectedActive(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
          >
            <option value="">All Visibility</option>
            <option value="true">Active (Shown)</option>
            <option value="false">Inactive (Hidden)</option>
          </select>

          {/* Warnings Filter */}
          <select
            value={selectedWarning}
            onChange={(e) => setSelectedWarning(e.target.value)}
            className="col-span-2 sm:col-span-1 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
          >
            <option value="">All Alerts</option>
            <option value="low_margin">Low Margin (&lt;10%)</option>
          </select>
        </div>
      </div>

      {/* Bulk Action Bar (Appears when items are selected) */}
      {selectedIds.size > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
              {selectedIds.size}
            </span>
            <span className="text-xs sm:text-sm font-bold text-emerald-900">
              items selected
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleBulkAction("set_in_stock")}
              disabled={bulkLoading}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-100 min-h-[38px]"
            >
              Set In Stock
            </button>
            <button
              onClick={() => handleBulkAction("set_out_of_stock")}
              disabled={bulkLoading}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-amber-700 border border-amber-300 hover:bg-amber-100 min-h-[38px]"
            >
              Set Out of Stock
            </button>
            <button
              onClick={() => handleBulkAction("show")}
              disabled={bulkLoading}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-gray-700 border border-gray-300 hover:bg-gray-100 min-h-[38px]"
            >
              Show (Active)
            </button>
            <button
              onClick={() => handleBulkAction("hide")}
              disabled={bulkLoading}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-rose-700 border border-rose-300 hover:bg-rose-100 min-h-[38px]"
            >
              Hide (Inactive)
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-gray-500 hover:text-gray-800 ml-2"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Product Content: Desktop Table & Mobile Cards */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-semibold text-gray-500">Loading catalog items...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h3 className="font-bold text-gray-900 text-sm">No products found</h3>
          <p className="text-xs text-gray-500 mt-1">Try clearing your search query or filters.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table (>= 1024px) */}
          <div className="hidden lg:block bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === products.length && products.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </th>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Shop</th>
                    <th className="py-3 px-3 text-right">MRP</th>
                    <th className="py-3 px-3 text-right">Buy Price</th>
                    <th className="py-3 px-3 text-right">Selling Price</th>
                    <th className="py-3 px-3 text-right">Margin</th>
                    <th className="py-3 px-3 text-center">Stock</th>
                    <th className="py-3 px-3 text-center">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {products.map((p) => {
                    const isSelected = selectedIds.has(p.id);
                    const isEditingPrice = editingPriceId === p.id;

                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-gray-50/60 transition-colors ${
                          isSelected ? "bg-emerald-50/40" : ""
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectOne(p.id)}
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          />
                        </td>

                        {/* Product Name, Brand, Unit */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 font-bold flex items-center justify-center shrink-0 text-xs">
                              {p.name[0]}
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/admin/products/${p.id}`}
                                className="font-bold text-gray-900 hover:text-emerald-700 truncate block hover:underline"
                              >
                                {p.name}
                              </Link>
                              <p className="text-[11px] text-gray-500 truncate">
                                {p.brand ? `${p.brand} • ` : ""}
                                {p.unit_size}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="py-3 px-3">
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-700">
                            {p.category.name}
                          </span>
                        </td>

                        {/* Shop */}
                        <td className="py-3 px-3 text-gray-600 truncate max-w-[120px]">
                          {p.shop.name}
                        </td>

                        {/* MRP */}
                        <td className="py-3 px-3 text-right font-medium text-gray-500">
                          {formatPaise(p.mrp_paise)}
                        </td>

                        {/* Buy Price (Admin only) */}
                        <td className="py-3 px-3 text-right font-medium text-gray-600">
                          <span className="inline-flex items-center gap-1 text-gray-500" title="Shop buy price (admin-only)">
                            <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            {formatPaise(p.shop_price_paise)}
                          </span>
                        </td>

                        {/* Selling Price (with inline edit) */}
                        <td className="py-3 px-3 text-right">
                          {isEditingPrice ? (
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-gray-400">₹</span>
                              <input
                                type="number"
                                step="0.5"
                                value={editPriceRupees}
                                onChange={(e) => setEditPriceRupees(e.target.value)}
                                className="w-16 px-1.5 py-1 text-right text-xs font-bold border border-emerald-500 rounded focus:outline-none"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSavePrice(p)}
                                disabled={priceSaving}
                                className="px-1.5 py-1 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700"
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => {
                                  setEditingPriceId(null);
                                  setPriceError(null);
                                }}
                                className="px-1 py-1 text-gray-400 hover:text-gray-600"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingPriceId(p.id);
                                setEditPriceRupees((p.selling_price_paise / 100).toString());
                                setPriceError(null);
                              }}
                              className="font-bold text-gray-900 hover:text-emerald-700 hover:underline inline-flex items-center gap-1 group"
                              title="Click to edit selling price"
                            >
                              <span>{formatPaise(p.selling_price_paise)}</span>
                              <svg className="w-3 h-3 text-gray-300 group-hover:text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          )}
                          {isEditingPrice && priceError && (
                            <p className="text-[10px] text-rose-600 mt-0.5">{priceError}</p>
                          )}
                        </td>

                        {/* Margin */}
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-bold ${
                              p.is_low_margin
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "text-emerald-700"
                            }`}
                          >
                            {formatPaise(p.margin_paise)} ({p.margin_pct}%)
                          </span>
                        </td>

                        {/* Stock Toggle */}
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => handleToggleStock(p.id)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              p.is_available ? "bg-emerald-600" : "bg-gray-300"
                            }`}
                            role="switch"
                            aria-checked={p.is_available}
                            title={p.is_available ? "In Stock" : "Out of Stock"}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                p.is_available ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </td>

                        {/* Active Toggle */}
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => handleToggleActive(p.id)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              p.is_active ? "bg-emerald-600" : "bg-gray-300"
                            }`}
                            role="switch"
                            aria-checked={p.is_active}
                            title={p.is_active ? "Active" : "Inactive"}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                p.is_active ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Stacked Cards (< 1024px, 360px-first) */}
          <div className="lg:hidden space-y-3">
            {products.map((p) => {
              const isSelected = selectedIds.has(p.id);

              return (
                <div
                  key={p.id}
                  className={`p-4 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-3 transition-colors ${
                    isSelected ? "border-emerald-500 bg-emerald-50/20" : ""
                  }`}
                >
                  {/* Top Row: Checkbox, Title, Brand & Category */}
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelectOne(p.id)}
                      className="mt-1 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 min-h-[20px] min-w-[20px]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          {p.category.name}
                        </span>
                        <span className="text-[11px] text-gray-500 truncate">
                          {p.shop.name}
                        </span>
                      </div>
                      <h3 className="font-bold text-gray-900 text-base leading-snug mt-1">
                        <Link href={`/admin/products/${p.id}`} className="hover:text-emerald-700">
                          {p.name}
                        </Link>
                      </h3>
                      <p className="text-xs text-gray-500">
                        {p.brand ? `${p.brand} • ` : ""}
                        {p.unit_size}
                      </p>
                    </div>
                  </div>

                  {/* Prices & Margins Row */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-lg font-black text-gray-900">
                          {formatPaise(p.selling_price_paise)}
                        </span>
                        {p.mrp_paise > p.selling_price_paise && (
                          <span className="text-xs text-gray-400 line-through">
                            {formatPaise(p.mrp_paise)}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Buy: {formatPaise(p.shop_price_paise)} &bull;{" "}
                        <span className={p.is_low_margin ? "text-amber-700 font-bold" : "text-emerald-700 font-bold"}>
                          Margin: {formatPaise(p.margin_paise)} ({p.margin_pct}%)
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Quick Action Toggles Row */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                    {/* Stock Button */}
                    <button
                      onClick={() => handleToggleStock(p.id)}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
                        p.is_available
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                          : "bg-gray-100 text-gray-500 border border-gray-200"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${p.is_available ? "bg-emerald-600" : "bg-gray-400"}`} />
                      {p.is_available ? "In Stock" : "Out of Stock"}
                    </button>

                    {/* Active Visibility Button */}
                    <button
                      onClick={() => handleToggleActive(p.id)}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
                        p.is_active
                          ? "bg-blue-50 text-blue-800 border border-blue-300"
                          : "bg-gray-100 text-gray-500 border border-gray-200"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${p.is_active ? "bg-blue-600" : "bg-gray-400"}`} />
                      {p.is_active ? "Visible" : "Hidden"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* CSV Import Modal (Phase C4) */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-xl border border-gray-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Import Catalog CSV</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Bulk create or update products and prices with dry-run verification
                </p>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Template & Guidelines */}
            <div className="p-3.5 bg-gray-50 rounded-xl text-xs space-y-2 text-gray-600 border border-gray-200">
              <p className="font-bold text-gray-800">Required CSV Columns:</p>
              <code className="block p-2 bg-white rounded border border-gray-200 text-[11px] font-mono break-all text-gray-700">
                shop_name,category,product_name,brand,unit_size,mrp_rupees,shop_price_rupees,selling_price_rupees
              </code>
              <p className="text-[11px] text-gray-500">
                Rule: Buy Price ≤ Selling Price ≤ Printed MRP. Existing products matched by shop, name &amp; unit size will have prices updated and audit logged.
              </p>
            </div>

            {/* File Picker */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                Select CSV File
              </label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="w-full text-xs text-gray-500 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer min-h-[44px]"
              />
              {csvFileName && (
                <p className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                  ✓ Selected: {csvFileName}
                </p>
              )}
            </div>

            {/* Row-Level Errors Banner */}
            {importErrors.length > 0 && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-xs">
                <p className="font-bold text-rose-800 flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Validation Failed ({importErrors.length} error{importErrors.length === 1 ? "" : "s"} found)
                </p>
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                  {importErrors.map((err, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-[11px] text-rose-700">
                      <span className="font-bold bg-rose-100 px-1.5 py-0.5 rounded text-rose-800 shrink-0">
                        Row {err.row}
                      </span>
                      <span>{err.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dry Run Preview Banner */}
            {importPreview && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs">
                <p className="font-bold text-emerald-800 flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Dry Run Passed! {importPreview.count} valid products ready to import.
                </p>
                <div className="max-h-32 overflow-y-auto border border-emerald-100 bg-white rounded-lg">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-emerald-50 text-emerald-900 border-b border-emerald-100 font-bold">
                      <tr>
                        <th className="p-1.5">Product</th>
                        <th className="p-1.5">Shop</th>
                        <th className="p-1.5 text-right">MRP</th>
                        <th className="p-1.5 text-right">Selling</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {importPreview.preview.map((r, i) => (
                        <tr key={i}>
                          <td className="p-1.5 font-medium truncate max-w-[120px]">{r.productName}</td>
                          <td className="p-1.5 text-gray-500 truncate max-w-[100px]">{r.shopName}</td>
                          <td className="p-1.5 text-right font-medium">₹{(r.mrpPaise / 100).toFixed(2)}</td>
                          <td className="p-1.5 text-right font-bold text-emerald-700">₹{(r.sellingPricePaise / 100).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Success Message */}
            {importSuccess && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {importSuccess}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-bold text-gray-700 min-h-[44px]"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!csvFileContent || importLoading}
                onClick={handleDryRun}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-800 disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-1.5"
              >
                {importLoading ? "Checking..." : "Preview (Dry Run)"}
              </button>

              <button
                type="button"
                disabled={!csvFileContent || importLoading || !importPreview || importErrors.length > 0}
                onClick={handleConfirmImport}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white shadow-xs disabled:opacity-40 min-h-[44px] flex items-center justify-center gap-1.5"
              >
                {importLoading ? "Importing..." : "Confirm & Import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

