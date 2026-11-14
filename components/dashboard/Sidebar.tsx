import {
  Files,
  Contact,
  LifeBuoy,
  UserCog,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SecondarySidebarType, SidebarType } from '@/types/types';
import { Button } from '@ui';
import useContextStore from '@/hooks/useContextStore';
import { cn } from '@/lib/utils';

import AccountSidebar from '../builder/MyAccountNav';
import { AccountSection } from '@/config/account.config';
import { getDashboardAccountPath } from '@/lib/account-routing';
import DocumentsMenu from './DocumentMenu';
import ContactsSidebar from './ContactsSidebar';

export const PrimarySidebar = ({
  active,
  setActive,
}: {
  active: SidebarType;
  setActive: (s: SidebarType) => void;
}) => {
  const { user } = useContextStore();
  const router = useRouter();
  const contactsDisabled = !user?.orgId;
  const items = [
    {
      id: 'documents' as const,
      label: 'My Documents',
      title: 'Documents',
      icon: Files,
      disabled: false,
      onClick: () => {
        setActive('documents');
        router.push('/dashboard');
      },
    },
    {
      id: 'contacts' as const,
      label: contactsDisabled ? 'Requires workspace' : 'My Contacts',
      title: contactsDisabled ? 'Contacts are available after you join or create a workspace.' : 'Contacts',
      icon: Contact,
      disabled: contactsDisabled,
      onClick: () => {
        if (contactsDisabled) return;
        setActive('contacts');
        router.push('/dashboard?section=contacts');
      },
    },
    {
      id: 'account' as const,
      label: 'My Account',
      title: 'My Account',
      icon: UserCog,
      disabled: false,
      onClick: () => {
        setActive('account');
        router.push(getDashboardAccountPath('profile'));
      },
    },
  ];

  return (
    <div className={`relative z-30 flex w-16 shrink-0 flex-col items-center gap-3 border-r p-2 ${active === 'account' ? 'border-state-300' : 'border-slate-300'}`}>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;

        return (
          <div key={item.id} className={cn('relative group', `sidebar-item-${item.id}`)}>
            <Button
              type="button"
              size="icon"
              variant={isActive ? 'brand' : 'ghost'}
              onClick={item.onClick}
              title={item.title}
              aria-label={item.title}
              disabled={item.disabled}
              className={cn(
                'h-10 w-10 border-0 shadow-none',
                isActive
                  ? 'bg-brand text-white hover:bg-brand'
                  : 'text-slate-500 hover:bg-brand/10 hover:text-brand',
                item.disabled ? 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-slate-500' : ''
              )}
              icon={<Icon className="h-5 w-5" />}
            />
            <div className="pointer-events-none absolute left-12 top-1/2 z-30 hidden min-w-max -translate-y-1/2 rounded-md bg-gray-800 px-2 py-1.5 text-xs text-white shadow-lg group-hover:block group-focus-within:block">
              {item.label}
            </div>
          </div>
        );
      })}
      <div className="group relative mt-auto mb-1">
        <Button
          asChild
          size="icon"
          variant="ghost"
          title="Contact support"
          aria-label="Contact support"
          className="h-10 w-10 border-0 text-slate-500 shadow-none hover:bg-brand/10 hover:text-brand"
        >
          <a href="/api/support/sso" target="_blank" rel="noopener noreferrer">
            <LifeBuoy className="h-5 w-5" />
          </a>
        </Button>
        <div className="pointer-events-none absolute left-12 top-1/2 z-30 hidden min-w-max -translate-y-1/2 rounded-md bg-gray-800 px-2 py-1.5 text-xs text-white shadow-lg group-hover:block group-focus-within:block">
          Contact support
        </div>
      </div>
    </div>
  );
};

export const SecondarySidebar = ({
  active,
  activeSecondarybar,
  secondaryActive,
  className,
}: {
  active: SidebarType,
  activeSecondarybar: SecondarySidebarType,
  secondaryActive: (s: SecondarySidebarType) => void;
  className?: string;
}) => (
  <div className={`h-full w-64 p-5 ${className ?? ''}`}>
    {active === 'documents' &&
      <DocumentsMenu
        activeSecondarybar={activeSecondarybar as SecondarySidebarType}
        secondaryActive={secondaryActive}
      />
    }
    {active === 'contacts' && <ContactsSidebar />}
    {active === 'account' && <AccountSidebar
      active={activeSecondarybar as AccountSection}
      onChange={(e) => {
        secondaryActive(e as SecondarySidebarType);
      }}
    />}
  </div>
);
