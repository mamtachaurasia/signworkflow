'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { GoogleLogin, GoogleOAuthProvider, type CredentialResponse } from '@react-oauth/google';
import {
  AlertTriangle,
  ArrowLeft,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  FileText,
  Loader2,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { Button, Input } from '@ui';
import { getCookieValue } from '@/utils/cookies';
import { getDashboardAccountPath } from '@/lib/account-routing';
import { useAuth } from '@/components/auth/AuthProvider';

type DeleteReview = {
  email: string;
  counts: {
    documentsStored: number;
    signedDocuments: number;
    pendingSignatureRequests: number;
    teamMemberships: number;
    subscriptions: number;
  };
  teamMemberships: Array<{
    orgId: string;
    name: string;
    role: string;
    status: string;
  }>;
  subscriptionWorkspaces: Array<{
    orgId: string;
    name: string;
    plan: string;
    workspaceStatus: string;
    subscriptionStatus: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
  }>;
  verification: {
    passwordAvailable: boolean;
    googleAvailable: boolean;
    mfaRequired: boolean;
  };
  graceDays: number;
  scheduledDeletionDate: string;
  implications: string[];
};

type DeleteBlock = {
  workspaces: Array<{ orgId?: string; name: string }>;
  instructions?: string;
  canCloseWithAccount?: boolean;
};

const numberFormatter = new Intl.NumberFormat();

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function formatDate(value?: string | null) {
  if (!value) return 'Not available';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function DeleteAccountReview() {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const router = useRouter();
  const { logout } = useAuth();
  const [review, setReview] = useState<DeleteReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [password, setPassword] = useState('');
  const [googleIdToken, setGoogleIdToken] = useState('');
  const [googleVerified, setGoogleVerified] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [deleteBlock, setDeleteBlock] = useState<DeleteBlock | null>(null);
  const [closeSoloOwnedWorkspaces, setCloseSoloOwnedWorkspaces] = useState(false);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadReview = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/user/delete/review', {
          credentials: 'include',
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.message || 'Unable to load deletion review.');
        }
        if (mounted) {
          setReview(payload as DeleteReview);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load deletion review.';
        toast.error(message);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadReview();

    return () => {
      mounted = false;
    };
  }, []);

  const confirmationMatches = useMemo(() => {
    if (!review) return false;
    const normalized = confirmation.trim().toLowerCase();
    return normalized === review.email.toLowerCase() || normalized === 'delete';
  }, [confirmation, review]);

  const identityReady = useMemo(() => {
    if (!review) return false;
    return Boolean(
      googleIdToken ||
      (review.verification.passwordAvailable && password.length > 0)
    );
  }, [googleIdToken, password, review]);

  const mfaReady = useMemo(() => {
    if (!review?.verification.mfaRequired) return true;
    return /^\d{6}$/.test(mfaCode.trim());
  }, [mfaCode, review?.verification.mfaRequired]);

  const handleGoogleVerificationSuccess = (credentialResponse: CredentialResponse) => {
    const credential = credentialResponse.credential;
    if (!credential) {
      toast.error('Google did not return a verification token.');
      return;
    }
    setGoogleIdToken(credential);
    setGoogleVerified(true);
    setPassword('');
    toast.success('Google identity verified for this request.');
  };

  const submitDeletion = async () => {
    if (!review || submitting || !confirmationMatches) return;

    setSubmitting(true);
    setDeleteBlock(null);

    try {
      const csrfToken = getCookieValue('csrf_token');
      const res = await fetch('/api/user/delete', {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify({
          confirmation,
          password,
          googleIdToken: googleIdToken || undefined,
          mfaCode: mfaCode.trim() || undefined,
          closeSoloOwnedWorkspaces,
        }),
      });
      const payload = await res.json().catch(() => ({})) as {
        message?: string;
        reason?: string;
        instructions?: string;
        blockedWorkspaces?: Array<{ orgId?: string; name: string }>;
        canCloseWithAccount?: boolean;
      };

      if (res.ok) {
        setProcessingMessage(payload.message || 'Your account deletion request is being processed.');
        toast.success('Account deletion scheduled.');
        window.setTimeout(() => {
          void logout();
          router.replace('/login');
        }, 1800);
        return;
      }

      if (res.status === 409 && payload.blockedWorkspaces) {
        setDeleteBlock({
          workspaces: payload.blockedWorkspaces,
          instructions: payload.instructions,
          canCloseWithAccount: payload.reason === 'solo_owned_workspaces' && payload.canCloseWithAccount,
        });
        setCloseSoloOwnedWorkspaces(payload.reason === 'solo_owned_workspaces' && payload.canCloseWithAccount === true);
        toast.error(
          payload.reason === 'solo_owned_workspaces'
            ? 'Confirm closing your solo workspace first.'
            : 'Transfer workspace ownership first, then delete your account.'
        );
        return;
      }

      toast.error(payload.message || 'Unable to schedule account deletion.');
    } catch (err) {
      console.error(err);
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading account deletion review...
        </div>
      </main>
    );
  }

  if (!review) {
    return (
      <main className="mx-auto">
        <Button type="button" inverted onClick={() => router.push(getDashboardAccountPath('settings'))}>
          Back to settings
        </Button>
      </main>
    );
  }

  if (processingMessage) {
    return (
      <main className="mx-auto max-w-3xl">
        <section className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <CheckCircle2 className="mt-1 h-6 w-6 text-emerald-600" />
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Deletion request received</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">{processingMessage}</p>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Your access is being revoked now. You can restore the account before {formatDate(review.scheduledDeletionDate)} by signing in again.
              </p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const summaryItems = [
    { label: 'Documents stored', value: review.counts.documentsStored, icon: FileText },
    { label: 'Signed documents', value: review.counts.signedDocuments, icon: FileCheck2 },
    { label: 'Pending signature requests', value: review.counts.pendingSignatureRequests, icon: CalendarClock },
    { label: 'Team memberships', value: review.counts.teamMemberships, icon: Users },
    { label: 'Subscriptions', value: review.counts.subscriptions, icon: CreditCard },
  ];

  return (
    <main className="mx-auto max-w-5xl">
      <button
        type="button"
        onClick={() => router.push(getDashboardAccountPath('settings'))}
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to settings
      </button>

      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">Account deletion</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Review before deleting your account</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          This eSign account may include legally binding documents, audit trails, workspace access, and billing records. Review the impact before continuing.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-5">
        {summaryItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <Icon className="h-5 w-5 text-brand-600" />
              <div className="mt-3 text-2xl font-semibold text-slate-950">{formatCount(item.value)}</div>
              <div className="mt-1 text-xs font-medium text-slate-500">{item.label}</div>
            </div>
          );
        })}
      </section>

      <section className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 h-5 w-5 text-rose-600" />
          <div>
            <h2 className="text-lg font-semibold text-rose-900">Deleting your account is permanent</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-rose-800">
              {review.implications.map((implication) => (
                <li key={implication}>- {implication}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <BriefcaseBusiness className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-slate-900">Workspace impact</h2>
          </div>
          <div className="mt-4 space-y-3">
            {review.teamMemberships.length > 0 ? (
              review.teamMemberships.map((membership) => (
                <div key={`${membership.orgId}-${membership.role}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-sm font-medium text-slate-900">{membership.name}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{membership.role}</div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-600">No active team memberships were found.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-slate-900">Subscription impact</h2>
          </div>
          <div className="mt-4 space-y-3">
            {review.subscriptionWorkspaces.length > 0 ? (
              review.subscriptionWorkspaces.map((workspace) => (
                <div key={workspace.orgId} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-slate-900">{workspace.name}</div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{workspace.plan}</div>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    {workspace.subscriptionStatus || 'No active subscription status'}
                    {workspace.currentPeriodEnd ? ` - period ends ${formatDate(workspace.currentPeriodEnd)}` : ''}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-600">No subscription records were found for your active workspaces.</p>
            )}
          </div>
        </section>
      </div>

      {deleteBlock ? (
        <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-semibold text-amber-900">Workspace ownership needs attention</h2>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            {deleteBlock.instructions || 'Resolve workspace ownership before deleting this account.'}
          </p>
          <div className="mt-4 space-y-3">
            {deleteBlock.workspaces.map((workspace) => (
              <div key={workspace.orgId || workspace.name} className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-900">{workspace.name}</div>
                  <div className="text-xs text-slate-600">
                    {deleteBlock.canCloseWithAccount
                      ? 'This solo workspace will be closed with your account after you confirm below.'
                      : 'Transfer ownership before account deletion can continue.'}
                  </div>
                </div>
                {deleteBlock.canCloseWithAccount ? null : (
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => router.push(`${getDashboardAccountPath('workspace', 'members')}?action=transfer-ownership&orgId=${workspace.orgId || ''}`)}
                  >
                    Transfer ownership
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-5 w-5 text-brand-600" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Verify identity and confirm</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Your account will be scheduled for permanent deletion on {formatDate(review.scheduledDeletionDate)}. Access is revoked immediately after this request is accepted.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {review.verification.passwordAvailable ? (
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Password</span>
              <Input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (event.target.value) {
                    setGoogleIdToken('');
                    setGoogleVerified(false);
                  }
                }}
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </label>
          ) : null}
          {review.verification.googleAvailable && googleClientId ? (
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                {review.verification.passwordAvailable ? 'Or verify with Google' : 'Verify with Google'}
              </span>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                {googleVerified ? (
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Google verified for this deletion request
                  </div>
                ) : (
                  <GoogleOAuthProvider clientId={googleClientId}>
                    <GoogleLogin
                      onSuccess={handleGoogleVerificationSuccess}
                      onError={() => toast.error('Google verification failed')}
                    />
                  </GoogleOAuthProvider>
                )}
              </div>
            </div>
          ) : null}
          {review.verification.mfaRequired ? (
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Authenticator code</span>
              <Input
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter 6-digit code"
                maxLength={6}
              />
            </label>
          ) : null}
          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Type {review.email} to confirm</span>
            <Input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              placeholder={review.email}
            />
          </label>
        </div>

        {deleteBlock?.canCloseWithAccount ? (
          <label className="mt-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <input
              type="checkbox"
              checked={closeSoloOwnedWorkspaces}
              onChange={(event) => setCloseSoloOwnedWorkspaces(event.target.checked)}
              className="mt-1 h-4 w-4 accent-rose-600"
            />
            <span>I understand the listed solo workspace will be closed with my account.</span>
          </label>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-xs leading-5 text-slate-500">
            Some records may remain under retention, legal hold, tax, billing, anti-fraud, or audit obligations even after account access is removed.
          </p>
          <Button
            type="button"
            disabled={
              submitting ||
              !identityReady ||
              !mfaReady ||
              !confirmationMatches ||
              (deleteBlock?.canCloseWithAccount === true && !closeSoloOwnedWorkspaces)
            }
            onClick={submitDeletion}
            className="bg-rose-600 text-white shadow-sm hover:bg-rose-500 disabled:opacity-70"
          >
            {submitting ? 'Processing...' : 'Schedule account deletion'}
          </Button>
        </div>
      </section>
    </main>
  );
}
