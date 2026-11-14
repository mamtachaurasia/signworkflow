'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import { Input } from '@ui';
import { Textarea } from '@ui';
import { Modal } from '@ui';
import { getCsrfHeaders } from '@/utils/cookies';
import type { Template } from '@/hooks/useTemplates';

type Props = {
  isOpen: boolean;
  template: Template | null;
  onClose: () => void;
};

type ParsedRecipientRow = {
  name: string;
  email: string;
};

function parseRecipientRows(input: string): ParsedRecipientRow[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, email] = line.split(',').map((value) => value.trim());
      return { name, email };
    })
    .filter((row) => row.name && row.email);
}

export default function BulkSendTemplateModal({ isOpen, template, onClose }: Props) {
  const [rowsInput, setRowsInput] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sendReminders, setSendReminders] = useState(true);
  const [reminderDays, setReminderDays] = useState(3);
  const [hasExpiry, setHasExpiry] = useState(true);
  const [expiryDays, setExpiryDays] = useState(30);
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDescription, setPaymentDescription] = useState('');
  const [paymentLinkUrl, setPaymentLinkUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedRows = useMemo(() => parseRecipientRows(rowsInput), [rowsInput]);

  const resetState = () => {
    setRowsInput('');
    setSubject('');
    setMessage('');
    setSendReminders(true);
    setReminderDays(3);
    setHasExpiry(true);
    setExpiryDays(30);
    setPaymentEnabled(false);
    setPaymentAmount('');
    setPaymentDescription('');
    setPaymentLinkUrl('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSubmit = async () => {
    if (!template) return;
    if (parsedRows.length === 0) {
      toast.error('Paste at least one recipient row using "Name, email" format.');
      return;
    }
    if (paymentEnabled && (!paymentLinkUrl.trim() || !paymentAmount.trim())) {
      toast.error('Payment amount and payment link are required when payment requests are enabled.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/templates/bulk-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          templateId: template._id,
          recipients: parsedRows,
          subject: subject.trim() || undefined,
          message: message.trim() || undefined,
          sendReminders,
          reminderDays: sendReminders ? reminderDays : undefined,
          hasExpiry,
          expiryDays: hasExpiry ? expiryDays : undefined,
          paymentRequest: paymentEnabled
            ? {
                enabled: true,
                amount: Number(paymentAmount),
                currency: 'INR',
                description: paymentDescription.trim() || undefined,
                paymentLinkUrl: paymentLinkUrl.trim(),
              }
            : undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || 'Bulk send failed');
      }

      const sentCount = Number(payload?.sentCount || 0);
      const failedCount = Number(payload?.failedCount || 0);
      if (failedCount > 0) {
        toast.error(`Bulk send completed with ${failedCount} failure(s). ${sentCount} request(s) were sent.`);
      } else {
        toast.success(`Bulk send completed. ${sentCount} signing request(s) were sent.`);
      }
      handleClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bulk send failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !template) return null;

  return (
    <Modal
      visible={isOpen}
      onClose={handleClose}
      handleCancel={handleClose}
      handleConfirm={handleSubmit}
      cancelLabel="Cancel"
      confirmLabel={isSubmitting ? 'Sending...' : 'Send in Bulk'}
      confirmDisabled={isSubmitting}
      cancelDisabled={isSubmitting}
      title={`Bulk Send · ${template.name}`}
      className="w-190"
    >
      <div className="space-y-5 p-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Paste one recipient per line using <span className="font-medium text-slate-900">Name, email</span>.
          This flow supports one variable signer or approver from each row, plus any fixed recipients already
          stored on the template.
        </div>

        <div>
          <Textarea
            value={rowsInput}
            onChange={(event) => setRowsInput(event.target.value)}
            label="Recipients"
            rows={10}
            placeholder={`Asha Mehta, asha@example.com\nRahul Jain, rahul@example.com`}
            className="rounded-2xl border-slate-200 px-4 py-3 text-sm focus:border-brand-500"
          />
          <div className="mt-2 text-xs text-slate-500">{parsedRows.length} valid row(s) detected</div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-900">Email subject</label>
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Optional custom subject"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-900">Message</label>
            <Input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Optional custom message"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sendReminders}
                onChange={(event) => setSendReminders(event.target.checked)}
              />
              Automatic reminders
            </div>
            {sendReminders && (
              <div className="mt-3 flex items-center gap-2">
                <span>Every</span>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={reminderDays}
                  onChange={(event) => setReminderDays(Number(event.target.value) || 1)}

                />
                <span>days</span>
              </div>
            )}
          </label>

          <label className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={hasExpiry}
                onChange={(event) => setHasExpiry(event.target.checked)}
              />
              Link expiry
            </div>
            {hasExpiry && (
              <div className="mt-3 flex items-center gap-2">
                <span>After</span>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={expiryDays}
                  onChange={(event) => setExpiryDays(Number(event.target.value) || 1)}
                />
                <span>days</span>
              </div>
            )}
          </label>

          <label className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-slate-700">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={paymentEnabled}
                onChange={(event) => setPaymentEnabled(event.target.checked)}
              />
              Attach payment link
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Add one payment link to each signing request in this batch.
            </div>
          </label>
        </div>

        {paymentEnabled && (
          <div className="grid gap-4 rounded-xl border border-orange-200 bg-orange-50 p-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-900">Amount</label>
              <Input
                type="number"
                min={1}
                step="0.01"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                placeholder="2500"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-900">Payment link URL</label>
              <Input
                value={paymentLinkUrl}
                onChange={(event) => setPaymentLinkUrl(event.target.value)}
                placeholder="https://rzp.io/..."
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-900">Description</label>
              <Input
                value={paymentDescription}
                onChange={(event) => setPaymentDescription(event.target.value)}
                placeholder="Deposit due on signature"
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
