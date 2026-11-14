// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PayPalCardCheckoutModal from '@/components/account/PayPalCardCheckoutModal';

vi.mock('@ui', () => ({
  Button: ({
    children,
    onClick,
    type = 'button',
  }: {
    children: ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit' | 'reset';
  }) => (
    <button type={type} onClick={onClick}>
      {children}
    </button>
  ),
  Input: ({
    id,
    label,
    value,
    onChange,
    placeholder,
    type = 'text',
    error,
    hint,
    readOnly,
  }: {
    id?: string;
    label?: ReactNode;
    value?: string;
    onChange?: (event: { target: { value: string } }) => void;
    placeholder?: string;
    type?: string;
    error?: ReactNode;
    hint?: ReactNode;
    readOnly?: boolean;
  }) => (
    <div>
      {label ? <label htmlFor={id}>{label}</label> : null}
      <input
        id={id}
        value={value}
        onChange={(event) => onChange?.({ target: { value: event.target.value } })}
        placeholder={placeholder}
        type={type}
        readOnly={readOnly}
      />
      {hint ? <p>{hint}</p> : null}
      {error ? <p>{error}</p> : null}
    </div>
  ),
  Loader: ({ text }: { text?: ReactNode }) => <div>{text}</div>,
  Modal: ({
    open,
    title,
    description,
    children,
  }: {
    open?: boolean;
    title?: ReactNode;
    description?: ReactNode;
    children: ReactNode;
  }) =>
    open ? (
      <div>
        {title ? <h2>{title}</h2> : null}
        {description ? <p>{description}</p> : null}
        {children}
      </div>
    ) : null,
}));

vi.mock('@/lib/subscription-client', () => ({
  createPayPalCardOrder: vi.fn(),
  createPayPalCheckoutOrder: vi.fn(),
  completePayPalCardCheckout: vi.fn(),
}));

describe('PayPalCardCheckoutModal', () => {
  beforeEach(() => {
    window.paypal = {
      Buttons: vi.fn(() => ({
        render: async (element: HTMLElement) => {
          element.innerHTML =
            '<button type="button">Pay with PayPal</button><button type="button">Debit or Credit Card</button>';
        },
        close: vi.fn(),
      })),
    };
  });

  afterEach(() => {
    delete window.paypal;
  });

  const checkout = {
    provider: 'paypal' as const,
    flow: 'card_fields' as const,
    checkoutSessionId: 'ppchk_123',
    customerEmail: 'owner@example.com',
    targetPlan: 'business' as const,
    billingCycle: 'monthly' as const,
    billingMarket: 'international' as const,
    amount: '7.00',
    currencyCode: 'USD' as const,
    sdkClientId: 'paypal-client-id',
    description: 'Business subscription',
    planLabel: 'Business',
    organizationId: 'org_123',
  };

  it('uses the checkout session email when no customerEmail prop is passed', () => {
    render(
      <PayPalCardCheckoutModal
        open
        checkout={checkout}
        onOpenChange={vi.fn()}
        onComplete={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Email Address')).toHaveValue('owner@example.com');
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('readonly');
  });

  it('shows account details as read-only fields', () => {
    render(
      <PayPalCardCheckoutModal
        open
        checkout={checkout}
        customerName="Raj Kumar"
        customerEmail="raj@example.com"
        onOpenChange={vi.fn()}
        onComplete={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Full Name')).toHaveValue('Raj Kumar');
    expect(screen.getByLabelText('Full Name')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Email Address')).toHaveValue('raj@example.com');
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('readonly');
  });

  it('shows the project-style PayPal payment step after continuing', async () => {
    render(
      <PayPalCardCheckoutModal
        open
        checkout={checkout}
        customerName="Raj Kumar"
        onOpenChange={vi.fn()}
        onComplete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));

    expect(screen.getByRole('heading', { name: 'Complete Payment' })).toBeInTheDocument();
    expect(screen.getByText('Business · Monthly · $7.00/user/mo')).toBeInTheDocument();
    await waitFor(() => {
      expect(window.paypal?.Buttons).toHaveBeenCalledTimes(2);
    });
    expect(window.paypal?.Buttons).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ fundingSource: 'paypal' })
    );
    expect(window.paypal?.Buttons).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ fundingSource: 'card' })
    );
    expect(
      screen.getByText(
        'Pay with your PayPal account or debit/credit card — no PayPal account required.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Encrypted connection')).toBeInTheDocument();
    expect(screen.getByText('Secured by PayPal')).toBeInTheDocument();
  });

  it('validates the customer form before opening the payment step', () => {
    render(
      <PayPalCardCheckoutModal
        open
        checkout={{ ...checkout, customerEmail: undefined }}
        onOpenChange={vi.fn()}
        onComplete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));

    expect(screen.getByText('Full name is missing from your account profile.')).toBeInTheDocument();
    expect(screen.getByText('Email address is missing from your account.')).toBeInTheDocument();
  });
});
