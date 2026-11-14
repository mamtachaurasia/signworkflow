'use client';

import TemplatePreview, { TemplatePreviewProps } from './TemplatePreview';
import { Modal } from '@ui';

export interface TemplatePreviewModalProps extends Omit<TemplatePreviewProps, 'onClose'> {
  isOpen: boolean;
  onClose: () => void;
}

export default function TemplatePreviewModal({
  isOpen,
  onClose,
  templateUrl,
  templateName,
  template,
}: TemplatePreviewModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      visible={isOpen}
      onClose={onClose}
      title="Template overview"
      description={templateName}
      className="w-[1120px] max-h-[90vh]"
    >
      <TemplatePreview
        templateUrl={templateUrl}
        templateName={templateName}
        template={template}
        onClose={onClose}
      />
    </Modal>
  );
}
