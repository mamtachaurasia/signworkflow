import {
    User,
    CreditCard,
    Settings,
    Bell,
    Puzzle,
    Cloud,
    Users,
    Building2,
    ShieldCheck,
    Shield,
    FileSignature,
} from 'lucide-react';

export type AccountSection =
    | 'profile'
    | 'subscription'
    | 'settings'
    | 'signing-defaults'
    | 'payment-services'
    | 'notifications'
    | 'integrations'
    | 'cloud-storages'
    | 'my-teams'
    | 'workspace'
    | 'workspace-access'
    | 'audit-trail'
    | 'admin-governance';

export type AccountConfigItem = {
    id: AccountSection;
    label: string;
    icon: React.ElementType;
    hidden?: boolean;
};

export const ACCOUNT_CONFIG: readonly AccountConfigItem[] = [
    {
        id: 'profile',
        label: 'User Profile',
        icon: User,
    },
    {
        id: 'subscription',
        label: 'Subscription',
        icon: CreditCard,
    },
    {
        id: 'settings',
        label: 'Settings',
        icon: Settings,
    },
    {
        id: 'signing-defaults',
        label: 'Signing Defaults',
        icon: FileSignature,
    },
    {
        id: 'notifications',
        label: 'Notification Settings',
        icon: Bell,
    },
    {
        id: 'payment-services',
        label: 'Payment Services',
        icon: CreditCard,
    },
    {
        id: 'integrations',
        label: 'Integrations',
        icon: Puzzle,
    },
    {
        id: 'cloud-storages',
        label: 'Cloud Storage',
        icon: Cloud,
    },
    {
        id: 'my-teams',
        label: 'My Teams',
        icon: Users,
    },
    {
        id: 'workspace',
        label: 'My Workspaces',
        icon: Building2,
    },
    {
        id: 'workspace-access',
        label: 'Workspace Access',
        icon: Building2,
        hidden: true,
    },
    {
        id: 'audit-trail',
        label: 'Audit Trail',
        icon: ShieldCheck,
    },
    {
        id: 'admin-governance',
        label: 'Admin Governance',
        icon: Shield,
    },
] as const;
