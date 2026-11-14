import {
    User,
    Settings,
    Trash2,
    FileStack,
    Layers,
} from 'lucide-react';


export type DocumentSection =
    | 'dash-documents'
    | 'templates'
    | 'my-templates'
    | 'system-templates'
    | 'trash';

export type DocumentConfigItem = {
    id: DocumentSection;
    label: string;
    icon: React.ElementType;
    children?: readonly DocumentConfigItem[];
};

export const DOCUMENT_CONFIG: readonly DocumentConfigItem[] = [
    {
        id: 'dash-documents',
        label: 'Documents',
        icon: FileStack as React.ElementType,
    },
    {
        id: 'templates',
        label: 'Templates',
        icon: Layers,
        children: [
            {
                id: 'my-templates',
                label: 'My Templates',
                icon: User,
            },
            {
                id: 'system-templates',
                label: 'System Templates',
                icon: Settings,
            },
        ],
    },
    {
        id: 'trash',
        label: 'Trash',
        icon: Trash2,
    },
] as const;
