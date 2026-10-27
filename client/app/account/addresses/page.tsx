'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL } from '@/lib/api';

export interface SavedAddress {
  id: string;
  user_id: string;
  line1: string;
  landmark: string | null;
  pincode: string;
  is_default: boolean;
  created_at: string;
}

export default function SavedAddressesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);

  // Form fields
  const [line1, setLine1] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState('411001');
  const [isDefault, setIsDefault] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Redirect unauthenticated users
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/account');
    }
  }, [user, authLoading, router]);

  const fetchAddresses = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/addresses`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setAddresses(data.addresses || []);
      }
    } catch (err) {
      console.error('Error fetching addresses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchAddresses();
    }
  }, [user]);

  const resetForm = () => {
    setLine1('');
    setLandmark('');
    setPincode('411001');
    setIsDefault(false);
    setFormError(null);
    setShowAddForm(false);
    setEditingAddressId(null);
  };

  const handleStartEdit = (addr: SavedAddress) => {
    setEditingAddressId(addr.id);
    setLine1(addr.line1);
    setLandmark(addr.landmark || '');
    setPincode(addr.pincode);
    setIsDefault(addr.is_default);
    setFormError(null);
    setShowAddForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (line1.trim().length < 5) {
      setFormError('Please enter a complete address (minimum 5 characters).');
      return;
    }

    if (!/^\d{6}$/.test(pincode.trim())) {
      setFormError('Pincode must be exactly 6 digits.');
      return;
    }

    setSaving(true);
    try {
      const url = editingAddressId
        ? `${API_BASE_URL}/addresses/${editingAddressId}`
        : `${API_BASE_URL}/addresses`;
      const method = editingAddressId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          line1: line1.trim(),
          landmark: landmark.trim() || undefined,
          pincode: pincode.trim(),
          is_default: isDefault,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        resetForm();
        await fetchAddresses();
      } else {
        setFormError(data.error || 'Failed to save address. Please check your inputs.');
      }
    } catch (err) {
      setFormError('Network error while saving address.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this address?')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/addresses/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        await fetchAddresses();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/addresses/${id}/default`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (res.ok) {
        await fetchAddresses();
      }
    } catch (err) {
      console.error('Set default error:', err);
    }
  };

  if (authLoading || (loading && addresses.length === 0)) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-24">
        <Header showBack title="Saved Addresses" />
        <main className="mx-auto w-full max-w-md flex-1 px-3 py-12 flex flex-col items-center justify-center text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
          <span className="mt-3 text-sm font-medium">Loading addresses...</span>
        </main>
        <BottomNav />
      </div>
    );
  }

  const reachedLimit = addresses.length >= 5;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-24">
      <Header showBack title="Saved Addresses" />

      <main className="mx-auto w-full max-w-md flex-1 px-3 py-4 space-y-4">
        {/* Header Bar with Counter */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs flex items-center justify-between">
          <div>
            <h1 className="text-base font-extrabold text-slate-900">Delivery Addresses</h1>
            <p className="text-xs text-slate-500">
              Saved addresses are used for quick 1-click checkout.
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-black ${
              reachedLimit ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {addresses.length}/5
          </span>
        </div>

        {/* Add Address Form Accordion / Card */}
        {showAddForm ? (
          <div className="rounded-2xl border border-emerald-300 bg-white p-4 shadow-sm space-y-3 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-sm font-extrabold text-slate-900">
                {editingAddressId ? 'Edit Address' : 'Add New Address'}
              </span>
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-bold text-slate-400 hover:text-slate-700"
              >
                ✕ Cancel
              </button>
            </div>

            {formError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-medium">
                ⚠️ {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Complete Address <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  placeholder="Flat / House No., Building Name, Street"
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Landmark (Optional)
                </label>
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="E.g. Near Ruby Hall Clinic"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-hidden min-h-[40px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Pincode (Currently Pune Camp: 411001)
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:border-emerald-600 focus:outline-hidden min-h-[40px]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="default-check"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded-sm border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="default-check" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Set as default delivery address
                </label>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-xs text-white shadow-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {saving ? 'Saving...' : editingAddressId ? 'Update Address' : 'Save Address'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 font-bold text-xs text-slate-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Add Button */
          <div>
            {reachedLimit ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 font-medium text-center">
                Maximum 5 addresses saved. Delete or edit an existing address to change your locations.
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowAddForm(true);
                }}
                className="w-full min-h-[44px] rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-800 text-xs font-black flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>➕</span>
                <span>Add New Delivery Address</span>
              </button>
            )}
          </div>
        )}

        {/* Address Cards List */}
        {addresses.length === 0 && !showAddForm ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-2xs space-y-3">
            <span className="text-3xl block">📍</span>
            <h2 className="text-sm font-bold text-slate-800">No saved addresses yet</h2>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Save your home, office, or frequently used locations for fast and seamless checkout.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {addresses.map((addr) => (
              <div
                key={addr.id}
                className={`rounded-2xl border bg-white p-4 shadow-2xs transition-all ${
                  addr.is_default
                    ? 'border-emerald-500 ring-1 ring-emerald-500'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-extrabold text-sm text-slate-900">
                        {addr.is_default ? 'Default Address' : 'Delivery Address'}
                      </span>
                      {addr.is_default && (
                        <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-black uppercase">
                          DEFAULT
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      {addr.line1}
                    </p>
                    {addr.landmark && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Landmark: {addr.landmark}
                      </p>
                    )}
                    <span className="inline-block mt-1 font-mono text-[11px] font-bold text-slate-500">
                      Pincode: {addr.pincode}
                    </span>
                  </div>
                </div>

                <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-3">
                  {!addr.is_default ? (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(addr.id)}
                      className="text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                    >
                      ★ Set as default
                    </button>
                  ) : (
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                      ✓ Used at checkout
                    </span>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(addr)}
                      className="text-xs font-bold text-slate-600 hover:text-slate-900 p-1"
                    >
                      Edit
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(addr.id)}
                      className="text-xs font-bold text-rose-600 hover:text-rose-800 p-1"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
