'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { formatPaise } from '@/lib/money';
import { API_BASE_URL, SavedAddress } from '@/lib/api';

const SERVICEABLE_PINCODE = '411001';
const COD_MAX_LIMIT_PAISE = 100000; // ₹1,000

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, loading: cartLoading, refreshCart } = useCart();
  const { user, loading: authLoading } = useAuth();

  // Contact Info
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // Address Selection & Form
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [useCustomAddress, setUseCustomAddress] = useState(false);
  const [saveNewAddress, setSaveNewAddress] = useState(true);

  // Manual Address Fields
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState(SERVICEABLE_PINCODE);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'COD'>('UPI');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Test mode simulation modal state (F16)
  const [testModalData, setTestModalData] = useState<{
    orderNumber: string;
    orderId: string;
    amountPaise: number;
    keyId: string;
    gatewayOrderId: string;
  } | null>(null);
  const [simulating, setSimulating] = useState(false);

  // Dynamic script loader for Razorpay Checkout
  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') return resolve(false);
      if ((window as any).Razorpay) return resolve(true);

      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  // Initialize unique idempotency key once on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const generated = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `pluk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setIdempotencyKey(generated);
    }
  }, []);

  // Sync user info and load saved addresses when authenticated
  useEffect(() => {
    if (user) {
      if (user.name) setName(user.name);
      if (user.phone) setPhone(user.phone.replace('+91', ''));

      setLoadingAddresses(true);
      fetch(`${API_BASE_URL}/addresses`, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { addresses: [] }))
        .then((data) => {
          const list: SavedAddress[] = data.addresses || [];
          setSavedAddresses(list);
          if (list.length > 0) {
            const defaultAddr = list.find((a) => a.is_default) || list[0];
            setSelectedAddressId(defaultAddr.id);
            setUseCustomAddress(false);
          } else {
            setUseCustomAddress(true);
          }
        })
        .catch((err) => console.error('Failed to load saved addresses', err))
        .finally(() => setLoadingAddresses(false));
    } else {
      setSavedAddresses([]);
      setSelectedAddressId(null);
      setUseCustomAddress(true);
    }
  }, [user]);

  const isOverCodLimit = cart && cart.total_paise > COD_MAX_LIMIT_PAISE;

  // Auto-switch to UPI if cart exceeds COD limit
  useEffect(() => {
    if (isOverCodLimit && paymentMethod === 'COD') {
      setPaymentMethod('UPI');
    }
  }, [isOverCodLimit, paymentMethod]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Basic contact validations
    if (!name.trim() || name.trim().length < 2) {
      setErrorMessage('Please enter your full name (minimum 2 characters).');
      return;
    }

    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number starting with 6-9.');
      return;
    }

    // COD limit validation applies ONLY if COD is selected
    if (paymentMethod === 'COD' && isOverCodLimit) {
      setErrorMessage(
        'Order total exceeds the ₹1,000 Cash on Delivery limit. Please select Pay Online (UPI) or adjust items in cart.'
      );
      return;
    }

    let payloadAddress = address.trim();
    let payloadLandmark = landmark.trim() || undefined;
    let payloadPincode = pincode.trim();
    let payloadAddressId: string | undefined = undefined;

    if (!useCustomAddress && selectedAddressId) {
      const selected = savedAddresses.find((a) => a.id === selectedAddressId);
      if (!selected) {
        setErrorMessage('Please select a valid delivery address.');
        return;
      }
      payloadAddressId = selected.id;
      payloadAddress = selected.line1;
      payloadLandmark = selected.landmark || undefined;
      payloadPincode = selected.pincode;
    } else {
      // Validations for manual address entry
      if (!payloadAddress || payloadAddress.length < 5) {
        setErrorMessage('Please enter complete delivery address (minimum 5 characters).');
        return;
      }

      if (payloadPincode !== SERVICEABLE_PINCODE) {
        setErrorMessage(
          `Sorry, PlukIt currently only delivers to Pune Camp (pincode ${SERVICEABLE_PINCODE}). Please set pincode to ${SERVICEABLE_PINCODE}.`
        );
        return;
      }

      // Auto-save address to user's address book if requested and under 5 limit
      if (user && saveNewAddress && savedAddresses.length < 5) {
        try {
          await fetch(`${API_BASE_URL}/addresses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              line1: payloadAddress,
              landmark: payloadLandmark,
              pincode: payloadPincode,
              is_default: savedAddresses.length === 0,
            }),
          });
        } catch (err) {
          console.warn('Could not auto-save address to account:', err);
        }
      }
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE_URL}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          phone: cleanPhone,
          address: payloadAddress,
          landmark: payloadLandmark,
          pincode: payloadPincode,
          addressId: payloadAddressId,
          paymentMethod,
          idempotencyKey,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to place order. Please try again.');
        setSubmitting(false);
        return;
      }

      // 1. Cash on Delivery (COD) Flow
      if (paymentMethod === 'COD') {
        await refreshCart();
        router.push(`/order/${data.orderNumber}`);
        return;
      }

      // 2. UPI Online Payment Flow
      if (paymentMethod === 'UPI') {
        const isSimulated =
          data.razorpay?.isSimulated ||
          !data.razorpay?.keyId ||
          data.razorpay?.keyId.includes('dummy') ||
          data.razorpay?.keyId.includes('placeholder');

        if (isSimulated) {
          // Open in-app Razorpay Test Simulation Modal
          setTestModalData({
            orderNumber: data.orderNumber,
            orderId: data.orderId,
            amountPaise: data.totalPaise,
            keyId: data.razorpay?.keyId || 'rzp_test_dummy',
            gatewayOrderId: data.razorpay?.orderId || '',
          });
          setSubmitting(false);
          return;
        }

        // Live test mode keys: load Razorpay checkout script
        const scriptLoaded = await loadRazorpayScript();
        if (scriptLoaded && (window as any).Razorpay) {
          const rzp = new (window as any).Razorpay({
            key: data.razorpay.keyId,
            amount: data.razorpay.amountPaise,
            currency: 'INR',
            name: 'PlukIt',
            description: `Order #${data.orderNumber}`,
            order_id: data.razorpay.orderId,
            prefill: {
              name: name.trim(),
              contact: cleanPhone,
            },
            theme: { color: '#059669' },
            config: {
              display: {
                blocks: {
                  upi: {
                    name: 'Pay with UPI',
                    instruments: [{ method: 'upi' }],
                  },
                },
                sequence: ['block.upi'],
                preferences: { show_default_blocks: false },
              },
            },
            modal: {
              ondismiss: async function () {
                try {
                  await fetch(`${API_BASE_URL}/payments/razorpay/fail`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      orderNo: data.orderNumber,
                      reason: 'User dismissed UPI checkout modal',
                    }),
                  });
                } catch (e) {
                  console.error('Failed to notify cancellation', e);
                }
                await refreshCart();
                router.push(`/orders/${data.orderNumber}`);
              },
            },
            handler: async function () {
              // Per F16 specification: browser does not confirm order.
              // Order status remains PAYMENT_PENDING on server until webhook (F17).
              await refreshCart();
              router.push(`/order/${data.orderNumber}`);
            },
          });
          rzp.open();
          setSubmitting(false);
        } else {
          // Fallback to test simulation modal if script is blocked or offline
          setTestModalData({
            orderNumber: data.orderNumber,
            orderId: data.orderId,
            amountPaise: data.totalPaise,
            keyId: data.razorpay?.keyId || 'rzp_test_dummy',
            gatewayOrderId: data.razorpay?.orderId || '',
          });
          setSubmitting(false);
        }
      }
    } catch (err: unknown) {
      console.error('Checkout error:', err);
      setErrorMessage('Network error while placing order. Please check your connection.');
      setSubmitting(false);
    }
  };

  const handleSimulateUpiSuccess = async () => {
    if (!testModalData) return;
    setSimulating(true);
    await refreshCart();
    // Per F16: order status is read authority-side from the server (PAYMENT_PENDING)
    router.push(`/order/${testModalData.orderNumber}`);
  };

  const handleSimulateUpiFailure = async () => {
    if (!testModalData) return;
    setSimulating(true);
    try {
      await fetch(`${API_BASE_URL}/payments/razorpay/fail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNo: testModalData.orderNumber,
          reason: 'Simulated UPI payment failure (cancelled or declined)',
          description: 'Payment was cancelled in test mode simulation',
        }),
      });
    } catch (err) {
      console.error('Error simulating payment failure', err);
    }
    await refreshCart();
    router.push(`/orders/${testModalData.orderNumber}`);
  };

  const loading = cartLoading || authLoading;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-24">
      <Header showBack title={user ? 'Checkout' : 'Guest Checkout'} />

      <main className="mx-auto w-full max-w-md flex-1 px-3 py-3">
        {loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
            <span className="mt-3 text-sm font-medium">Loading checkout...</span>
          </div>
        ) : !cart || cart.items.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center text-center px-4">
            <span className="text-6xl animate-bounce">🛒</span>
            <h1 className="mt-4 text-lg font-bold text-slate-800">
              Your cart is empty
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 max-w-xs">
              Add some items from your local partner shops to proceed with checkout.
            </p>
            <Link
              href="/"
              className="mt-6 flex min-h-[48px] w-full max-w-xs items-center justify-center rounded-xl bg-emerald-600 font-bold text-sm text-white shadow-md hover:bg-emerald-700 active:scale-98 transition-transform"
            >
              Start Shopping
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* Delivery Alert / Pincode Notice */}
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 border border-emerald-200">
              <span className="text-base">📍</span>
              <div className="leading-snug">
                Delivering to: <strong>Pune Camp ({SERVICEABLE_PINCODE})</strong>
                <span className="block text-[11px] text-emerald-700">60-90 min hyper-local doorstep delivery</span>
              </div>
            </div>

            {/* Guest Login Suggestion Banner */}
            {!user && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-blue-50/90 border border-blue-200 px-3.5 py-2.5 text-xs text-blue-900 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="text-base">📱</span>
                  <div>
                    <span className="font-semibold block text-slate-900">Have an account?</span>
                    <span className="text-[11px] text-blue-700">Log in to use saved addresses &amp; faster checkout</span>
                  </div>
                </div>
                <Link
                  href="/account"
                  className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 min-h-[36px] flex items-center justify-center"
                >
                  Log In
                </Link>
              </div>
            )}

            {/* Error Message Box */}
            {errorMessage && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2 animate-fade-in">
                <span className="text-rose-600 text-sm">⚠️</span>
                <span className="flex-1 font-medium">{errorMessage}</span>
              </div>
            )}

            {/* COD Limit Warning */}
            {isOverCodLimit && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-800">
                  <span>⚠️</span>
                  <span>Cash on Delivery Limit Exceeded</span>
                </div>
                <p className="text-amber-700 leading-normal">
                  The maximum order limit for Cash on Delivery is {formatPaise(COD_MAX_LIMIT_PAISE)}. Your current total is{' '}
                  <strong>{formatPaise(cart.total_paise)}</strong>.
                </p>
                <Link
                  href="/cart"
                  className="font-bold text-amber-900 underline hover:text-amber-950 mt-1"
                >
                  Return to Cart to adjust items &rarr;
                </Link>
              </div>
            )}

            {/* Contact Details Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                <span>👤</span>
                <span>Contact Details</span>
              </h2>

              <div className="space-y-3.5">
                {/* Full Name */}
                <div>
                  <label htmlFor="checkout-name" className="block text-xs font-bold text-slate-700 mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="checkout-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="E.g. Rahul Sharma"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-hidden min-h-[44px]"
                  />
                </div>

                {/* Mobile Phone */}
                <div>
                  <label htmlFor="checkout-phone" className="block text-xs font-bold text-slate-700 mb-1">
                    Mobile Number <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:border-emerald-600 focus-within:ring-1 focus-within:ring-emerald-600 min-h-[44px]">
                    <span className="flex items-center bg-slate-50 px-3 text-xs font-bold text-slate-500 border-r border-slate-200">
                      +91
                    </span>
                    <input
                      id="checkout-phone"
                      type="tel"
                      inputMode="numeric"
                      required
                      maxLength={10}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit mobile number"
                      className="w-full px-3 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden"
                    />
                  </div>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    We will SMS order updates to this mobile number.
                  </span>
                </div>
              </div>
            </div>

            {/* Delivery Address Section */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <span>📍</span>
                  <span>Delivery Address</span>
                </h2>
                {user && (
                  <Link
                    href="/account/addresses"
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 underline"
                  >
                    Manage
                  </Link>
                )}
              </div>

              {/* Saved Addresses Picker (if user is logged in and has addresses) */}
              {user && savedAddresses.length > 0 && (
                <div className="mb-3 space-y-2">
                  <span className="text-xs font-semibold text-slate-600 block">
                    Choose a saved address:
                  </span>

                  <div className="space-y-2">
                    {savedAddresses.map((addr) => {
                      const isSelected = !useCustomAddress && selectedAddressId === addr.id;
                      return (
                        <div
                          key={addr.id}
                          onClick={() => {
                            setSelectedAddressId(addr.id);
                            setUseCustomAddress(false);
                          }}
                          className={`cursor-pointer rounded-xl border p-3 transition-all flex items-start gap-3 min-h-[44px] ${
                            isSelected
                              ? 'border-emerald-600 bg-emerald-50/70 shadow-2xs ring-1 ring-emerald-600'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                              isSelected
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <span className="text-[10px] leading-none">✓</span>}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-800">
                                {addr.line1}
                              </span>
                              {addr.is_default && (
                                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-emerald-800">
                                  Default
                                </span>
                              )}
                            </div>
                            {addr.landmark && (
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Landmark: {addr.landmark}
                              </p>
                            )}
                            <p className="text-[11px] font-medium text-emerald-700 mt-0.5">
                              Pune Camp ({addr.pincode})
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Toggle between saved and new address */}
                  <div className="pt-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        const nextState = !useCustomAddress;
                        setUseCustomAddress(nextState);
                        if (!nextState) {
                          const def = savedAddresses.find((a) => a.is_default) || savedAddresses[0];
                          if (def) setSelectedAddressId(def.id);
                        }
                      }}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 py-1 min-h-[36px]"
                    >
                      {useCustomAddress ? '← Use a saved address above' : '+ Deliver to another address'}
                    </button>
                  </div>
                </div>
              )}

              {/* Manual Address Form (shown for guests, users without saved addresses, or when custom address is active) */}
              {(useCustomAddress || !user || savedAddresses.length === 0) && (
                <div className="space-y-3.5 pt-1">
                  {user && savedAddresses.length > 0 && (
                    <div className="rounded-lg bg-slate-50 p-2 text-xs font-medium text-slate-600 border border-slate-200">
                      Enter a new delivery address below:
                    </div>
                  )}

                  {/* Address Line 1 */}
                  <div>
                    <label htmlFor="checkout-address" className="block text-xs font-bold text-slate-700 mb-1">
                      Delivery Address <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      id="checkout-address"
                      required={useCustomAddress || savedAddresses.length === 0}
                      rows={2}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Flat / House No., Building Name, Street"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-hidden"
                    />
                  </div>

                  {/* Landmark */}
                  <div>
                    <label htmlFor="checkout-landmark" className="block text-xs font-bold text-slate-700 mb-1">
                      Landmark <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      id="checkout-landmark"
                      type="text"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      placeholder="E.g. Near Poona Club / Opposite Market"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-hidden min-h-[44px]"
                    />
                  </div>

                  {/* Pincode */}
                  <div>
                    <label htmlFor="checkout-pincode" className="block text-xs font-bold text-slate-700 mb-1">
                      Delivery Pincode <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="checkout-pincode"
                      type="text"
                      inputMode="numeric"
                      required={useCustomAddress || savedAddresses.length === 0}
                      maxLength={6}
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="411001"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-hidden min-h-[44px]"
                    />
                    {pincode !== SERVICEABLE_PINCODE ? (
                      <span className="mt-1 block text-[11px] font-semibold text-rose-600">
                        ⚠️ PlukIt currently only delivers to pincode 411001.
                      </span>
                    ) : (
                      <span className="mt-1 block text-[11px] text-emerald-700">
                        ✓ Serviceable area: Pune Camp (411001)
                      </span>
                    )}
                  </div>

                  {/* Save to account checkbox for authenticated users */}
                  {user && (
                    <div className="pt-1">
                      {savedAddresses.length < 5 ? (
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={saveNewAddress}
                            onChange={(e) => setSaveNewAddress(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-xs font-medium text-slate-700">
                            Save this address to my account for future orders
                          </span>
                        </label>
                      ) : (
                        <p className="text-[11px] text-slate-500">
                          ℹ️ Address book limit reached (5/5). You can manage saved addresses in your{' '}
                          <Link href="/account/addresses" className="font-bold underline text-emerald-600">
                            Account
                          </Link>
                          .
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Payment Method Section (UPI + COD only, cards disabled) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <span>💳</span>
                  <span>Payment Method</span>
                </h2>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  0% Fee via UPI
                </span>
              </div>

              <div className="space-y-3">
                {/* 1. UPI Payment Option */}
                <div
                  onClick={() => setPaymentMethod('UPI')}
                  className={`cursor-pointer rounded-xl border-2 p-3.5 transition-all flex items-start gap-3 ${
                    paymentMethod === 'UPI'
                      ? 'border-emerald-600 bg-emerald-50/70 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-colors ${
                      paymentMethod === 'UPI'
                        ? 'bg-emerald-600 text-white'
                        : 'border-2 border-slate-300 text-transparent'
                    }`}
                  >
                    ✓
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <span>📱</span>
                        <span>Pay Online (UPI)</span>
                      </span>
                      <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800 uppercase tracking-wide">
                        Recommended
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-600 leading-normal">
                      Instant payment with Google Pay, PhonePe, Paytm, BHIM, or QR code. <strong>Cards are disabled to keep fees at 0%.</strong>
                    </p>

                    <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-200">
                        Google Pay
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-200">
                        PhonePe
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-200">
                        Paytm
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-200">
                        BHIM QR
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Cash on Delivery (COD) Option */}
                <div
                  onClick={() => {
                    if (isOverCodLimit) {
                      setErrorMessage(
                        'Orders exceeding ₹1,000 must be paid online via UPI. Please use UPI payment.'
                      );
                      return;
                    }
                    setPaymentMethod('COD');
                  }}
                  className={`rounded-xl border-2 p-3.5 transition-all flex items-start gap-3 ${
                    isOverCodLimit
                      ? 'border-slate-200 bg-slate-50/70 opacity-60 cursor-not-allowed'
                      : paymentMethod === 'COD'
                      ? 'border-emerald-600 bg-emerald-50/70 shadow-xs cursor-pointer'
                      : 'border-slate-200 bg-white hover:border-slate-300 cursor-pointer'
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-colors ${
                      paymentMethod === 'COD'
                        ? 'bg-emerald-600 text-white'
                        : 'border-2 border-slate-300 text-transparent'
                    }`}
                  >
                    ✓
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <span>💵</span>
                        <span>Cash on Delivery (COD)</span>
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          isOverCodLimit
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isOverCodLimit ? 'Exceeds ₹1,000 Limit' : 'Max ₹1,000'}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-600 leading-normal">
                      Pay in cash directly to our delivery executive when your parcel arrives.
                    </p>

                    {isOverCodLimit && (
                      <p className="mt-1.5 text-[11px] font-semibold text-amber-700">
                        ⚠️ Total is over ₹1,000. Please pay via UPI.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Order Summary
                </h3>
                <span className="text-xs text-slate-500 font-medium">
                  {cart.items.length} {cart.items.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              {/* Items List */}
              <div className="divide-y divide-slate-100 mb-3 max-h-48 overflow-y-auto pr-1">
                {cart.items.map((item) => (
                  <div key={item.id} className="py-2 flex items-center justify-between text-xs">
                    <div className="flex-1 min-w-0 pr-2">
                      <span className="font-semibold text-slate-800 truncate block">
                        {item.name}
                      </span>
                      <span className="text-slate-400 text-[11px]">
                        Qty: {item.qty} × {formatPaise(item.selling_price_paise)}
                      </span>
                    </div>
                    <span className="font-bold text-slate-900 shrink-0">
                      {formatPaise(item.line_total_paise)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3 text-sm text-slate-600">
                <div className="flex justify-between">
                  <span>Items Subtotal</span>
                  <span className="font-semibold text-slate-800">
                    {formatPaise(cart.subtotal_paise)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>Delivery Fee</span>
                  {cart.delivery_fee_paise === 0 ? (
                    <span className="font-bold text-emerald-600">FREE</span>
                  ) : (
                    <span className="font-semibold text-slate-800">
                      {formatPaise(cart.delivery_fee_paise)}
                    </span>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-2.5 flex justify-between text-base font-black text-slate-900">
                  <span>Total Payable</span>
                  <span className="text-emerald-700">
                    {formatPaise(cart.total_paise)}
                  </span>
                </div>
              </div>

              {/* Dynamic Submit Button */}
              <button
                type="submit"
                disabled={submitting || (paymentMethod === 'COD' && !!isOverCodLimit)}
                className={`mt-4 flex min-h-[48px] w-full items-center justify-center rounded-xl font-bold text-base text-white shadow-md transition-all active:scale-98 ${
                  submitting || (paymentMethod === 'COD' && isOverCodLimit)
                    ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                    : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 cursor-pointer'
                }`}
              >
                {submitting ? (
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>{paymentMethod === 'UPI' ? 'Connecting to UPI...' : 'Placing Order...'}</span>
                  </div>
                ) : paymentMethod === 'UPI' ? (
                  <span className="flex items-center gap-1.5">
                    <span>📱</span>
                    <span>Pay with UPI ({formatPaise(cart.total_paise)})</span>
                  </span>
                ) : (
                  <span>Place COD Order ({formatPaise(cart.total_paise)})</span>
                )}
              </button>

              <p className="mt-2.5 text-center text-[11px] text-slate-400">
                By placing your order, you agree to PlukIt terms of service.
              </p>
            </div>
          </form>
        )}

        {/* Razorpay Test Payment Simulation Modal (F16 Test Mode) */}
        {testModalData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚡</span>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 leading-tight">
                      Razorpay Test Mode
                    </h3>
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                      UPI Only (0% Commission)
                    </span>
                  </div>
                </div>
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800 uppercase">
                  Simulation
                </span>
              </div>

              <div className="my-4 text-center bg-slate-50 rounded-xl p-3 border border-slate-100">
                <span className="text-xs text-slate-500 block">Total Amount</span>
                <span className="text-2xl font-black text-slate-900">
                  {formatPaise(testModalData.amountPaise)}
                </span>
                <span className="text-[11px] font-mono font-bold text-slate-500 block mt-0.5">
                  Order #{testModalData.orderNumber}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Select Simulated UPI Flow
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-slate-200 p-2.5 text-center font-bold text-slate-700 bg-white hover:border-emerald-500">
                    Google Pay
                  </div>
                  <div className="rounded-xl border border-slate-200 p-2.5 text-center font-bold text-slate-700 bg-white hover:border-emerald-500">
                    PhonePe
                  </div>
                  <div className="rounded-xl border border-slate-200 p-2.5 text-center font-bold text-slate-700 bg-white hover:border-emerald-500">
                    Paytm UPI
                  </div>
                  <div className="rounded-xl border border-slate-200 p-2.5 text-center font-bold text-slate-700 bg-white hover:border-emerald-500">
                    BHIM QR
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight pt-1">
                  Cards are disabled as requested. Simulate gateway response:
                </p>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  disabled={simulating}
                  onClick={handleSimulateUpiSuccess}
                  className="w-full min-h-[44px] rounded-xl bg-emerald-600 font-bold text-xs text-white shadow-md hover:bg-emerald-700 active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {simulating ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <span>✓</span>
                      <span>Simulate UPI Payment Success</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={simulating}
                  onClick={handleSimulateUpiFailure}
                  className="w-full min-h-[42px] rounded-xl border border-rose-200 bg-rose-50 font-bold text-xs text-rose-700 hover:bg-rose-100 active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>✕</span>
                  <span>Simulate Payment Failure</span>
                </button>

                <button
                  type="button"
                  disabled={simulating}
                  onClick={handleSimulateUpiFailure}
                  className="w-full min-h-[36px] rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-600 active:scale-98 transition-all cursor-pointer"
                >
                  Cancel &amp; Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

