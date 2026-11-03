"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ImagePlaceholder from "@/components/ui/ImagePlaceholder";

interface CategoryOption {
  id: string;
  name: string;
}

interface ShopOption {
  id: string;
  name: string;
}

export default function AddProductPage() {
  const router = useRouter();

  // Form State
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [unitSize, setUnitSize] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [shopId, setShopId] = useState("");
  const [mrpRupees, setMrpRupees] = useState("");
  const [buyPriceRupees, setBuyPriceRupees] = useState("");
  const [sellingPriceRupees, setSellingPriceRupees] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [gstRate, setGstRate] = useState("0");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [isActive, setIsActive] = useState(true);

  // Photo Upload State
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Metadata Dropdowns
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load dropdown options
  useEffect(() => {
    async function loadMeta() {
      try {
        const res = await fetch("http://localhost:4000/api/admin/products/meta", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories || []);
          setShops(data.shops || []);
          if (data.categories?.length > 0) {
            setCategoryId(data.categories[0].id);
          }
          if (data.shops?.length > 0) {
            setShopId(data.shops[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load product meta", err);
      } finally {
        setMetaLoading(false);
      }
    }
    loadMeta();
  }, []);

  // Live Margin Calculation
  const mrpNum = parseFloat(mrpRupees) || 0;
  const buyNum = parseFloat(buyPriceRupees) || 0;
  const sellNum = parseFloat(sellingPriceRupees) || 0;

  const marginRupees = sellNum - buyNum;
  const marginPct = sellNum > 0 ? Math.round((marginRupees / sellNum) * 1000) / 10 : 0;
  const isAboveMrp = sellNum > mrpNum && mrpNum > 0;
  const isBelowBuy = sellNum < buyNum && sellNum > 0 && buyNum > 0;
  const isLowMargin = marginPct < 10 && sellNum > 0 && buyNum > 0 && !isBelowBuy && !isAboveMrp;

  // Photo File Change Handler
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size <= 5MB
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("Photo exceeds 5 MB. Please choose an image smaller than 5 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Check MIME type
    const validMimes = ["image/jpeg", "image/png", "image/webp"];
    if (!validMimes.includes(file.type)) {
      setPhotoError("Only JPG, PNG, and WebP images are permitted. SVG and other formats are rejected.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        // Convert and center-crop to 800x800 WebP via canvas (removes all EXIF/metadata)
        const canvas = document.createElement("canvas");
        canvas.width = 800;
        canvas.height = 800;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, 800, 800);

          // Square center-crop
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 800, 800);

          try {
            const webpUrl = canvas.toDataURL("image/webp", 0.88);
            setPhotoPreview(webpUrl);
          } catch {
            setPhotoPreview(readerEvent.target?.result as string);
          }
        }
      };
      img.src = readerEvent.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoPreview(null);
    setPhotoError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Form Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);

    // Basic Validations
    if (!name.trim()) {
      setFormError("Product name is required.");
      return;
    }
    if (!unitSize.trim()) {
      setFormError("Unit size is required (e.g. 500 g, 1 L, 1 pc).");
      return;
    }
    if (!categoryId) {
      setFormError("Please select a category.");
      return;
    }
    if (!shopId) {
      setFormError("Please select a partner shop.");
      return;
    }
    if (mrpNum <= 0) {
      setFormError("Please enter a valid printed MRP in ₹.");
      return;
    }
    if (buyNum <= 0) {
      setFormError("Please enter a valid shop buy price in ₹.");
      return;
    }
    if (sellNum <= 0) {
      setFormError("Please enter a valid customer selling price in ₹.");
      return;
    }
    if (isAboveMrp) {
      setFormError(`Selling price (₹${sellNum.toFixed(2)}) cannot exceed printed MRP (₹${mrpNum.toFixed(2)}).`);
      return;
    }
    if (isBelowBuy) {
      setFormError(`Selling price (₹${sellNum.toFixed(2)}) cannot be lower than buy price (₹${buyNum.toFixed(2)}).`);
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        brand: brand.trim() || null,
        unit_size: unitSize.trim(),
        category_id: categoryId,
        shop_id: shopId,
        mrp_paise: Math.round(mrpNum * 100),
        shop_price_paise: Math.round(buyNum * 100),
        selling_price_paise: Math.round(sellNum * 100),
        hsn_code: hsnCode.trim() || null,
        gst_rate: parseFloat(gstRate) || 0.0,
        sku: sku.trim() || null,
        barcode: barcode.trim() || null,
        is_available: isAvailable,
        is_active: isActive,
        photo_base64: photoPreview || null,
      };

      const res = await fetch("http://localhost:4000/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create product");
      }

      setSuccessMsg(`Product "${name}" created successfully! Redirecting...`);
      setTimeout(() => {
        router.push("/admin/products");
      }, 1000);
    } catch (err: any) {
      setFormError(err.message || "An unexpected error occurred while saving the product.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Top Header & Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/products"
            className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-colors shadow-xs min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Back to products list"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
              Add New Product
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              Create a catalog item with partner shop pricing and stock status
            </p>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {formError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium flex items-start gap-2.5 shadow-xs">
          <svg className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-bold">Error saving product</p>
            <p className="mt-0.5 text-xs text-rose-700">{formError}</p>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center gap-2.5 shadow-xs">
          <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="font-bold">{successMsg}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column (2 Cols on lg): Primary Information & Pricing */}
          <div className="lg:col-span-2 space-y-6">
            {/* Card: Basic Details */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
                General Information
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Product Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Amul Taaza Homogenised Toned Milk"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[44px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Brand
                  </label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="e.g. Amul, Nandini, FreshFarm"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[44px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Unit Size <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={unitSize}
                    onChange={(e) => setUnitSize(e.target.value)}
                    placeholder="e.g. 500 ml, 1 kg, 6 pcs"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[44px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[44px] bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Partner Shop <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={shopId}
                    onChange={(e) => setShopId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[44px] bg-white"
                  >
                    {shops.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Card: Pricing & Legal Rules */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h2 className="text-base font-bold text-gray-900">
                  Pricing &amp; Margins
                </h2>
                <span className="text-xs text-gray-500 font-medium">
                  Rule: Buy ≤ Selling ≤ MRP
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Printed MRP (₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-gray-400 font-bold text-sm">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={mrpRupees}
                      onChange={(e) => setMrpRupees(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[44px]"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400">Maximum retail price</p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Shop Buy Price (₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-gray-400 font-bold text-sm">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={buyPriceRupees}
                      onChange={(e) => setBuyPriceRupees(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[44px]"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400">Paid to shopkeeper</p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Selling Price (₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-emerald-600 font-bold text-sm">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={sellingPriceRupees}
                      onChange={(e) => setSellingPriceRupees(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[44px]"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400">Customer checkout price</p>
                </div>
              </div>

              {/* Live Margin & Legal Validation Indicator */}
              <div className="mt-4 p-4 rounded-xl border transition-all duration-200 bg-gray-50 border-gray-200">
                {isAboveMrp ? (
                  <div className="flex items-center gap-2 text-rose-700 text-xs font-bold">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Illegal Price: Selling price (₹{sellNum.toFixed(2)}) cannot exceed printed MRP (₹{mrpNum.toFixed(2)}).
                  </div>
                ) : isBelowBuy ? (
                  <div className="flex items-center gap-2 text-rose-700 text-xs font-bold">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Negative Margin: Selling price (₹{sellNum.toFixed(2)}) cannot be lower than buy price (₹{buyNum.toFixed(2)}).
                  </div>
                ) : sellNum > 0 && buyNum > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-600">Calculated Margin:</span>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-extrabold ${
                        isLowMargin
                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                          : "bg-emerald-100 text-emerald-900 border border-emerald-300"
                      }`}>
                        ₹{marginRupees.toFixed(2)} ({marginPct}%)
                      </span>
                    </div>

                    {isLowMargin && (
                      <span className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                        ⚠️ Margin is under 10%
                      </span>
                    )}

                    {!isLowMargin && marginPct >= 15 && (
                      <span className="text-[11px] font-semibold text-emerald-800 flex items-center gap-1">
                        ✓ Healthy margin
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">
                    Enter MRP, Buy Price, and Selling Price to preview profit margin and compliance.
                  </p>
                )}
              </div>
            </div>

            {/* Card: Tax & Compliance */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
                Tax, Codes &amp; Barcode
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    HSN Code
                  </label>
                  <input
                    type="text"
                    value={hsnCode}
                    onChange={(e) => setHsnCode(e.target.value)}
                    placeholder="e.g. 04012000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[44px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    GST Rate
                  </label>
                  <select
                    value={gstRate}
                    onChange={(e) => setGstRate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[44px] bg-white"
                  >
                    <option value="0">0% (Nil / Exempt)</option>
                    <option value="5">5% GST</option>
                    <option value="12">12% GST</option>
                    <option value="18">18% GST</option>
                    <option value="28">28% GST</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Barcode / EAN-13
                  </label>
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="e.g. 8901262010053"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[44px]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (1 Col on lg): Photo Upload & Availability Toggles */}
          <div className="space-y-6">
            {/* Card: Photo Upload (Section 10.2) */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
                Product Photo
              </h2>

              <div className="space-y-3">
                {/* Photo Preview Container */}
                <div className="w-full aspect-square relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center">
                  {photoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoPreview}
                      alt="Product preview"
                      className="w-full h-full object-contain bg-white"
                    />
                  ) : (
                    <ImagePlaceholder
                      alt="No photo chosen"
                      className="w-full h-full"
                    />
                  )}
                </div>

                {photoError && (
                  <p className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                    {photoError}
                  </p>
                )}

                {/* File picker button */}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoSelect}
                  className="hidden"
                  id="photo-upload-input"
                />

                <div className="flex gap-2">
                  <label
                    htmlFor="photo-upload-input"
                    className="flex-1 py-2.5 px-3 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold text-center cursor-pointer shadow-xs min-h-[44px] flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {photoPreview ? "Change Photo" : "Upload Photo"}
                  </label>

                  {photoPreview && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="px-3 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold min-h-[44px] flex items-center justify-center transition-colors"
                      title="Remove selected photo"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-gray-400">
                  Accepts JPG, PNG, WebP up to 5 MB. Converts to 800×800 WebP and strips metadata.
                </p>
              </div>
            </div>

            {/* Card: Availability & Visibility Controls */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
                Stock &amp; Visibility
              </h2>

              <div className="space-y-4">
                {/* Stock Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <div>
                    <p className="text-xs font-bold text-gray-900">In Stock</p>
                    <p className="text-[11px] text-gray-500">Allow customers to add to cart</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAvailable(!isAvailable)}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none min-h-[44px] items-center ${
                      isAvailable ? "bg-emerald-600" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        isAvailable ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Active Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <div>
                    <p className="text-xs font-bold text-gray-900">Active on Storefront</p>
                    <p className="text-[11px] text-gray-500">Visible on search and category lists</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsActive(!isActive)}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none min-h-[44px] items-center ${
                      isActive ? "bg-emerald-600" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        isActive ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-2">
              <button
                type="submit"
                disabled={submitting || metaLoading || isAboveMrp || isBelowBuy}
                className="w-full py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors min-h-[48px] flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Saving Product...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Save Product
                  </>
                )}
              </button>

              <Link
                href="/admin/products"
                className="w-full py-3 px-4 rounded-xl text-xs font-bold text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 transition-colors min-h-[44px] flex items-center justify-center shadow-xs"
              >
                Cancel &amp; Discard
              </Link>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

