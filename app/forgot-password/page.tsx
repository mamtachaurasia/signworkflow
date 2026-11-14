'use client';

import Link from 'next/link';
import { useState } from 'react';
import toast from 'react-hot-toast';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '@ui';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (res.ok) {
        toast.success(data.message || 'Reset link sent to your email');
        setSubmitted(true);
      } else {
        toast.error(data.error || 'An error occurred');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full px-4">
      <div className="relative mx-auto max-w-[500px]">
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardHeader className="space-y-2 px-6 pb-0 pt-6 text-center">
            <CardTitle className="text-center text-lg font-medium text-[#020817]">
              Reset your password
            </CardTitle>
            <CardDescription className="text-center text-xs text-slate-500">
              Enter your email address and we&apos;ll send you a link to reset your password
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6">
            {submitted ? (
              <div className="py-8 text-center">
                <div className="mb-4">
                  <svg
                    className="mx-auto h-12 w-12 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="mb-2 text-sm text-gray-700">Check your email for reset instructions</p>
                <p className="mb-6 text-xs text-slate-500">
                  We&apos;ve sent a password reset link to <strong>{email}</strong>
                </p>
                <Button size="sm" asChild variant="link" className="text-sm font-medium">
                  <Link href="/login">Back to login</Link>
                </Button>
              </div>
            ) : (
              <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

                <Button size="sm" type="submit" disabled={isSubmitting || !email} className="w-full">
                  {isSubmitting ? 'Sending reset link...' : 'Send reset link'}
                </Button>

                <p className="text-center text-xs">
                  <span className="text-slate-500">Remember your password? </span>
                  <Link href="/login" className="text-brand-500 hover:underline">
                    Sign in
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
