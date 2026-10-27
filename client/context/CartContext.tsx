'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { API_BASE_URL, CartData } from '@/lib/api';

interface ConflictData {
  productId: string;
  qty: number;
  newShopName?: string;
  existingShopName?: string;
}

interface CartContextType {
  cart: CartData | null;
  loading: boolean;
  addItem: (productId: string, qty?: number) => Promise<{ success: boolean; conflict?: any }>;
  updateQty: (productId: string, qty: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  emptyCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
  conflictData: ConflictData | null;
  dismissConflict: () => void;
  confirmSwitchShop: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [conflictData, setConflictData] = useState<ConflictData | null>(null);

  async function fetchCart() {
    try {
      const res = await fetch(`${API_BASE_URL}/cart`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setCart(data);
      }
    } catch (err) {
      console.error('Failed to load cart:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCart();
  }, []);

  async function addItem(productId: string, qty = 1) {
    try {
      const res = await fetch(`${API_BASE_URL}/cart/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productId, qty }),
      });

      if (res.status === 409) {
        const data = await res.json();
        setConflictData({
          productId,
          qty,
          newShopName: data.newShopName || 'another shop',
          existingShopName: data.existingShopName || cart?.shop_name || 'your current shop',
        });
        return { success: false, conflict: data };
      }

      if (res.ok) {
        const data = await res.json();
        setCart(data);
        return { success: true };
      }

      return { success: false };
    } catch (err) {
      console.error('Failed to add item:', err);
      return { success: false };
    }
  }

  async function updateQty(productId: string, qty: number) {
    try {
      const res = await fetch(`${API_BASE_URL}/cart/items/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ qty }),
      });
      if (res.ok) {
        const data = await res.json();
        setCart(data);
      }
    } catch (err) {
      console.error('Failed to update qty:', err);
    }
  }

  async function removeItem(productId: string) {
    try {
      const res = await fetch(`${API_BASE_URL}/cart/items/${productId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setCart(data);
      }
    } catch (err) {
      console.error('Failed to remove item:', err);
    }
  }

  async function emptyCart() {
    try {
      const res = await fetch(`${API_BASE_URL}/cart`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setCart(data);
      }
    } catch (err) {
      console.error('Failed to empty cart:', err);
    }
  }

  async function confirmSwitchShop() {
    if (!conflictData) return;
    const { productId, qty } = conflictData;
    setConflictData(null);

    // Empty cart first, then add the new product
    await emptyCart();
    await addItem(productId, qty);
  }

  function dismissConflict() {
    setConflictData(null);
  }

  return (
    <CartContext.Provider
      value={{
        cart,
        loading,
        addItem,
        updateQty,
        removeItem,
        emptyCart,
        refreshCart: fetchCart,
        conflictData,
        dismissConflict,
        confirmSwitchShop,
      }}
    >
      {children}

      {/* Different Shop Conflict Modal */}
      {conflictData && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-2xs animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-2xl">
              🏪
            </div>
            <h3 className="mt-3 text-base font-bold text-slate-900">
              Replace cart items?
            </h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Your cart has items from <strong>{conflictData.existingShopName}</strong>.
              Do you want to empty your cart and add items from <strong>{conflictData.newShopName}</strong> instead?
            </p>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={dismissConflict}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-300 font-bold text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100"
              >
                Keep Current
              </button>
              <button
                type="button"
                onClick={confirmSwitchShop}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-rose-600 font-bold text-sm text-white hover:bg-rose-700 active:scale-98 shadow-sm"
              >
                Empty &amp; Add
              </button>
            </div>
          </div>
        </div>
      )}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
