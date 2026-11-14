'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Shield } from 'lucide-react';

import { Button, Input, Loader, Modal } from '@ui';
import type { PayPalCardCheckoutSession } from '@/lib/billing';
import {
  PRICING_PLANS,
  formatPlanCurrencyValue,
  getAnnualSavingsPercent,
  getPlanPriceValue,
} from '@/lib/pricing';
import {
  completePayPalCardCheckout,
  createPayPalCheckoutOrder,
} from '@/lib/subscription-client';

type PaymentStep = 'info' | 'payment';
type CustomerDraft = {
  name: string;
  email: string;
};
type CustomerErrors = Partial<Record<keyof CustomerDraft, string>>;
type PayPalFundingSource = 'paypal' | 'card';

type PayPalButtonsInstance = {
  isEligible?: () => boolean;
  render: (element: HTMLElement) => Promise<void> | void;
  close?: () => void;
};

type PayPalButtonsConfig = {
  fundingSource?: PayPalFundingSource;
  style?: Record<string, unknown>;
  createOrder: () => Promise<string> | string;
  onApprove: (data: { orderID: string }) => Promise<void> | void;
  onCancel?: () => Promise<void> | void;
  onError?: (error: unknown) => void;
};

declare global {
  interface Window {
    paypal?: {
      Buttons: (config: PayPalButtonsConfig) => PayPalButtonsInstance;
    };
  }
}

let paypalSdkPromise: Promise<void> | null = null;

function getPayPalSdkUrl(checkout: PayPalCardCheckoutSession) {
  const params = new URLSearchParams({
    'client-id': checkout.sdkClientId,
    currency: checkout.currencyCode,
    intent: 'capture',
    components: 'buttons',
    'enable-funding': 'card',
    'disable-funding': 'paylater',
  });

  return `https://www.paypal.com/sdk/js?${params.toString()}`;
}

function loadPayPalSdk(checkout: PayPalCardCheckoutSession) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('PayPal checkout is only available in the browser.'));
  }

  if (window.paypal?.Buttons) {
    return Promise.resolve();
  }

  const scriptId = 'paypal-smart-buttons-sdk';
  const sdkUrl = getPayPalSdkUrl(checkout);

  if (!paypalSdkPromise) {
    paypalSdkPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

      if (existingScript) {
        if (existingScript.dataset.sdkSrc !== sdkUrl) {
          existingScript.remove();
        } else {
          existingScript.addEventListener('load', () => resolve(), { once: true });
          existingScript.addEventListener(
            'error',
            () => reject(new Error('Failed to load PayPal.')),
            { once: true }
          );

          if (window.paypal?.Buttons) {
            resolve();
          }
          return;
        }
      }

      const script = document.createElement('script');
      script.id = scriptId;
      script.src = sdkUrl;
      script.async = true;
      script.dataset.sdkSrc = sdkUrl;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load PayPal.'));
      document.head.appendChild(script);
    }).catch((error) => {
      paypalSdkPromise = null;
      throw error;
    });
  }

  return paypalSdkPromise;
}

function formatCycleLabel(billingCycle: PayPalCardCheckoutSession['billingCycle']) {
  return billingCycle === 'annually' ? 'Annual' : 'Monthly';
}

function formatChargeLabel(checkout: PayPalCardCheckoutSession) {
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: checkout.currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(checkout.amount));

  return checkout.billingCycle === 'annually' ? `${amount}/user/year` : `${amount}/user/mo`;
}

function getAnnualBillingSupportCopy(checkout: PayPalCardCheckoutSession) {
  if (checkout.billingCycle !== 'annually') {
    return null;
  }

  const pricingPlan = PRICING_PLANS.find((plan) => plan.id === checkout.targetPlan);
  if (!pricingPlan) {
    return null;
  }

  const equivalentMonthlyValue = getPlanPriceValue(
    pricingPlan,
    'annually',
    checkout.billingMarket
  );
  const savingsPercent = getAnnualSavingsPercent(pricingPlan, checkout.billingMarket);

  if (equivalentMonthlyValue === null) {
    return null;
  }

  const equivalentMonthlyLabel = `${formatPlanCurrencyValue(
    pricingPlan,
    checkout.billingMarket,
    equivalentMonthlyValue
  )}/user/mo`;

  if (!savingsPercent) {
    return `Equivalent to ${equivalentMonthlyLabel} with annual billing.`;
  }

  return `Equivalent to ${equivalentMonthlyLabel}. Save ${savingsPercent}% with annual billing.`;
}

function buildInitialCustomer(args: {
  checkout: PayPalCardCheckoutSession | null;
  customerName?: string | null;
  customerEmail?: string | null;
}): CustomerDraft {
  return {
    name: args.customerName?.trim() || '',
    email: args.customerEmail?.trim() || args.checkout?.customerEmail?.trim() || '',
  };
}

type PayPalCardCheckoutModalProps = {
  checkout: PayPalCardCheckoutSession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (
    result: Awaited<ReturnType<typeof completePayPalCardCheckout>>
  ) => Promise<void> | void;
  onCancel?: () => Promise<void> | void;
  customerName?: string | null;
  customerEmail?: string | null;
};

export default function PayPalCardCheckoutModal({
  checkout,
  open,
  onOpenChange,
  onComplete,
  onCancel,
  customerName,
  customerEmail,
}: PayPalCardCheckoutModalProps) {
  const [step, setStep] = useState<PaymentStep>('info');
  const [errors, setErrors] = useState<CustomerErrors>({});
  const [paypalLoading, setPaypalLoading] = useState(false);
  const [paypalError, setPaypalError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const paypalWalletContainerRef = useRef<HTMLDivElement | null>(null);
  const paypalCardContainerRef = useRef<HTMLDivElement | null>(null);
  const paypalButtonsRef = useRef<PayPalButtonsInstance[]>([]);
  const dismissingRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  const customer = useMemo(
    () =>
      buildInitialCustomer({
        checkout,
        customerName,
        customerEmail,
      }),
    [checkout, customerEmail, customerName]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setStep('info');
    setErrors({});
    setPaypalError(null);
    setPaypalLoading(false);
    setProcessing(false);
  }, [open]);

  useEffect(() => {
    if (!open || !checkout || step !== 'payment') {
      return;
    }

    const activeCheckout = checkout;
    let cancelled = false;

    async function renderSmartButton(args: {
      fundingSource: PayPalFundingSource;
      container: HTMLDivElement | null;
    }) {
      if (!args.container || !window.paypal?.Buttons) {
        return false;
      }

      args.container.innerHTML = '';

      const buttons = window.paypal.Buttons({
        fundingSource: args.fundingSource,
        style: {
          layout: 'vertical',
          shape: 'rect',
          label: 'pay',
          height: 55,
          tagline: false,
        },
        createOrder: async () => {
          const { orderId } = await createPayPalCheckoutOrder(activeCheckout, args.fundingSource);
          return orderId;
        },
        onApprove: async ({ orderID }) => {
          setProcessing(true);
          setPaypalError(null);
          try {
            const result = await completePayPalCardCheckout({
              orderId: orderID,
              checkoutSessionId: activeCheckout.checkoutSessionId,
            });
            await onCompleteRef.current(result);
            onOpenChange(false);
          } catch (error) {
            setPaypalError(
              error instanceof Error ? error.message : 'Unable to complete PayPal checkout.'
            );
          } finally {
            setProcessing(false);
          }
        },
        onCancel: async () => {
          setProcessing(false);
          setPaypalError('Checkout was cancelled. Your current workspace plan did not change.');
          try {
            await onCancelRef.current?.();
          } finally {
            onOpenChange(false);
          }
        },
        onError: (error) => {
          setProcessing(false);
          setPaypalError(
            error instanceof Error ? error.message : 'Payment failed. Please try again.'
          );
        },
      });

      if (buttons.isEligible && !buttons.isEligible()) {
        buttons.close?.();
        return false;
      }

      paypalButtonsRef.current.push(buttons);
      await buttons.render(args.container);
      return true;
    }

    async function renderPayPalButtons() {
      setPaypalLoading(true);
      setPaypalError(null);

      try {
        await loadPayPalSdk(activeCheckout);
        if (cancelled) {
          return;
        }

        paypalButtonsRef.current.forEach((buttons) => buttons.close?.());
        paypalButtonsRef.current = [];

        const walletRendered = await renderSmartButton({
          fundingSource: 'paypal',
          container: paypalWalletContainerRef.current,
        });
        const cardRendered = await renderSmartButton({
          fundingSource: 'card',
          container: paypalCardContainerRef.current,
        });

        if (!walletRendered && !cardRendered) {
          throw new Error('PayPal checkout is unavailable for this account right now.');
        }

        if (!cancelled) {
          setPaypalLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setPaypalLoading(false);
          setPaypalError(error instanceof Error ? error.message : 'Failed to load PayPal.');
        }
      }
    }

    void renderPayPalButtons();

    return () => {
      cancelled = true;
      paypalButtonsRef.current.forEach((buttons) => buttons.close?.());
      paypalButtonsRef.current = [];
    };
  }, [checkout, onOpenChange, open, step]);

  if (!open || !checkout) {
    return null;
  }

  const activeCheckout = checkout;
  const cycleLabel = formatCycleLabel(activeCheckout.billingCycle);
  const chargeLabel = formatChargeLabel(activeCheckout);
  const annualBillingSupportCopy = getAnnualBillingSupportCopy(activeCheckout);

  function validate() {
    const nextErrors: CustomerErrors = {};

    if (!customer.name.trim()) {
      nextErrors.name = 'Full name is missing from your account profile.';
    }

    if (!customer.email.trim()) {
      nextErrors.email = 'Email address is missing from your account.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
      nextErrors.email = 'Your account email address is invalid.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleContinue() {
    if (!validate()) {
      return;
    }

    setStep('payment');
  }

  async function handleDismiss() {
    if (dismissingRef.current || processing) {
      return;
    }

    dismissingRef.current = true;

    try {
      await onCancelRef.current?.();
    } finally {
      dismissingRef.current = false;
      onOpenChange(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true);
          return;
        }
        void handleDismiss();
      }}
      title={step === 'info' ? 'Your Information' : 'Complete Payment'}
      description={
        <span className="text-[16px] text-slate-500">
          {checkout.planLabel} · {cycleLabel} · {chargeLabel}
        </span>
      }
   
      showCloseButton={!processing}
      closeOnBackdrop={false}
      closeOnEsc={false}
    >
      
        {step === 'info' ? (
          <div className="space-y-5">
            <div>
              <Input
                id="paypal-customer-name"
                label="Full Name"
                type="text"
                value={customer.name}
                readOnly
                error={errors.name}
                className="h-12 rounded-xl px-4 text-sm"
                labelClassName="mb-1.5 block text-sm font-medium text-slate-700"
              />
            </div>

            <div>
              <Input
                id="paypal-customer-email"
                label="Email Address"
                type="email"
                value={customer.email}
                readOnly
                error={errors.email}
                className="h-12 rounded-xl px-4 text-sm"
                labelClassName="mb-1.5 block text-sm font-medium text-slate-700"
              />
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>
                  {checkout.planLabel} ({cycleLabel})
                </span>
                <span className="font-semibold text-slate-900">{chargeLabel}</span>
              </div>
              <div className="mt-3 border-t border-slate-200 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">Total due today</span>
                  <span className="text-base font-bold text-slate-900">
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: checkout.currencyCode,
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(Number(checkout.amount))}
                  </span>
                </div>
              </div>
              {annualBillingSupportCopy ? (
                <p className="mt-3 text-xs font-medium text-emerald-700">
                  {annualBillingSupportCopy}
                </p>
              ) : null}
            </div>

            <Button
              type="button"
              variant="brand"
              size="lg"
              className="w-full rounded-xl"
              onClick={handleContinue}
            >
              Continue to payment
            </Button>
          </div>
        ) : processing ? (
          <Loader text="Processing your payment..." className="py-12" size={32} />
        ) : (
          <>
            {paypalError ? (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {paypalError}
              </div>
            ) : null}
            {paypalLoading ? (
              <Loader text="Loading secure PayPal checkout..." className="py-6" size={28} />
            ) : null}

            <div ref={paypalWalletContainerRef} className={paypalLoading ? 'hidden' : 'px-4 pb-3 pt-2'} />
            <div ref={paypalCardContainerRef} className={paypalLoading ? 'hidden' : 'px-4 pb-2'} />

            <p className="mt-6 text-center text-xs m-auto w-3/5">
              Pay with your PayPal account or debit/credit card — no PayPal account required.
            </p>
          </>
        )}
     

      <div className="flex items-center justify-center gap-4 border-t border-slate-100 px-6 py-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Lock className="h-3.5 w-3.5" />
          <span>Encrypted connection</span>
        </div>
        <div className="h-3 w-px bg-slate-200" />
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Shield className="h-3.5 w-3.5" />
          <span>Secured by PayPal</span>
        </div>
      </div>
    </Modal>
  );
}
