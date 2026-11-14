'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Clock, AlertCircle, MapPin, Wallet, LoaderCircle } from 'lucide-react';
import { getFieldTypeFromComponentLabel } from '@/lib/api';
import { DocumentField, DroppedComponent, Recipient } from '@/types/types';
import toast from 'react-hot-toast';
import { Input } from '@ui';
import { Textarea } from '@ui';
import ToggleSwitch from '../forms/ToggleSwitch';
import { Modal } from '@ui';
import RecipientsList from './RecipientsList';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import useContextStore from '@/hooks/useContextStore';
import { buildEffectiveUserSettings } from '@/lib/workspace-settings';
import { isAdminRole } from '@/lib/role-utils';
import { Select } from '@ui';
import { getCookieValue } from '@/utils/cookies';
import { getRecipientIdentityError } from '@/lib/recipient-readiness';

interface SendDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipients: Recipient[];
  fields?: DroppedComponent[];
  serializeFields: () => DocumentField[];
  documentName: string;
  documentId?: string | null;
  onSendComplete?: (payload: { recipients: Recipient[]; signingMode: 'sequential' | 'parallel' }) => void;
  setRecipients?: (recipients: Recipient[]) => void;
}

interface SendForSigningResponse {
  message?: string;
  signingMode?: 'sequential' | 'parallel';
  emailDelivery?: {
    attempted?: number;
    delivered?: number;
    failed?: number;
  };
}

type TeamOption = {
  id: string;
  name: string;
  memberCount: number;
  members?: Array<{ userId: string }>;
};

const defaultValueCapableComponents = new Set(['Text', 'Full Name', 'Email', 'Date', 'Dropdown', 'Radio']);

const resolvePreparedFieldValue = (field: DroppedComponent): string => {
  const currentValue = field.data === null || field.data === undefined ? '' : String(field.data);
  const configuredDefault = String(field.settings?.defaultValue || '').trim();
  const isRecipientDateField =
    field.component === 'Date' && (field.fieldOwner ?? 'recipients') === 'recipients';
  const shouldApplyDefault =
    defaultValueCapableComponents.has(field.component) &&
    !isRecipientDateField &&
    configuredDefault.length > 0 &&
    currentValue.length === 0;

  return shouldApplyDefault ? configuredDefault : currentValue;
};

const isValidPaymentUrl = (value: string): boolean => {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

const SendDocumentModal: React.FC<SendDocumentModalProps> = ({
  isOpen,
  onClose,
  recipients,
  fields = [],
  serializeFields,
  setRecipients,
  documentName,
  documentId,
  onSendComplete,
}) => {
  const { user } = useContextStore();
  const [isSending, setIsSending] = useState(false);
  const [subject, setSubject] = useState(`Signature Request – ${documentName}`);
  const [message, setMessage] = useState(`You have been requested to review and sign the following document:\n\n ${documentName}`);
  const [sendReminders, setSendReminders] = useState(true);
  const [reminderDays, setReminderDays] = useState(3);
  const [expiryDays, setExpiryDays] = useState(30);
  const [hasExpiry, setHasExpiry] = useState(true);
  const [captureGps, setCaptureGps] = useState(false);
  const [sequential, setSequential] = useState(false);
  const [paymentRequestEnabled, setPaymentRequestEnabled] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentLinkUrl, setPaymentLinkUrl] = useState('');
  const [paymentDescription, setPaymentDescription] = useState('');
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamId, setTeamId] = useState('');
  const defaultsAppliedRef = useRef(false);
  const { settings: userSettings } = useUserSettings({
    enabled: isOpen && Boolean(user?.id),
    accountKey: user?.id ?? null,
  });
  const { status: subscriptionStatus } = useSubscriptionStatus({ enabled: isOpen });
  const { settings: workspaceSettings } = useWorkspaceSettings({
    enabled: isOpen && Boolean(user?.orgId),
    orgId: user?.orgId ?? null,
  });
  const effectiveUserSettings = useMemo(
    () =>
      buildEffectiveUserSettings({
        userSettings,
        organizationSettings: workspaceSettings,
      }),
    [userSettings, workspaceSettings]
  );
  const actionableRecipients = useMemo(
    () => recipients.filter((recipient) => recipient.role !== 'viewer' && !recipient.isCC),
    [recipients]
  );
  const sequentialAllowed = actionableRecipients.length > 1;
  const fieldStats = useMemo(() => {
    const stats: Record<string, { total: number; required: number }> = {};
    fields.forEach((field) => {
      if (field.fieldOwner === 'me') return;
      const assignedRecipientId = field.assignedRecipientId?.trim();
      if (!assignedRecipientId) return;
      if (!stats[assignedRecipientId]) {
        stats[assignedRecipientId] = { total: 0, required: 0 };
      }
      stats[assignedRecipientId].total += 1;
      if (field.required !== false) {
        stats[assignedRecipientId].required += 1;
      }
    });
    return stats;
  }, [fields]);
  const signerFieldAssignmentError = useMemo(() => {
    const missingSigners = recipients.filter(
      (recipient) =>
        recipient.role === 'signer' &&
        !recipient.isCC &&
        (fieldStats[recipient.id]?.required ?? 0) === 0
    );
    if (missingSigners.length === 0) return null;
    return `Assign at least one required field to every signer before sending. Missing: ${missingSigners
      .map((recipient) => recipient.name)
      .join(', ')}.`;
  }, [fieldStats, recipients]);
  const recipientAssignmentError = useMemo(() => {
    const roleByRecipientId = new Map(recipients.map((recipient) => [recipient.id, recipient.role]));
    for (const field of fields) {
      if (field.fieldOwner === 'me' || !field.assignedRecipientId) continue;
      const role = roleByRecipientId.get(field.assignedRecipientId);
      const type = getFieldTypeFromComponentLabel(field.component);
      if (role === 'viewer' && type !== 'signature' && type !== 'stamp') {
        return 'Viewer recipients can only receive signature or stamp fields.';
      }
      if (role === 'approver' && (type === 'signature' || type === 'initials' || type === 'stamp')) {
        return 'Approver recipients cannot receive signature, initials, or stamp fields.';
      }
    }
    return null;
  }, [fields, recipients]);
  const recipientIdentityError = useMemo(() => {
    return getRecipientIdentityError(recipients);
  }, [recipients]);
  const canAttachPaymentRequests = subscriptionStatus.entitlements.paymentRequests;

  useEffect(() => {
    if (!sequentialAllowed && sequential) {
      setSequential(false);
    }
  }, [sequentialAllowed, sequential]);

  const canSelectAnyTeam = isAdminRole(user?.orgRole || user?.role);
  const hasWorkspace = Boolean(user?.orgId);
  const selectableTeams = useMemo(() => {
    if (canSelectAnyTeam) return teams;
    const userId = user?.id;
    if (!userId) return [];
    return teams.filter((team) => team.members?.some((member) => member.userId === userId));
  }, [canSelectAnyTeam, teams, user?.id]);

  useEffect(() => {
    if (!isOpen) {
      setTeams([]);
      setTeamId('');
      return;
    }
    const orgId = user?.orgId;
    if (!orgId) {
      setTeams([]);
      return;
    }
    let cancelled = false;
    const loadTeams = async () => {
      setLoadingTeams(true);
      try {
        const res = await fetch(`/api/orgs/teams?orgId=${encodeURIComponent(orgId)}`, {
          credentials: 'include',
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.message || 'Failed to load teams');
        }
        if (!cancelled) {
          setTeams(Array.isArray(payload?.teams) ? payload.teams : []);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Failed to load teams';
          toast.error(message);
        }
      } finally {
        if (!cancelled) setLoadingTeams(false);
      }
    };
    loadTeams();
    return () => {
      cancelled = true;
    };
  }, [isOpen, user?.orgId]);

  useEffect(() => {
    if (!teamId) return;
    if (!selectableTeams.some((team) => team.id === teamId)) {
      setTeamId('');
    }
  }, [selectableTeams, teamId]);

  useEffect(() => {
    if (!isOpen) {
      defaultsAppliedRef.current = false;
      return;
    }
    if (defaultsAppliedRef.current) {
      return;
    }

    setSubject(effectiveUserSettings.inviteSubject || `Signature Request – ${documentName}`);
    setMessage(
      effectiveUserSettings.inviteMessage ||
        `You have been requested to review and sign the following document:\n\n ${documentName}`
    );
    setSendReminders(Boolean(effectiveUserSettings.autoReminders));
    setReminderDays(effectiveUserSettings.reminderIntervalDays);
    setExpiryDays(effectiveUserSettings.defaultExpirationDays);
    setHasExpiry(effectiveUserSettings.defaultExpirationDays > 0);
    setSequential(sequentialAllowed && effectiveUserSettings.defaultSigningMode === 'sequential');
    setCaptureGps(false);
    setPaymentRequestEnabled(false);
    setPaymentAmount('');
    setPaymentLinkUrl('');
    setPaymentDescription('');
    defaultsAppliedRef.current = true;
  }, [documentName, effectiveUserSettings, isOpen, sequentialAllowed]);


  const viewOnlyRecipients = recipients.filter((recipient) => recipient.role === 'viewer' || recipient.isCC);
  const handleReorder = (reorderedRecipients: Recipient[]) => {
    const merged = [...reorderedRecipients, ...viewOnlyRecipients].map((r, idx) => ({
      ...r,
      order: idx + 1,
    }));
    setRecipients?.(merged);
  };
  const handleSend = async () => {
    if (recipients.length === 0) {
      toast.error('No recipients to send to');
      return;
    }

    if (!documentId) {
      toast.error('Document must be saved before sending');
      return;
    }

    if (recipientAssignmentError) {
      toast.error(recipientAssignmentError);
      return;
    }

    if (recipientIdentityError) {
      toast.error(recipientIdentityError);
      return;
    }

    if (signerFieldAssignmentError) {
      toast.error(signerFieldAssignmentError);
      return;
    }

    if (paymentRequestEnabled) {
      if (!canAttachPaymentRequests) {
        toast.error('Business Plus is required to attach payment requests.');
        return;
      }
      if (Number(paymentAmount) <= 0 || !isValidPaymentUrl(paymentLinkUrl)) {
        toast.error('Enter a positive payment amount and a valid HTTP(S) payment link.');
        return;
      }
    }

    setIsSending(true);
    try {
      let actionableOrder = 0;
      let viewerOrder = actionableRecipients.length;
      const recipientsWithSettings = recipients.map((r) => ({
        ...r,
        order: r.role === 'viewer' || r.isCC ? ++viewerOrder : ++actionableOrder,
        sendReminders,
        reminderDays: sendReminders ? reminderDays : undefined,
        expiresAt: hasExpiry ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000) : undefined,
        captureGpsLocation: captureGps,
      }));
      const preparedFields = serializeFields().map((field, index) => ({
        ...field,
        value: resolvePreparedFieldValue(fields[index]),
      }));

      const payload: Record<string, unknown> = {
        documentId,
        documentName,
        recipients: recipientsWithSettings,
        fields: preparedFields,
        subject,
        message,
        signingMode: sequential ? 'sequential' : 'parallel',
      };
      if (teamId) {
        payload.teamId = teamId;
      }
      if (paymentRequestEnabled) {
        payload.paymentRequest = {
          enabled: true,
          amount: Number(paymentAmount),
          currency: 'INR',
          description: paymentDescription.trim() || undefined,
          paymentLinkUrl: paymentLinkUrl.trim(),
        };
      }

      const csrfToken = getCookieValue('csrf_token');
      const response = await fetch('/api/documents/send-for-signing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify(payload),
      });
      const responsePayload = (await response.json().catch(() => ({}))) as SendForSigningResponse;

      if (!response.ok) {
        throw new Error(responsePayload.message || 'Failed to send document');
      }

      const failedEmails = responsePayload.emailDelivery?.failed ?? 0;
      if (failedEmails > 0) {
        toast.error(
          responsePayload.message ||
            `Document sent, but ${failedEmails} notification email(s) failed to deliver.`
        );
      } else {
        toast.success(`Document sent to ${recipients.length} recipient${recipients.length > 1 ? 's' : ''}`);
      }

      onSendComplete?.({
        recipients: recipientsWithSettings,
        signingMode: sequential ? 'sequential' : 'parallel',
      });
      onClose();
    } catch (error) {
      console.error('Error sending document:', error);
      const message = error instanceof Error ? error.message : 'Failed to send document. Please try again.';
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  const ccRecipients = viewOnlyRecipients.filter((recipient) => recipient.isCC);
  const otherViewers = viewOnlyRecipients.filter((recipient) => !recipient.isCC);
  const paymentRequestValid =
    !paymentRequestEnabled ||
    (canAttachPaymentRequests && Number(paymentAmount) > 0 && isValidPaymentUrl(paymentLinkUrl));
  const canSend =
    recipients.length > 0 &&
    Boolean(documentId) &&
    !recipientAssignmentError &&
    !recipientIdentityError &&
    !signerFieldAssignmentError &&
    paymentRequestValid;
  const handleClose = () => {
    if (!isSending) onClose();
  };

  return (
    <Modal visible={isOpen}
      onClose={handleClose}
      handleConfirm={handleSend}
      confirmLabel={isSending ? 'Sending…' : 'Send document'}
      confirmDisabled={isSending || !canSend}
      confirmIcon={isSending
        ? <LoaderCircle className="h-4 w-4 animate-spin" />
        : <Send className="h-4 w-4" />}
      cancelDisabled={isSending}
      closeOnBackdrop={!isSending}
      className='w-200'
      title={<span className="text-xl font-semibold text-gray-900">Send document</span>}
      description={`Send "${documentName}" to ${recipients.length} recipient${recipients.length > 1 ? 's' : ''}`}
    >
      <div className="p-4 space-y-6">
        {/* Recipients Summary */}
        <div className="bg-brand-50 p-4 rounded-md">
          <h3 className="text-sm font-medium text-brand-800 mb-3">Recipients</h3>

          <div className="flex items-center justify-between mb-3">
            <div>
                <h4 className="text-sm font-medium text-gray-900">Sequential Signing</h4>
                <p className="text-xs text-gray-500">
                  Signers must sign in a specific order. You can re-order signers below.
                </p>
                {!sequentialAllowed && (
                  <p className="text-xs text-amber-600 mt-1">
                    Sequential signing is available only when there is more than one recipient.
                  </p>
                )}
            </div>
            <ToggleSwitch
              checked={sequential}
              onChange={setSequential}
              disabled={!sequentialAllowed}
              className="shrink-0"
            />
          </div>


          {actionableRecipients.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-brand-600 font-medium mb-2">
                SIGNERS &amp; APPROVERS ({actionableRecipients.length})
              </p>
              <div className="space-y-1">
                <RecipientsList
                  recipients={actionableRecipients}
                  isDraggable={sequential}
                  onReorder={handleReorder}
                  inlineView
                  fieldStats={fieldStats}
                />
              </div>
            </div>
          )}

          {otherViewers.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-brand-600 font-medium mb-2">VIEWERS ({otherViewers.length})</p>
              <RecipientsList recipients={otherViewers} inlineView fieldStats={fieldStats} />
            </div>
          )}

          {ccRecipients.length > 0 && (
            <div>
              <p className="text-xs text-brand-600 font-medium mb-2">CC RECIPIENTS ({ccRecipients.length})</p>
              <div className="space-y-1">
                {ccRecipients.map((recipient) => (
                  <div key={recipient.id} className="flex items-center gap-2 text-sm">
                    <div className="w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs">
                      CC
                    </div>
                    <span className="font-medium">{recipient.name}</span>
                    <span className="text-gray-600">({recipient.email})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Email Settings */}
        <div className="bg-gray-50 p-4 rounded-md">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Team Routing (Optional)</h3>
              <p className="text-xs text-gray-500">
                Assign this document to a team for shared visibility and reporting.
              </p>
            </div>
          </div>
          {!hasWorkspace ? (
            <p className="text-sm text-gray-600">
              Trial workspace documents are not assigned to teams permanently. Upgrade to Business
              or join a workspace when you need long-term team routing.
            </p>
          ) : loadingTeams ? (
            <p className="text-sm text-gray-600">Loading teams...</p>
          ) : selectableTeams.length === 0 ? (
            <p className="text-sm text-gray-600">
              {teams.length === 0
                ? 'No teams yet. Create one in My Teams.'
                : 'You are not a member of any teams.'}
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <Select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white"
              >
                <option value="">No team</option>
                {selectableTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} · {team.memberCount} member{team.memberCount === 1 ? '' : 's'}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        {/* Email Settings */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Subject
            </label>
            <Input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-brand-500"
              placeholder="Enter email subject"
            />
          </div>

          <div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              label="Email Message"
              rows={4}
              className="border-gray-300 focus:ring-2 focus:ring-brand-500"
              placeholder="Enter your message to recipients"
            />
          </div>
        </div>

        {/* Reminder Settings */}
        <div className="bg-gray-50 p-4 rounded-md">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Automatic Reminders</h3>
              <p className="text-xs text-gray-500">Send reminders to recipients who haven&apos;t signed</p>
            </div>
            <ToggleSwitch
              checked={sendReminders}
              onChange={setSendReminders}
              className="shrink-0"
            />
          </div>

          {sendReminders && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600">Send reminder every</span>
              <Select
                value={reminderDays}
                onChange={(e) => setReminderDays(Number(e.target.value))}
                className="border border-gray-300 rounded-sm px-2 py-1 text-sm"
              >
                <option value={1}>1 day</option>
                <option value={2}>2 days</option>
                <option value={3}>3 days</option>
                <option value={7}>1 week</option>
              </Select>
              <span className="text-sm text-gray-600">until signed</span>
            </div>
          )}
        </div>

        {/* Expiry Settings */}
        <div className="bg-gray-50 p-4 rounded-md">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Document Expiry</h3>
              <p className="text-xs text-gray-500">Set when the signing link expires</p>
            </div>
            <ToggleSwitch
              checked={hasExpiry}
              onChange={setHasExpiry}
              className="shrink-0"
            />
          </div>

          {hasExpiry && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600">Expires in</span>
              <Select
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                className="border border-gray-300 rounded-sm px-2 py-1 text-sm"
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </Select>
              <span className="text-sm text-gray-600">from now</span>
            </div>
          )}
        </div>

        {/* Security Settings */}
        <div className="bg-gray-50 p-4 rounded-md">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Security Settings</h3>
              <p className="text-xs text-gray-500">Enhance document security and audit trails</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">Capture signer&apos;s GPS location</span>
            <div className="grow"></div>
            <ToggleSwitch checked={captureGps} onChange={setCaptureGps} className="shrink-0" />
          </div>
        </div>

        <div className="bg-orange-50 p-4 rounded-md border border-orange-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Payment Request</h3>
              <p className="text-xs text-gray-500">
                Attach a payment link so recipients can review payment details from the same signing request.
              </p>
            </div>
            <ToggleSwitch
              checked={paymentRequestEnabled}
              onChange={setPaymentRequestEnabled}
              disabled={!canAttachPaymentRequests}
              className="shrink-0"
            />
          </div>

          {!canAttachPaymentRequests ? (
            <p className="text-sm text-orange-700">
              Upgrade to Business Plus to attach payment requests to signing flows.
            </p>
          ) : paymentRequestEnabled ? (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Amount</label>
                <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2">
                  <Wallet className="h-4 w-4 text-orange-600" />
                  <Input
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    type="number"
                    min={1}
                    step="0.01"
                    className="w-full bg-transparent text-sm outline-hidden"
                    placeholder="2500"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Payment link</label>
                <Input
                  type="url"
                  value={paymentLinkUrl}
                  onChange={(event) => setPaymentLinkUrl(event.target.value)}
                  className="w-full"
                  placeholder="https://rzp.io/..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <Input
                  type="text"
                  value={paymentDescription}
                  onChange={(event) => setPaymentDescription(event.target.value)}
                  className="w-full"
                  placeholder="Deposit due on signature"
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">Turn this on when the signing request should also include a payment CTA.</p>
          )}
        </div>

        {/* Warning for incomplete document */}
        {(recipientAssignmentError || recipientIdentityError) && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {recipientAssignmentError || recipientIdentityError}
            {recipientAssignmentError ? ' Update the field assignment before sending.' : ''}
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 p-4 rounded-md">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-amber-800">Before Sending</h4>
              <p className="text-sm text-amber-700 mt-1">
                Make sure all required fields are placed on the document and assigned to recipients.
                Once sent, recipients will receive signing instructions via email.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default SendDocumentModal;
