import { CheckCircle, Eye, PenTool } from 'lucide-react';

export const ROLES = [
  {
    value: 'signer',
    label: 'Signer',
    icon: PenTool,
    description: 'Can sign and fill out the document',
    color: '#3B82F6',
    isNew: false,
  },
  {
    value: 'approver',
    label: 'Approver',
    icon: CheckCircle,
    description: 'Can approve or reject the document',
    color: '#10B981',
    isNew: true,
  },
  {
    value: 'viewer',
    label: 'Viewer',
    icon: Eye,
    description: 'Can only view the document',
    color: '#6B7280',
    isNew: false,
  },
] as const;
