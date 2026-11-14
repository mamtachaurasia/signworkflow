'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react';

import { useAuth } from '@/components/auth/AuthProvider';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '@ui';

import useContextStore from '@/hooks/useContextStore';
import {
  getPostAuthRedirectPath,
  getSafePostAuthRedirectPath,
  navigateToPostAuthPath,
} from '@/lib/account-routing';
import SocialMediaBtn from '@/components/common/SocialMediaBtn';

type FormValues = {
  email: string;
  password: string;
};

const LoginPage: React.FC = () => {
  const { setShowModal } = useContextStore();
  const { login, restoreAccount, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get('email') || '';
  const redirectPath = getSafePostAuthRedirectPath(searchParams.get('next'));
  const registerParams = new URLSearchParams();
  if (emailFromUrl) {
    registerParams.set('email', emailFromUrl);
  }
  if (redirectPath !== getPostAuthRedirectPath()) {
    registerParams.set('next', redirectPath);
  }
  const registerHref = registerParams.toString() ? `/register?${registerParams.toString()}` : '/register';
  const { register, handleSubmit, formState } = useForm<FormValues>({
    defaultValues: {
      email: emailFromUrl,
      password: '',
    },
  });
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [accountDeleted, setAccountDeleted] = useState<{
    canRestore: boolean;
    deletionScheduledAt?: string;
    message?: string;
  } | null>(null);

  const navigateAfterAuthentication = useCallback(() => {
    navigateToPostAuthPath(redirectPath, (path) => router.replace(path));
  }, [redirectPath, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigateAfterAuthentication();
    }
  }, [isAuthenticated, isLoading, navigateAfterAuthentication]);

  const onSubmit = async (data: FormValues) => {
    setFormError(null);
    setAccountDeleted(null);

    try {
      let result = await login({
        email: data.email,
        password: data.password,
        deviceInfo: 'web',
      });

      if (result.accountDeleted) {
        setAccountDeleted({
          canRestore: Boolean(result.canRestore),
          deletionScheduledAt: result.deletionScheduledAt,
          message: result.message,
        });
        return;
      }

      if (result.mfaRequired) {
        const promptedCode = window.prompt('Enter your 6-digit authenticator code');
        if (!promptedCode) {
          const message = result.message || 'MFA code is required';
          setFormError(message);
          toast.error(message);
          return;
        }

        result = await login({
          email: data.email,
          password: data.password,
          totpCode: promptedCode.trim(),
          deviceInfo: 'web',
        });

        if (result.mfaRequired) {
          const message = result.message || 'Invalid MFA code';
          setFormError(message);
          toast.error(message);
          return;
        }
      }

      navigateAfterAuthentication();
      setShowModal(false);
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'Network error. Please try again.';
      setFormError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleRestore = async (data: FormValues) => {
    setFormError(null);

    try {
      let result = await restoreAccount({
        email: data.email,
        password: data.password,
        deviceInfo: 'web',
      });

      if (result.mfaRequired) {
        const promptedCode = window.prompt('Enter your 6-digit authenticator code');
        if (!promptedCode) {
          const message = result.message || 'MFA code is required';
          setFormError(message);
          toast.error(message);
          return;
        }

        result = await restoreAccount({
          email: data.email,
          password: data.password,
          totpCode: promptedCode.trim(),
          deviceInfo: 'web',
        });

        if (result.mfaRequired) {
          const message = result.message || 'Invalid MFA code';
          setFormError(message);
          toast.error(message);
          return;
        }
      }

      navigateAfterAuthentication();
      setShowModal(false);
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'Network error. Please try again.';
      setFormError(errorMessage);
      toast.error(errorMessage);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full px-4" data-testid="login-modal">
        <div className="relative mx-auto max-w-[500px]">
          <Card className="border-[#E2E8F0] shadow-sm">
            <CardContent className="p-6">
              <p className="text-sm text-slate-600">Checking your session...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="w-full px-4" data-testid="login-modal">
        <Card className="relative mx-auto max-w-125">
          <CardHeader className="text-center p-6 pb-0">
            <CardTitle>
              Log in with ease
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Continue with Google
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-2 p-6">
            <SocialMediaBtn />

            <div className="text-center">
              <span className="text-xs uppercase text-slate-500">or</span>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
              {formError ? (
                <div
                  className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  role="alert"
                >
                {formError}
                </div>
              ) : null}

              {accountDeleted ? (
                <div
                  className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                  role="alert"
                >
                  <p>
                    {accountDeleted.message || 'This account is scheduled for deletion.'}
                    {accountDeleted.deletionScheduledAt ? (
                      <span className="ml-1">
                        Deletion scheduled for{' '}
                        {new Date(accountDeleted.deletionScheduledAt).toLocaleString()}.
                      </span>
                    ) : null}
                  </p>
                  {!accountDeleted.canRestore ? (
                    <p className="mt-2 text-xs text-amber-700">
                      The restore window has expired. Please contact support.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <Input
                type="email"
                placeholder="name@example.com"
                autoComplete="email"
                error={formState.errors.email?.message}
                {...register('email', { required: 'Email required' })}
              />

              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password"
                autoComplete="current-password"
                error={formState.errors.password?.message}
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
                {...register('password', { required: 'Password required' })}
              />

              <Button size="sm" asChild variant="link" className="my-2! h-5 p-0! text-xs font-medium">
                <Link href="/forgot-password">Forgot Password?</Link>
              </Button>

              {accountDeleted?.canRestore ? (
                <Button size="sm"
                  type="button"
                  variant="warning"
                  disabled={formState.isSubmitting}
                  className="w-full"
                  onClick={handleSubmit(handleRestore)}
                >
                  {formState.isSubmitting ? 'Restoring...' : 'Restore account'}
                </Button>
              ) : (
                <Button size="sm" type="submit" disabled={formState.isSubmitting} className="w-full">
                  {formState.isSubmitting ? 'Logging in...' : 'Log in'}
                </Button>
              )}

              <p className="text-center text-xs">
                <span className="text-slate-500">No account? </span>
                <Link href={registerHref} className="text-brand-500 hover:underline">
                  Sign up
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
 

      <p className="mt-4 text-center text-xs leading-4">
        <span className="text-slate-500">By clicking Log in or Sign up, you agree to the </span>
        <Link href="/terms" className="text-brand-500 hover:underline">
          Terms of Service
        </Link>
        <span className="text-slate-500"> and </span>
        <Link href="/privacy" className="text-brand-500 hover:underline">
          Privacy Notice
        </Link>
      </p>
    </div>
  );
};

export default function LoginPageWrapper() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginPage />
    </Suspense>
  );
}
