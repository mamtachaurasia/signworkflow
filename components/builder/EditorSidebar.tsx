import React from 'react';
import Fields from './Fields';
import RecipientsList from './RecipientsList';
import { FieldOwner } from '@/types/types';
import { useBuilderStore } from '@/hooks/useBuilderStore';

interface EditorSidebarProps {
  isReadOnly: boolean;
  mouseDownOnField: (component: string, event: React.MouseEvent<HTMLDivElement>, fieldOwner: FieldOwner) => void;
  selectedFile: File | null;
  onAddRecipients?: () => void;
}

const EditorSidebar: React.FC<EditorSidebarProps> = ({
  isReadOnly,
  mouseDownOnField,
  selectedFile,
  onAddRecipients,
}) => {
  const {
    draggingComponent: activeComponent,
    setDraggingComponent: setActiveComponent,
    recipients,
    droppedComponents,
  } = useBuilderStore();
  const fieldStats = React.useMemo<Record<string, { total: number; required: number }>>(() => {
    const stats: Record<string, { total: number; required: number }> = {};
    droppedComponents.forEach((field) => {
      if (field.fieldOwner === 'me') return;
      const recipientId = field.assignedRecipientId?.trim();
      if (!recipientId) return;
      if (!stats[recipientId]) {
        stats[recipientId] = { total: 0, required: 0 };
      }
      stats[recipientId].total += 1;
      if (field.required !== false) {
        stats[recipientId].required += 1;
      }
    });
    return stats;
  }, [droppedComponents]);

  return (
    <div className="bg-white w-70 flex flex-col select-none">
      {!isReadOnly && (
        <Fields
          activeComponent={activeComponent}
          setActiveComponent={setActiveComponent}
          mouseDown={mouseDownOnField}
          selectedFile={selectedFile}
        />
      )}
      <RecipientsList
        recipients={recipients}
        fieldStats={fieldStats}
        onAddRecipients={isReadOnly ? undefined : onAddRecipients}
        showStatus={isReadOnly}
      />
    </div>
  );
};

export default EditorSidebar;
