import UserDropdown from '../UserDropdown';
import { CircleQuestionMark } from 'lucide-react';
import Link from 'next/link';
import TrialStatusCallout from '@/components/account/TrialStatusCallout';
import { Button } from '@ui';
import NotificationBell from '@/components/dashboard/NotificationBell';

type DashboardHeaderProps = {
  trialEndsAt?: string | null;
  workspaceName?: string | null;
  showTrialUpgrade?: boolean;
  showTrialOnly?: boolean;
};

const DashboardHeader = ({
  trialEndsAt = null,
  workspaceName = null,
  showTrialUpgrade = false,
  showTrialOnly = false,
}: DashboardHeaderProps) => {
  return (
    <>
      {!showTrialOnly ? (
        <Button asChild size="sm" className="text-xs" variant="dark">
          <Link href="/contact">Contact Sales</Link>
        </Button>
      ) : null}
      {showTrialUpgrade ? (
        <TrialStatusCallout
          trialEndsAt={trialEndsAt}
          workspaceName={workspaceName}
          variant="header"
          className="shrink-0"
        />
      ) : (
        <Link className="rounded bg-orange-500 p-2 text-sm text-white" href="/pricing"> Select Plan </Link>
      )}
      <NotificationBell />
      <CircleQuestionMark className="mr-2 h-4 w-4" />
      <UserDropdown />
    </>
  );
}

export default DashboardHeader;
