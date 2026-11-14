'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '@ui';
import { getPostAuthRedirectPath, getSafePostAuthRedirectPath } from '@/lib/account-routing';

function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const shareToken = searchParams.get('shareToken') || '';
  const email = searchParams.get('email') || '';
  const redirectPath = getSafePostAuthRedirectPath(searchParams.get('next'));
  const hasCustomRedirect = redirectPath !== getPostAuthRedirectPath();
  const isSharedDocumentClaim = redirectPath.startsWith('/builder/');
  const loginParams = new URLSearchParams();
  if (email) {
    loginParams.set('email', email);
  }
  if (hasCustomRedirect) {
    loginParams.set('next', redirectPath);
  }
  const loginHref = loginParams.toString() ? `/login?${loginParams.toString()}` : '/login';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token && !shareToken) {
      toast.error('Invalid or expired reset link');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/user/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token || undefined, shareToken: shareToken || undefined, email, newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.message || 'Failed to reset password');
      }

      toast.success('Password updated. Please log in.');
      setSubmitted(true);
      router.replace(loginHref);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reset password');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token && !shareToken) {
    return (
      <div className="w-full px-4">
        <div className="relative mx-auto max-w-[500px]">
          <Card className="border-[#E2E8F0] shadow-sm">
            <CardHeader className="space-y-2 px-6 pb-0 pt-6 text-center">
              <CardTitle className="text-center text-lg font-medium text-[#020817]">Invalid link</CardTitle>
              <CardDescription className="text-center text-xs text-slate-500">
                This reset link is invalid or expired. Request a new one.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 text-center">
              <Button size="sm" asChild variant="link" className="text-sm font-medium">
                <Link href="/forgot-password">Request a new reset link</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="w-full px-4">
        <div className="relative mx-auto max-w-[500px]">
          <Card className="border-[#E2E8F0] shadow-sm">
            <CardHeader className="space-y-2 px-6 pb-0 pt-6 text-center">
              <CardTitle className="text-center text-lg font-medium text-[#020817]">
                Password updated
              </CardTitle>
              <CardDescription className="text-center text-xs text-slate-500">
                {isSharedDocumentClaim
                  ? 'Log in to continue to your shared document.'
                  : 'You can now log in with your new password.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 text-center">
              <Button size="sm" asChild variant="link" className="text-sm font-medium">
                <Link href={loginHref}>
                  Go to login
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4">
      <div className="relative mx-auto max-w-[500px]">
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardHeader className="space-y-2 px-6 pb-0 pt-6 text-center">
            <CardTitle className="text-center text-lg font-medium text-[#020817]">
              {isSharedDocumentClaim ? 'Create your password' : 'Set a new password'}
            </CardTitle>
            <CardDescription className="text-center text-xs text-slate-500">
              {isSharedDocumentClaim
                ? 'Use this password to unlock your shared document access.'
                : 'Choose a new password for your account.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Input
                type={showPassword ? 'text' : 'password'}
                label="New password"
                placeholder="New password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                trailingAdornment={
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                label="Confirm new password"
                placeholder="Confirm new password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                trailingAdornment={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                }
              />

              <Button size="sm" type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? 'Updating...' : 'Update password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ResetPasswordPageWrapper() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResetPasswordPage />
    </Suspense>
  );
}
