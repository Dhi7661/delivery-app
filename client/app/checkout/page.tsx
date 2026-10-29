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
import { THEME_TOKENS } from '@/lib/brand';
import Button from '@/components/ui/Button';

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

        // Test mode keys: load Razorpay checkout script
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
            theme: { color: THEME_TOKENS.primary },
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
    <div
      style={{ paddingBottom: 'calc(10rem + env(safe-area-inset-bottom, 0px))' }}
      className="flex min-h-screen flex-col bg-background text-text antialiased"
    >
      <Header
        variant="checkout"
        title="Review &amp; Checkout"
      />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <span className="mt-3 text-sm font-semibold">Loading checkout...</span>
          </div>
        ) : !cart || cart.items.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center text-center px-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-chip text-primary">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <h1 className="mt-4 text-lg font-black text-heading">
              Your cart is empty
            </h1>
            <p className="mt-1.5 text-xs font-medium text-muted max-w-xs">
              Add some items from your local partner shops to proceed with checkout.
            </p>
            <div className="mt-6 w-full max-w-xs">
              <Link href="/">
                <Button variant="primary" size="lg" fullWidth>
                  Start Shopping
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
            {/* Delivery Alert / Pincode Notice */}
            <div className="flex items-center gap-2.5 rounded-[14px] border border-border bg-card px-3.5 py-2.5 text-xs text-heading shadow-2xs">
              <svg className="h-4 w-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div className="leading-snug">
                Delivering to: <strong className="font-bold">Pune ({SERVICEABLE_PINCODE})</strong>
                <span className="block text-[11px] font-medium text-muted">20-25 mins hyper-local delivery</span>
              </div>
            </div>

            {/* Guest Login Suggestion Banner */}
            {!user && (
              <div className="flex items-center justify-between gap-2 rounded-[14px] border border-border bg-surface px-3.5 py-2.5 text-xs shadow-2xs">
                <div>
                  <span className="font-bold block text-heading">Have an account?</span>
                  <span className="text-[11px] font-medium text-muted">Log in to use saved addresses &amp; faster checkout</span>
                </div>
                <Link
                  href="/account"
                  className="shrink-0 rounded-[10px] border border-primary bg-card px-3 py-1.5 text-xs font-bold text-primary shadow-2xs hover:bg-surface min-h-[36px] flex items-center justify-center"
                >
                  Log In
                </Link>
              </div>
            )}

            {/* Error Message Box */}
            {errorMessage && (
              <div className="rounded-[14px] border border-danger/40 bg-surface p-3 text-xs text-danger flex items-start gap-2">
                <span className="text-danger text-sm font-bold">⚠️</span>
                <span className="flex-1 font-semibold">{errorMessage}</span>
              </div>
            )}

            {/* COD Limit Warning */}
            {isOverCodLimit && (
              <div className="rounded-[14px] border border-saffron bg-surface p-3 text-xs text-heading flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 font-extrabold text-heading">
                  <span>⚠️</span>
                  <span>Cash on Delivery Limit Exceeded</span>
                </div>
                <p className="text-muted leading-normal">
                  The maximum order limit for Cash on Delivery is {formatPaise(COD_MAX_LIMIT_PAISE)}. Your current total is{' '}
                  <strong>{formatPaise(cart.total_paise)}</strong>.
                </p>
                <Link
                  href="/cart"
                  className="font-bold text-primary underline mt-1"
                >
                  Return to Cart to adjust items &rarr;
                </Link>
              </div>
            )}

            {/* Contact Details Card */}
            <div className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-3">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <span>Contact Details</span>
              </h2>

              <div className="space-y-3">
                {/* Full Name */}
                <div>
                  <label htmlFor="checkout-name" className="block text-xs font-bold text-heading mb-1">
                    Full Name <span className="text-danger">*</span>
                  </label>
                  <input
                    id="checkout-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="E.g. Rahul Sharma"
                    className="w-full rounded-[12px] border border-border bg-card px-3 py-2.5 text-sm font-medium text-text placeholder-muted focus:border-primary focus:outline-hidden min-h-[44px]"
                  />
                </div>

                {/* Mobile Phone */}
                <div>
                  <label htmlFor="checkout-phone" className="block text-xs font-bold text-heading mb-1">
                    Mobile Number <span className="text-danger">*</span>
                  </label>
                  <div className="flex rounded-[12px] border border-border overflow-hidden focus-within:border-primary min-h-[44px]">
                    <span className="flex items-center bg-chip px-3 text-xs font-bold text-muted border-r border-border">
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
                      className="w-full bg-card px-3 py-2.5 text-sm font-medium text-text placeholder-muted focus:outline-hidden"
                    />
                  </div>
                  <span className="mt-1 block text-[11px] text-muted">
                    We will SMS order updates to this mobile number.
                  </span>
                </div>
              </div>
            </div>

            {/* Delivery Address Section matching checkout.png */}
            <div className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted">
                  Delivery Address
                </h2>
                {user && (
                  <Link
                    href="/account/addresses"
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    Change Address
                  </Link>
                )}
              </div>

              {/* Saved Addresses Picker */}
              {user && savedAddresses.length > 0 && (
                <div className="space-y-2">
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
                          className={`cursor-pointer rounded-[14px] border p-3 transition-all flex items-start gap-3 min-h-[44px] ${
                            isSelected
                              ? 'border-primary bg-surface shadow-2xs'
                              : 'border-border bg-card hover:bg-surface/50'
                          }`}
                        >
                          <div
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                              isSelected
                                ? 'border-primary bg-primary text-card'
                                : 'border-border bg-card'
                            }`}
                          >
                            {isSelected && <span className="text-[10px] leading-none">✓</span>}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-heading">
                                {addr.line1}
                              </span>
                              {addr.is_default && (
                                <span className="rounded-full bg-chip px-2 py-0.5 text-[9px] font-extrabold uppercase text-heading">
                                  Default
                                </span>
                              )}
                            </div>
                            {addr.landmark && (
                              <p className="text-[11px] text-muted mt-0.5">
                                Landmark: {addr.landmark}
                              </p>
                            )}
                            <p className="text-[11px] font-semibold text-primary mt-0.5">
                              Pincode {addr.pincode}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

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
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-1 py-1 min-h-[36px]"
                    >
                      {useCustomAddress ? '← Use a saved address above' : '+ Deliver to another address'}
                    </button>
                  </div>
                </div>
              )}

              {/* Manual Address Form */}
              {(useCustomAddress || !user || savedAddresses.length === 0) && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label htmlFor="checkout-address" className="block text-xs font-bold text-heading mb-1">
                      Delivery Address <span className="text-danger">*</span>
                    </label>
                    <textarea
                      id="checkout-address"
                      required={useCustomAddress || savedAddresses.length === 0}
                      rows={2}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Flat / House No., Building Name, Street"
                      className="w-full rounded-[12px] border border-border bg-card px-3 py-2 text-sm font-medium text-text placeholder-muted focus:border-primary focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label htmlFor="checkout-landmark" className="block text-xs font-bold text-heading mb-1">
                      Landmark <span className="text-muted font-normal">(Optional)</span>
                    </label>
                    <input
                      id="checkout-landmark"
                      type="text"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      placeholder="E.g. Near Poona Club / Opposite Market"
                      className="w-full rounded-[12px] border border-border bg-card px-3 py-2.5 text-sm font-medium text-text placeholder-muted focus:border-primary focus:outline-hidden min-h-[44px]"
                    />
                  </div>

                  <div>
                    <label htmlFor="checkout-pincode" className="block text-xs font-bold text-heading mb-1">
                      Delivery Pincode <span className="text-danger">*</span>
                    </label>
                    <input
                      id="checkout-pincode"
                      type="text"
                      inputMode="numeric"
                      required={useCustomAddress || savedAddresses.length === 0}
                      maxLength={6}
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="411038"
                      className="w-full rounded-[12px] border border-border bg-card px-3 py-2.5 text-sm font-medium text-text placeholder-muted focus:border-primary focus:outline-hidden min-h-[44px]"
                    />
                    {pincode !== SERVICEABLE_PINCODE ? (
                      <span className="mt-1 block text-[11px] font-semibold text-danger">
                        ⚠️ PlukIt currently only delivers to pincode {SERVICEABLE_PINCODE}.
                      </span>
                    ) : (
                      <span className="mt-1 block text-[11px] font-semibold text-primary">
                        ✓ Serviceable area: Pune ({SERVICEABLE_PINCODE})
                      </span>
                    )}
                  </div>

                  {user && (
                    <div className="pt-1">
                      {savedAddresses.length < 5 ? (
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={saveNewAddress}
                            onChange={(e) => setSaveNewAddress(e.target.checked)}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                          />
                          <span className="text-xs font-medium text-heading">
                            Save this address to my account for future orders
                          </span>
                        </label>
                      ) : (
                        <p className="text-[11px] text-muted">
                          ℹ️ Address book limit reached (5/5).
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Payment Method Section matching checkout.png */}
            <div className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted">
                  Payment Method
                </h2>
                <span className="text-[11px] font-extrabold text-primary bg-chip px-2 py-0.5 rounded-full">
                  0% Fee via UPI
                </span>
              </div>

              <div className="space-y-2.5">
                {/* 1. UPI Payment Option */}
                <div
                  onClick={() => setPaymentMethod('UPI')}
                  className={`cursor-pointer rounded-[14px] border p-3.5 transition-all flex items-start gap-3 ${
                    paymentMethod === 'UPI'
                      ? 'border-primary bg-surface shadow-2xs'
                      : 'border-border bg-card hover:bg-surface/50'
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border text-xs font-bold shrink-0 ${
                      paymentMethod === 'UPI'
                        ? 'border-primary bg-primary text-card'
                        : 'border-border bg-card text-transparent'
                    }`}
                  >
                    ✓
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-heading">UPI Options</span>
                      </div>
                      <span className="text-primary text-sm font-bold">✓</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      GPay, PhonePe, Paytm, QR. Safe and secure.
                    </p>
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
                  className={`rounded-[14px] border p-3.5 transition-all flex items-start gap-3 ${
                    isOverCodLimit
                      ? 'border-border bg-chip opacity-60 cursor-not-allowed'
                      : paymentMethod === 'COD'
                      ? 'border-primary bg-surface shadow-2xs cursor-pointer'
                      : 'border-border bg-card hover:bg-surface/50 cursor-pointer'
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border text-xs font-bold shrink-0 ${
                      paymentMethod === 'COD'
                        ? 'border-primary bg-primary text-card'
                        : 'border-border bg-card text-transparent'
                    }`}
                  >
                    ✓
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="text-sm font-bold text-heading">Cash / UPI on Delivery</span>
                      <span className="rounded-full bg-chip px-2 py-0.5 text-[10px] font-bold text-muted">
                        Max ₹1,000
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      Society gate payment accepted via cash or partner QR.
                    </p>
                  </div>
                </div>

                {/* 3. Debit / Credit Card Option matching checkout.png */}
                <div
                  className="rounded-[14px] border border-border bg-card p-3.5 opacity-60 cursor-not-allowed flex items-start gap-3"
                >
                  <div className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="text-sm font-bold text-heading">Debit / Credit Card &amp; Netbanking</span>
                      <span className="rounded-full bg-chip px-2 py-0.5 text-[9px] font-bold text-muted">
                        Cards paused
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      All major Indian banks &amp; Rupay (use UPI for fast dispatch)
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bill Summary matching checkout.png */}
            <div className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted">
                  Bill Summary
                </h3>
                <span className="text-xs text-muted font-bold">
                  {cart.items.length} {cart.items.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              <div className="space-y-2 text-xs font-semibold text-muted">
                <div className="flex justify-between">
                  <span>Item Total ({cart.items.length} items)</span>
                  <span className="text-heading font-bold">
                    {formatPaise(cart.subtotal_paise)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>Delivery Fee</span>
                  <span className="font-extrabold text-primary">
                    {cart.delivery_fee_paise === 0 ? 'FREE' : formatPaise(cart.delivery_fee_paise)}
                  </span>
                </div>

                <div className="border-t border-border/50 pt-2.5 flex justify-between text-base font-black text-heading">
                  <div>
                    <span>To Pay</span>
                    <span className="block text-[10px] font-normal text-muted">
                      Inclusive of all local taxes
                    </span>
                  </div>
                  <span className="text-lg">
                    {formatPaise(cart.total_paise)}
                  </span>
                </div>
              </div>
            </div>

            {/* Quality Note matching checkout.png */}
            <div className="flex items-center gap-2.5 rounded-[14px] border border-border bg-surface p-3 text-xs text-muted shadow-2xs">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-card border border-border text-primary">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="leading-snug">
                Handpicked fresh from your trusted neighbourhood kirana. Zero questions return at your doorstep.
              </span>
            </div>

            {/* Fixed Sticky Proceed to Pay Bar above BottomNav */}
            <div
              style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
              className="fixed left-0 right-0 z-40 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-md shadow-sm"
            >
              <div className="mx-auto flex max-w-md items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-extrabold uppercase text-muted">Total Payable</span>
                  <span className="text-lg font-black text-heading">
                    {formatPaise(cart.total_paise)}
                  </span>
                </div>
                <div className="flex-1 max-w-[220px]">
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    fullWidth
                    disabled={submitting || (paymentMethod === 'COD' && !!isOverCodLimit)}
                    className="min-h-[44px]"
                  >
                    {submitting ? 'Placing Order...' : `Proceed to Pay ${formatPaise(cart.total_paise)} \u2192`}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Razorpay Test Payment Simulation Modal (F16 Test Mode) */}
        {testModalData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-heading/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-[20px] bg-card p-5 shadow-2xl border border-border space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚡</span>
                  <div>
                    <h3 className="text-sm font-extrabold text-heading leading-tight">
                      Razorpay Test Mode
                    </h3>
                    <span className="text-[10px] font-extrabold text-primary uppercase tracking-wider">
                      UPI Only (0% Commission)
                    </span>
                  </div>
                </div>
                <span className="rounded-full bg-chip px-2.5 py-0.5 text-[10px] font-extrabold text-heading uppercase">
                  Simulation
                </span>
              </div>

              <div className="text-center bg-surface rounded-[14px] p-3 border border-border">
                <span className="text-xs text-muted block">Total Amount</span>
                <span className="text-2xl font-black text-heading">
                  {formatPaise(testModalData.amountPaise)}
                </span>
                <span className="text-[11px] font-mono font-bold text-muted block mt-0.5">
                  Order #{testModalData.orderNumber}
                </span>
              </div>

              <div className="space-y-2">
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  disabled={simulating}
                  onClick={handleSimulateUpiSuccess}
                >
                  {simulating ? 'Processing...' : 'Simulate UPI Payment Success'}
                </Button>

                <Button
                  type="button"
                  variant="dangerOutline"
                  fullWidth
                  disabled={simulating}
                  onClick={handleSimulateUpiFailure}
                >
                  Simulate Payment Failure
                </Button>

                <button
                  type="button"
                  disabled={simulating}
                  onClick={handleSimulateUpiFailure}
                  className="w-full py-1 text-center text-xs font-semibold text-muted hover:text-heading"
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

