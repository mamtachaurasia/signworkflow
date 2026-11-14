'use client';

import { Building2, LifeBuoy } from 'lucide-react';
import { useRouter } from 'next/navigation';

import PersonalWorkspaceBanner from '@/components/account/PersonalWorkspaceBanner';
import { Button } from '@ui';
import { useAuth } from '@/components/auth/AuthProvider';
import useContextStore from '@/hooks/useContextStore';
import { getDashboardAccountPath } from '@/lib/account-routing';

export default function WorkspaceAccessPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { user } = useContextStore();

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      router.replace('/login');
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-2">
      <div className="space-y-6">
        <PersonalWorkspaceBanner
          actions={
            <>
              <Button size="sm"
                type="button"
                label="Go To Documents"
                onClick={() => router.push('/dashboard')}
              />
              <Button size="sm"
                type="button"
                inverted
                label="My Workspaces"
                onClick={() => router.push(getDashboardAccountPath('workspace'))}
              />
            </>
          }
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xs">
          <div className="space-y-4">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-slate-900">No active workspace access</h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                You are signed in{user?.email ? ` as ${user.email}` : ''}, but this account does not
                currently have access to an active workspace. Your trial workspace still works for
                documents and account settings while you wait for an invite or restore.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                  <Building2 className="h-4 w-4 text-slate-500" />
                  What to do next
                </div>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>Ask an owner or admin to invite you back or restore your membership.</li>
                  <li>Switch to another workspace once you have active access again.</li>
                  <li>You can still review your profile and account settings from the sidebar.</li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                  <LifeBuoy className="h-4 w-4 text-slate-500" />
                  Need help?
                </div>
                <p className="text-sm leading-6 text-slate-600">
                  If your access was removed by mistake, contact the owner of your workspace. They can
                  restore workspace access without recreating your account.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button size="sm"
                type="button"
                label="View Profile"
                onClick={() => router.push(getDashboardAccountPath('profile'))}
              />
              <Button size="sm" type="button" inverted label="Log out" onClick={() => void handleLogout()} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
