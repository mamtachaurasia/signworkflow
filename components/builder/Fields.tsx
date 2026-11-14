import { Dispatch, SetStateAction, useMemo, useState } from 'react';
import {
  Image as Pic,
  Signature,
  Type,
  Calendar,
  Mail,
  CheckSquare,
  CircleDot,
  ChevronDown,
  Stamp,
  Camera,
  CaseUpper,
  User,
} from 'lucide-react';

import {DroppingField, FieldOwner, FieldsProps} from '@/types/types';

const fieldTypes = [
  { id: 'signature', icon: <Signature size={18} />, label: 'Signature' },
  { id: 'image', icon: <Pic size={18} />, label: 'Image' },
  { id: 'text', icon: <Type size={18} />, label: 'Text' },
  { id: 'date', icon: <Calendar size={18} />, label: 'Date' },
  { id: 'checkbox', icon: <CheckSquare size={18} />, label: 'Checkbox' },
  { id: 'radio', icon: <CircleDot size={18} />, label: 'Radio' },
  { id: 'dropdown', icon: <ChevronDown size={18} />, label: 'Dropdown' },
  { id: 'caseUpper', icon: <CaseUpper size={18} />, label: 'Initials' },
  { id: 'user', icon: <User size={18} />, label: 'Full Name' },
  { id: 'stamp', icon: <Stamp size={18} />, label: 'Stamp' },
  { id: 'live-photo', icon: <Camera size={18} />, label: 'Live Photo' },
  { id: 'Mail', icon: <Mail size={18} />, label: 'Email' },
];

export default function Fields({ activeComponent, mouseDown, setActiveComponent }: FieldsProps & {
  activeComponent: DroppingField | null;
  setActiveComponent: Dispatch<SetStateAction<DroppingField | null>>;
}) {
  const [selectedTab, setSelectedTab] = useState<FieldOwner>('recipients');
  const activeTab = useMemo<FieldOwner>(() => {
    if (!activeComponent?.fieldOwner) {
      return selectedTab;
    }
    return activeComponent.fieldOwner === 'me' ? 'me' : 'recipients';
  }, [activeComponent?.fieldOwner, selectedTab]);

  const handleTabChange = (tab: FieldOwner) => {
    setActiveComponent(null);
    setSelectedTab(tab);
  }

  return (
    <>
      <div className="bg-gray-50 border-b border-gray-300 p-4 pb-0 text-xs">
        Add Fields for the recipient by placing them on the document: 
      <div className="-mx-4 grid grid-cols-2 mt-4 px-4 text-center">
        <div
          className={`pb-1 cursor-pointer ${
            activeTab === 'recipients'
              ? 'text-brand-600 border-b-2 border-brand-600'
              : 'text-gray-500'
          }`}
          onClick={() => handleTabChange('recipients')}
        >
          Recipients
        </div>
        <div
          className={`pb-1 cursor-pointer ${
            activeTab === 'me'
              ? 'text-brand-600 border-b-2 border-brand-600'
              : 'text-gray-500'
          }`}
          onClick={() => handleTabChange('me')}
        >
          Me (Fill now)
        </div>
      </div>  
      </div>    
      <div className="grid grid-cols-2 gap-3 p-4">
        {fieldTypes.map((field) => {
          const isActive =
            activeComponent?.component === field.label;

          const baseColor =
            activeTab === 'me'
              ? 'bg-gray-100 hover:bg-gray-200'
              : 'bg-brand-50 hover:bg-brand-100';

          const activeColor =
            activeTab === 'me'
              ? 'bg-gray-300 hover:bg-gray-200'
              : 'bg-brand-300 hover:bg-brand-200';

          return (
          <div
            key={field.id}
            data-testid={`${field.label}-tool`}
            className={`flex items-center justify-start p-2 rounded transition text-sm ${
                isActive ? activeColor : baseColor
            }`}
            onMouseDown={(event) => mouseDown(field.label, event, activeTab)}
          >
            {field.icon}
            <span className="ml-2">{field.label}</span>
          </div>
        );
        })}
      </div>
    </>
  );
}
