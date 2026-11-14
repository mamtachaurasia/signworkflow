'use client';

import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react';
import zxcvbn from 'zxcvbn';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '@ui';
import SocialMediaBtn from '@/components/common/SocialMediaBtn';
import { getPostAuthRedirectPath, getSafePostAuthRedirectPath } from '@/lib/account-routing';

type FormValues = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  picture?: string | null;
};

const MIN_PASSWORD_LENGTH = 6;

function Register() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get('email') || '';
  const redirectPath = getSafePostAuthRedirectPath(searchParams.get('next'));
  const hasCustomRedirect = redirectPath !== getPostAuthRedirectPath();
  const { register, handleSubmit, setValue, formState, watch } = useForm<FormValues>({
    defaultValues: { name: '', email: '', password: '', confirmPassword: '', picture: null },
  });
  const password = watch('password');

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const onSubmit = async (data: FormValues) => {
    if (data.password !== data.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const fullName = data.name.trim();
      const nameParts = fullName.split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

      const payload: {
        name: string;
        firstName: string;
        lastName: string;
        email: string;
        password: string;
        picture?: string;
      } = {
        name: fullName,
        firstName,
        lastName,
        email: data.email,
        password: data.password,
      };

      if (typeof data.picture === 'string' && data.picture.trim().length > 0) {
        payload.picture = data.picture.trim();
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const errorMessage = json?.errors?.[0] || json?.message || 'Registration failed';
        toast.error(errorMessage);
        return;
      }

      toast.success('Registration successful. Your free trial workspace is ready. Please log in.');
      const loginParams = new URLSearchParams({ email: data.email });
      if (hasCustomRedirect) {
        loginParams.set('next', redirectPath);
      }
      router.replace(`/login?${loginParams.toString()}`);
    } catch (err) {
      console.error(err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getPasswordStrength = (value: string) => {
    if (!value) {
      return 0;
    }

    return zxcvbn(value).score;
  };

  const passwordStrength = getPasswordStrength(password);

  const strengthColor =
    passwordStrength === 0
      ? ''
      : passwordStrength <= 1
        ? 'bg-red-500'
        : passwordStrength <= 2
          ? 'bg-yellow-500'
          : 'bg-green-500';

  const strengthText =
    passwordStrength === 0
      ? ''
      : passwordStrength <= 1
        ? 'Weak'
        : passwordStrength <= 2
          ? 'Fair'
          : 'Strong';

  useEffect(() => {
    setValue('email', emailFromUrl);
  }, [emailFromUrl, setValue]);

  const loginParams = new URLSearchParams();
  if (emailFromUrl) {
    loginParams.set('email', emailFromUrl);
  }
  if (hasCustomRedirect) {
    loginParams.set('next', redirectPath);
  }
  const loginHref = loginParams.toString() ? `/login?${loginParams.toString()}` : '/login';

  return (
    <div className="w-full px-4">
        <Card className="relative mx-auto max-w-125">
           <CardHeader className="text-center p-6 pb-0">
            <CardTitle>
              Create your account
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Continue with Google, or create an account with your email
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-2 p-6">
            <SocialMediaBtn />

            <div className="text-center">
              <span className="text-xs uppercase text-slate-500">or</span>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
              <Input
                type="text"
                placeholder="Full name"
                autoComplete="name"
                error={formState.errors.name?.message}
                {...register('name', { required: 'Name is required' })}
              />

              <Input
                type="email"
                placeholder="name@example.com"
                autoComplete="email"
                error={formState.errors.email?.message}
                {...register('email', { required: 'Email is required' })}
              />

              <div className="space-y-2">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  autoComplete="new-password"
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
                  {...register('password', {
                    required: 'Password is required',
                    minLength: {
                      value: MIN_PASSWORD_LENGTH,
                      message: `At least ${MIN_PASSWORD_LENGTH} characters`,
                    },
                  })}
                />

                {password ? (
                  <div className="flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${strengthColor}`}
                        style={{ width: `${(passwordStrength + 1) * 20}%` }}
                      />
                    </div>
                    {strengthText ? (
                      <span className="text-xs font-medium text-gray-600">{strengthText}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm password"
                autoComplete="new-password"
                error={formState.errors.confirmPassword?.message}
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
                {...register('confirmPassword', { required: 'Please confirm your password' })}
              />

              <Button size="sm"
                type="submit"
                disabled={formState.isSubmitting || isLoading}
                className="w-full"
              >
                {formState.isSubmitting || isLoading ? 'Creating account...' : 'Create account'}
              </Button>

              <p className="text-center text-xs leading-5 text-slate-500">
                Creating an account starts a 30-day free trial. No credit card is required.
                Review <Link href="/pricing" className="text-brand-500 hover:underline">plan prices and billing terms</Link> before upgrading.
              </p>

              <p className="text-center text-xs">
                <span className="text-slate-500">Already have an account? </span>
                <Link href={loginHref} className="text-brand-500 hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>

      <p className="mt-4 text-center text-xs leading-4">
        <span className="text-slate-500">By clicking Create account, you agree to the </span>
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
}

export default function RegisterPageWrapper() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Register />
    </Suspense>
  );
}
