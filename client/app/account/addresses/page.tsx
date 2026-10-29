'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/ui/Header';
import BottomNav from '@/components/ui/BottomNav';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
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
  const [pincode, setPincode] = useState('411038');
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
    setPincode('411038');
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
      <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-28">
        <Header showBack title="Saved Addresses" />
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 flex flex-col items-center justify-center text-muted">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
          <span className="mt-3 text-sm font-semibold">Loading addresses...</span>
        </main>
        <BottomNav />
      </div>
    );
  }

  const reachedLimit = addresses.length >= 5;

  return (
    <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-28">
      <Header showBack title="Saved Addresses" />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 space-y-4">
        {/* Header Bar with Counter */}
        <div className="rounded-[18px] border border-border bg-card p-4 shadow-2xs flex items-center justify-between">
          <div>
            <h1 className="text-base font-extrabold text-heading">Delivery Addresses</h1>
            <p className="text-xs text-muted">
              Saved addresses are used for quick 1-click checkout.
            </p>
          </div>
          <span className="rounded-full bg-chip border border-border px-3 py-1 text-xs font-mono font-bold text-heading">
            {addresses.length}/5
          </span>
        </div>

        {/* Add Address Form Card */}
        {showAddForm ? (
          <div className="rounded-[18px] border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <span className="text-sm font-extrabold text-heading">
                {editingAddressId ? 'Edit Address' : 'Add New Address'}
              </span>
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-bold text-muted hover:text-heading cursor-pointer"
              >
                ✕ Cancel
              </button>
            </div>

            {formError && (
              <div className="rounded-[12px] border border-border bg-surface p-3 text-xs text-primary font-medium">
                ⚠️ {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-heading mb-1">
                  Complete Address <span className="text-primary">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  placeholder="Flat / House No., Building Name, Street"
                  className="w-full rounded-[12px] border border-border bg-card p-2.5 text-xs text-text placeholder-muted focus:border-primary focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-heading mb-1">
                  Landmark (Optional)
                </label>
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="E.g. Near Poona Club / Opposite Market"
                  className="w-full rounded-[12px] border border-border bg-card px-3 py-2 text-xs text-text placeholder-muted focus:border-primary focus:outline-hidden min-h-[40px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-heading mb-1">
                  Pincode
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-[12px] border border-border bg-card px-3 py-2 text-xs font-mono font-bold text-text focus:border-primary focus:outline-hidden min-h-[40px]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="default-check"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded-sm border-border text-primary focus:ring-primary"
                />
                <label htmlFor="default-check" className="text-xs font-medium text-heading cursor-pointer">
                  Set as default delivery address
                </label>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={saving}
                  className="flex-1"
                >
                  {saving ? 'Saving...' : editingAddressId ? 'Update Address' : 'Save Address'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={resetForm}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        ) : (
          /* Add Button */
          <div>
            {reachedLimit ? (
              <div className="rounded-[14px] border border-border bg-chip p-3 text-xs text-muted font-medium text-center">
                Maximum 5 addresses saved. Delete or edit an existing address to change your locations.
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowAddForm(true);
                }}
                className="w-full min-h-[44px] rounded-[16px] border-2 border-dashed border-primary/40 bg-surface hover:bg-chip text-primary text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>+</span>
                <span>Add New Delivery Address</span>
              </button>
            )}
          </div>
        )}

        {/* Address Cards List */}
        {addresses.length === 0 && !showAddForm ? (
          <div className="rounded-[18px] border border-border bg-card p-8 text-center shadow-2xs space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-chip text-primary">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h2 className="text-sm font-bold text-heading">No saved addresses yet</h2>
            <p className="text-xs text-muted max-w-xs mx-auto">
              Save your home, office, or frequently used locations for fast and seamless checkout.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {addresses.map((addr) => (
              <div
                key={addr.id}
                className={`rounded-[18px] border bg-card p-4 shadow-2xs transition-all ${
                  addr.is_default
                    ? 'border-primary ring-1 ring-primary/40'
                    : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-extrabold text-sm text-heading">
                        {addr.is_default ? 'Home' : 'Delivery Address'}
                      </span>
                      {addr.is_default && (
                        <Badge variant="primary">Default</Badge>
                      )}
                    </div>
                    <p className="text-xs text-text leading-relaxed font-medium">
                      {addr.line1}
                    </p>
                    {addr.landmark && (
                      <p className="text-xs text-muted mt-0.5">
                        Landmark: {addr.landmark}
                      </p>
                    )}
                    <span className="inline-block mt-1 font-mono text-[11px] font-bold text-primary">
                      Pincode: {addr.pincode}
                    </span>
                  </div>
                </div>

                <div className="mt-3.5 flex items-center justify-between border-t border-border/40 pt-3">
                  {!addr.is_default ? (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(addr.id)}
                      className="text-xs font-bold text-primary hover:underline cursor-pointer"
                    >
                      &starf; Set as default
                    </button>
                  ) : (
                    <span className="text-[11px] font-bold text-primary flex items-center gap-1">
                      &check; Used at checkout
                    </span>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(addr)}
                      className="text-xs font-bold text-muted hover:text-heading cursor-pointer"
                    >
                      Edit
                    </button>
                    <span className="text-border">|</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(addr.id)}
                      className="text-xs font-bold text-muted hover:text-primary underline cursor-pointer"
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
