'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { API_BASE_URL, CartData } from '@/lib/api';

interface CartContextType {
  cart: CartData | null;
  loading: boolean;
  addItem: (productId: string, qty?: number) => Promise<{ success: boolean }>;
  updateQty: (productId: string, qty: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  emptyCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartData | null>(null);
  const [loading, setLoading] = useState(true);

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
      }}
    >
      {children}
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
