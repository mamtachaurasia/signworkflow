'use client';

import { BadgeIndianRupee, ExternalLink, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@ui';
import useContextStore from '@/hooks/useContextStore';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { getRequiredTierLabelForFeature } from '@/lib/subscription-plans';

export default function PaymentServices() {
  const { documents, setDocuments } = useContextStore();
  const { status: subscriptionStatus, loading } = useSubscriptionStatus({ enabled: true });

  const canUsePaymentRequests = loading ? true : subscriptionStatus.entitlements.paymentRequests;
  const paymentDocuments = documents
    .filter((document) => !document.deletedAt && document.paymentRequest?.enabled)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  const handleOpenLink = (paymentLinkUrl?: string) => {
    if (!paymentLinkUrl) {
      toast.error('No payment link is attached to this request yet.');
      return;
    }
    window.open(paymentLinkUrl, '_blank', 'noopener,noreferrer');
  };

  const handleStatusChange = async (documentId: string, status: 'pending' | 'paid') => {
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/payment-request`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || 'Unable to update payment status');
      }

      setDocuments((prev) =>
        prev.map((document) =>
          (document.documentId || document.id) === documentId
            ? {
                ...document,
                paymentRequest: document.paymentRequest
                  ? {
                      ...document.paymentRequest,
                      status,
                      paidAt: status === 'paid' ? new Date().toISOString() : null,
                    }
                  : document.paymentRequest,
              }
            : document
        )
      );
      toast.success(status === 'paid' ? 'Payment marked as paid.' : 'Payment moved back to pending.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update payment status');
    }
  };

  if (!canUsePaymentRequests) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="text-sm font-medium text-slate-900">Payment services</div>
        <p className="mt-2 text-sm text-slate-600">
          {getRequiredTierLabelForFeature('payment_requests')} is required to attach payment requests to
          signing flows.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-linear-to-br from-orange-50 via-white to-amber-50 p-6 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase  text-orange-700">
              <Wallet className="h-4 w-4" />
              Payment Requests
            </div>
            <h1 className="mt-4 text-2xl font-semibold text-slate-900">Request payments and signatures in one flow</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Business Plus workspaces can attach an external payment link to a signing request so recipients
              can review the document and complete payment from the same workflow.
            </p>
          </div>
          <div className="rounded-xl border border-orange-100 bg-white/90 p-4 text-sm shadow-xs">
            <div className="text-xs uppercase text-slate-500">Active payment requests</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{paymentDocuments.length}</div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <BadgeIndianRupee className="mt-0.5 h-5 w-5 text-orange-600" />
          <div>
            <div className="font-medium text-slate-900">How this works</div>
            <p className="mt-1">
              Add a payment link while sending a document. We include that link in the signer email and
              on the signing page so recipients can move from signature to payment without leaving the flow.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-lg font-semibold text-slate-900">Recent requests</h2>
        <p className="mt-1 text-sm text-slate-600">
          Track which documents currently include payment links and reopen those links when needed.
        </p>

        {paymentDocuments.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
            No payment requests have been attached to documents yet.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {paymentDocuments.map((document) => (
              <div
                key={document.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 px-4 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-medium text-slate-900">{document.name}</div>
                  <div className="mt-1 text-sm text-slate-500">
                    {document.paymentRequest?.currency || 'INR'}{' '}
                    {Number(document.paymentRequest?.amount || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    {document.paymentRequest?.description ? ` • ${document.paymentRequest.description}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      document.paymentRequest?.status === 'paid'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-orange-100 text-orange-700'
                    }`}
                  >
                    {document.paymentRequest?.status || 'pending'}
                  </span>
                  <Button size="sm"
                    type="button"
                    onClick={() => handleOpenLink(document.paymentRequest?.paymentLinkUrl)}
                    icon={<ExternalLink className="h-4 w-4" />}
                  >
                    Open payment link
                  </Button>
                  <Button size="sm"
                    type="button"
                    inverted={document.paymentRequest?.status === 'paid'}
                    onClick={() =>
                      handleStatusChange(
                        document.documentId || document.id,
                        document.paymentRequest?.status === 'paid' ? 'pending' : 'paid'
                      )
                    }
                  >
                    {document.paymentRequest?.status === 'paid' ? 'Mark pending' : 'Mark paid'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
