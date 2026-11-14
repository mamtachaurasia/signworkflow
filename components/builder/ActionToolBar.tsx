'use client';
import React, {useEffect, useRef, useState } from "react";
import { FileText, PenLine, CheckLine,
  Undo,
  Redo,
  Eye,
  Download,
  HelpCircle,
  ChevronDown,
  History,
  Keyboard,
  Star,
  Merge,
  LogOut,
  Send,
  Sparkles
 } from "lucide-react";
import { useRouter, useSearchParams } from 'next/navigation';

import useContextStore from "@/hooks/useContextStore";
import MoreActions from "../MoreActionMenu";
import { HandleSavePDFOptions, Recipient, DroppedComponent, Doc } from "@/types/types";
import { downloadPdf, loadPdf, savePdfBlob } from '@/lib/pdf';
import { validateFieldValue } from '@/lib/field-rules';
import toast from 'react-hot-toast';
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { Badge, Button, Modal, SaveButton } from '@ui';
import { Input } from '@ui';
import { getTemplateReturnHref, parseTemplateNavigationContext } from '@/lib/template-navigation';

interface ActionToolBarProps {
  documentName: string;
  setDocumentName: React.Dispatch<React.SetStateAction<string>>;
  isEditingFileName: boolean;
  setIsEditingFileName: React.Dispatch<React.SetStateAction<boolean>>;
  handleSavePDF: (options: HandleSavePDFOptions) => Promise<boolean | null>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  recipients: Recipient[];
  onSendDocument: () => void;
  isAlreadySent?: boolean;
  onVoidAndDerive?: () => void;
  hasUnsavedChanges: boolean;
  droppedItems: DroppedComponent[];
  onSaveAsTemplate?: () => void;
  canSaveDocument?: boolean;
  isLoggedIn?: boolean;
  setShowModal?: (show: boolean) => void;
  checkFieldError: (updater: (prev: DroppedComponent[]) => DroppedComponent[]) => void;
  onPreviewDocument?: () => void;
  isTemplateEditor?: boolean;
  templateNavigation?: React.ReactNode;
  selectedFile?: File | string | Doc | null;
  documentId?: string | null;
  documentCreatedAt?: string | null;
  documentUpdatedAt?: string | null;
  derivedFromDocumentId?: string | null;
  derivedFromVersion?: number | null;
  onOpenAIAssistant?: () => void;
  onShowHistory?: () => void;
  onDiscardUnsavedChanges?: () => void;
}

const resolveDocFileValue = (doc: Doc): File | string | null => {
  if (doc.file instanceof File) return doc.file;
  if (typeof doc.file === 'string' && doc.file.trim().length > 0) return doc.file;
  if (typeof doc.fileUrl === 'string' && doc.fileUrl.trim().length > 0) return doc.fileUrl;
  if (typeof doc.url === 'string' && doc.url.trim().length > 0) return doc.url;
  return null;
};

const getLoadableFile = (value: Doc | File | string | null): File | string | null => {
  if (!value) return null;
  if (typeof value === 'string' || value instanceof File) return value;
  return resolveDocFileValue(value);
};

const ActionToolBar: React.FC<ActionToolBarProps> = ({
  documentName,
  setDocumentName,
  isEditingFileName,
  setIsEditingFileName,
  handleSavePDF,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  recipients,
  onSendDocument,
  isAlreadySent = false,
  onVoidAndDerive,
  hasUnsavedChanges,
  droppedItems = [],
  onSaveAsTemplate,
  canSaveDocument = true,
  isLoggedIn = true,
  setShowModal,
  checkFieldError,
  onPreviewDocument,
  isTemplateEditor = false,
  templateNavigation,
  selectedFile: propSelectedFile,
  documentId,
  documentCreatedAt,
  documentUpdatedAt,
  derivedFromDocumentId,
  derivedFromVersion,
  onOpenAIAssistant,
  onShowHistory,
  onDiscardUnsavedChanges,
}) => {
const hasSelfFields = droppedItems.some(item => item.fieldOwner === 'me');
const downloadDoc=async () => {
      if (!isLoggedIn) {
        setShowModal?.(true);
        return;
      }
      const loadableFile = getLoadableFile(selectedFile);
      if (!loadableFile) return;
      const pdfDoc = await loadPdf(loadableFile);
      const blob = await savePdfBlob(pdfDoc);
      downloadPdf(blob, documentName);
  }
const menuItems = [
  { label: isTemplateEditor ? "Download template PDF" : "Download plain PDF", icon: Download, action:downloadDoc },
  ...(!isTemplateEditor ? [
    { label: "Self‑Signed Download", icon: Merge, action: () => handleSavePDF({ isDownload: true, isMergeFields: true }), disabled: !hasSelfFields },
    ...(onShowHistory ? [{ label: 'History', icon: History, action: onShowHistory }] : []),
  ] : []),
  { type: 'divider' },
  { label: 'Keyboard Shortcuts', icon: Keyboard, action: () => setIsShortcutsDialogVisible(true) },
  { type: 'divider' },
  { label: 'Support', icon: HelpCircle, action: () => handleRouteChange('/contact') },
  { label: 'Upgrade Subscription', icon: Star, className: 'text-yellow-500', action: () => handleRouteChange('/account/subscription') },
];
  const { selectedFile: storeSelectedFile, user } = useContextStore();
  const selectedFile = propSelectedFile !== undefined ? propSelectedFile : storeSelectedFile;
  const [isUnsavedChangesDialogVisible, setIsUnsavedChangesDialogVisible] = useState(false);
  const [isShortcutsDialogVisible, setIsShortcutsDialogVisible] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{ path: string; replace: boolean } | null>(null);
  const [isNavigationSaving, setIsNavigationSaving] = useState(false);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const saveMenuRef = useRef<HTMLDivElement | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    if (!saveMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!saveMenuRef.current?.contains(event.target as Node)) setSaveMenuOpen(false);
    };
    window.addEventListener('pointerdown', closeMenu);
    return () => window.removeEventListener('pointerdown', closeMenu);
  }, [saveMenuOpen]);



  const router = useRouter();
  const searchParams = useSearchParams();
  const templateNavigationContext = parseTemplateNavigationContext(searchParams);
  const editorExitHref = templateNavigationContext
    ? getTemplateReturnHref(templateNavigationContext)
    : isTemplateEditor
      ? '/templates?view=my'
      : '/dashboard';
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Warm the exact originating template surface while the user works.
    router.prefetch(editorExitHref);
  }, [editorExitHref, router]);

  useEffect(() => {
    if (isEditingFileName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingFileName]);

  const formatTimestamp = (value?: string | Date | null): string => {
    if (!value) return 'Unknown';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString();
  };
  const currentDocumentId = documentId || 'Unknown';
  const authorLabel = (user?.name || '').trim() || user?.email || 'Unknown';
  const derivedFromLabel = derivedFromDocumentId
    ? `${derivedFromDocumentId}${typeof derivedFromVersion === 'number' ? ` (v${derivedFromVersion})` : ''}`
    : 'Original document';


 const validateAndSend = () => {
    const invalidFields: DroppedComponent[] = [];
    let hasRecipientFieldInvalid = false;
    let hasMeFieldInvalid = false;
    const selfFieldErrors = new Set<string>();

    if (!hasAssignedRecipientFields) {
      toast.error("Assign at least one field to a recipient before sending.");
      return;
    }

    if (signerFieldAssignmentError) {
      toast.error(signerFieldAssignmentError);
      return;
    }

    droppedItems.forEach((item) => {
      const assignedRecipientId = item.assignedRecipientId?.trim();
      const isRecipientFieldInvalid =
        item.fieldOwner !== "me" &&
        (!assignedRecipientId || !recipientIds.has(assignedRecipientId));
      const selfValidation = item.fieldOwner === 'me'
        ? validateFieldValue({
          component: item.component,
          required: item.required,
          value: item.data,
          settings: item.settings,
        })
        : { valid: true as const };
      const isMeFieldInvalid = item.fieldOwner === "me" && !selfValidation.valid;
      if (isMeFieldInvalid && selfValidation.reason) {
        selfFieldErrors.add(selfValidation.reason);
      }

      if (isRecipientFieldInvalid) hasRecipientFieldInvalid = true;
      if (isMeFieldInvalid) hasMeFieldInvalid = true;

      if (isRecipientFieldInvalid || isMeFieldInvalid) {
        invalidFields.push({ ...item, hasError: true });
      }
    });

    if (invalidFields.length > 0) {
      const invalidIds = new Set(invalidFields.map((field) => field.id));
      checkFieldError((prev) =>
        prev.map((field) => ({
          ...field,
          hasError: invalidIds.has(field.id),
        }))
      );

      // Show separate alerts
      if (hasRecipientFieldInvalid) {
        toast.error("All recipient fields must be assigned to an active recipient before sending.");
      }
      if (hasMeFieldInvalid) {
        const firstError = Array.from(selfFieldErrors)[0];
        toast.error(firstError || "Fill in your input field(s) before sending.");
      }

      return;
    }

    checkFieldError((prev) => prev.map((field) => ({ ...field, hasError: false })));
    onSendDocument();
  };

  const handleSave = async () => {
    if (!isLoggedIn) {
      setShowModal?.(true);
      return;
    }
    if (!canSaveDocument) {
      toast.error('Can Edit access is required to save document changes.');
      return;
    }
    if (!hasUnsavedChanges) return;

    setSaveStatus('saving');
    try {
      const success = await handleSavePDF({ isServerSave: true });
      if (success === null) {
        setSaveStatus('idle');
        toast.error('Document not ready to save. Try again in a moment.');
        return;
      }
      if (success) {
        setSaveStatus('saved');
        setLastSaved(new Date());
        toast.success('Saved ✓');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('idle');
        toast.error('Save failed. Please try again.');
      }
    } catch (error) {
      setSaveStatus('idle');
      toast.error('Error saving document. Please try again.');
      console.error(error);
    }
  };

  const handleSendClick = () => {
    if (!isLoggedIn) {
      setShowModal?.(true);
      return;
    }
    if (hasUnsavedChanges) {
      setIsUnsavedChangesDialogVisible(true);
    } else {
      validateAndSend();
    }
  };

  const handleRouteChange = (path: string, replace = false) => {
    if (hasUnsavedChanges) {
      setPendingNavigation({ path, replace });
      return;
    }
    navigateToRoute(path, replace);
  };

  const navigateToRoute = (path: string, replace: boolean) => {
    if (replace) {
      router.replace(path);
    } else {
      router.push(path);
    }
  };

  const handleExit = () => {
    handleRouteChange(editorExitHref, true);
  };

  const handleDiscardAndNavigate = () => {
    if (!pendingNavigation) return;
    const destination = pendingNavigation;
    onDiscardUnsavedChanges?.();
    setPendingNavigation(null);
    navigateToRoute(destination.path, destination.replace);
  };

  const handleSaveAndNavigate = async () => {
    if (!pendingNavigation) return;
    const destination = pendingNavigation;
    setIsNavigationSaving(true);
    try {
      const saved = await handleSavePDF({ isServerSave: true });
      if (!saved) {
        toast.error('Save failed. Your document is still open.');
        return;
      }
      setPendingNavigation(null);
      navigateToRoute(destination.path, destination.replace);
    } finally {
      setIsNavigationSaving(false);
    }
  };

  const handleSaveAndContinue = async () => {
    const success = await handleSavePDF({ isServerSave: true });
    if (success) {
      validateAndSend();
    } else {
      toast.error('Save failed. Your document is still open.');
      return;
    }
    setIsUnsavedChangesDialogVisible(false);
  };

  const recipientCount = recipients.length;
  const recipientIds = new Set(recipients.map((r) => r.id));
  const hasAssignedRecipientFields = droppedItems.some((item) => {
    const assignedRecipientId = item.assignedRecipientId?.trim();
    return (
      item.fieldOwner !== "me" &&
      assignedRecipientId &&
      recipientIds.has(assignedRecipientId)
    );
  });
  const missingSignerNames = recipients
    .filter((recipient) => recipient.role === 'signer' && !recipient.isCC)
    .filter((recipient) => !droppedItems.some((item) =>
      item.fieldOwner !== 'me' &&
      item.required !== false &&
      item.assignedRecipientId?.trim() === recipient.id
    ))
    .map((recipient) => recipient.name);
  const signerFieldAssignmentError = missingSignerNames.length > 0
    ? `Assign at least one required field to every signer before sending. Missing: ${missingSignerNames.join(', ')}.`
    : null;
  const isSendDisabled =
    isAlreadySent || recipientCount === 0 || !hasAssignedRecipientFields || Boolean(signerFieldAssignmentError);
  const sendTitle = isAlreadySent
    ? "This document already has an active signing request"
    : recipientCount === 0
      ? "Add recipients first"
      : !hasAssignedRecipientFields
        ? "Assign at least one field to a recipient before sending"
        : signerFieldAssignmentError
          ? signerFieldAssignmentError
        : "Send document to recipients";


  return (
    <>
      {/* <Toaster /> */}
      <UnsavedChangesDialog
        isVisible={isUnsavedChangesDialogVisible}
        onCancel={() => setIsUnsavedChangesDialogVisible(false)}
        onSaveAndContinue={handleSaveAndContinue}
      />
      <UnsavedChangesDialog
        isVisible={pendingNavigation !== null}
        onCancel={() => setPendingNavigation(null)}
        onSaveAndContinue={handleSaveAndNavigate}
        onDiscard={handleDiscardAndNavigate}
        title="Leave with unsaved changes?"
        confirmLabel={isNavigationSaving ? 'Saving…' : 'Save and Leave'}
        cancelLabel="Leave Without Saving"
        confirmClass="bg-brand-600 text-white hover:bg-brand-700"
        cancelClass="border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white"
        confirmDisabled={isNavigationSaving}
        cancelDisabled={isNavigationSaving}
        saving={isNavigationSaving}
        message={
          <p>Your unsaved document changes will be lost if you leave the builder.</p>
        }
      />
      <Modal
        visible={isShortcutsDialogVisible}
        onClose={() => setIsShortcutsDialogVisible(false)}
        title="Keyboard shortcuts"
      >
        <dl className="space-y-3 text-sm text-gray-700">
          <div className="flex items-center justify-between gap-6">
            <dt>Undo</dt>
            <dd><kbd className="rounded border border-gray-300 bg-gray-50 px-2 py-1">Ctrl/⌘ + Z</kbd></dd>
          </div>
          <div className="flex items-center justify-between gap-6">
            <dt>Redo</dt>
            <dd><kbd className="rounded border border-gray-300 bg-gray-50 px-2 py-1">Ctrl + Y or ⌘ + Shift + Z</kbd></dd>
          </div>
        </dl>
      </Modal>

    <div className="px-3 py-2 flex border-b border-gray-300">
      {/* Left main section */}
      <div className="flex min-w-0 flex-1 items-center gap-5">
          {!isTemplateEditor && (
           <div className="flex items-center bg-brand-50 rounded-sm px-2 py-1 w-65 space-x-2 relative">
              <FileText  size={16} className="text-brand-600 shrink-0" />

              {/* Rename  */}
              {isEditingFileName ? (
                <>
                <Input
                  ref={inputRef}
                  type="text"
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setIsEditingFileName(false);
                  }}
                    className="truncate text-xs focus:outline-0 p-1 h-6 rounded-sm w-full"
                />
                <CheckLine
                  size={16}
                    className="cursor-pointer text-gray-600 hover:text-brand-600"
                    onClick={() => setIsEditingFileName(false)}
                  />
                </>
              ) : (
                <>
                  <span className="truncate text-xs w-full">{documentName}</span>
                  <PenLine
                  size={16}
                    className="cursor-pointer text-gray-600 hover:text-brand-600"
                    onClick={() => setIsEditingFileName(true)}
                  />
                </>
              )}
            </div>
          )}
          {isTemplateEditor && templateNavigation}
          {isTemplateEditor && (
            <Badge className="bg-emerald-50 text-emerald-700">
              Template Builder
            </Badge>
          )}
          {/* ---info --*/}
          <div className="relative dropdown">
            <Button
              className="text-xs flex flex-row-reverse shadow-none py-1 h-8"
              type="button"
              aria-haspopup="true"
              aria-expanded="true"
              title="Info"
              inverted
              icon={<ChevronDown size={16} />}
               size="sm"
            >
              <span>Info</span>

            </Button>
            <div className="px-4 py-3 text-sm text-gray-900 space-y-1 w-75 mt-2  bg-white border border-gray-200 divide-y divide-gray-100 rounded-md shadow-lg outline-hidden absolute opacity-0 invisible dropdown-menu transition-all duration-300 transform z-20 top-6 left-0">
              <div>
                <small className="mb-4 text-gray-500">Last updated on</small>
                <p>{formatTimestamp(documentUpdatedAt)}</p>
              </div>
              <div>
                <small className="mb-4 text-gray-500">Created on</small>
                <p>{formatTimestamp(documentCreatedAt)}</p>
              </div>
              <div>
                <small className="mb-4 text-gray-500">Author</small>
                <p>{authorLabel}</p>
              </div>
              <div>
                <small className="mb-4 text-gray-500">Document Id</small>
                <p className="break-all">{currentDocumentId}</p>
              </div>
              <div>
                <small className="mb-4 text-gray-500">Derived from</small>
                <p className="break-all">{derivedFromLabel}</p>
              </div>
            </div>
          </div>
          {lastSaved && (
            <small>
              Saved at {" "} {lastSaved.toLocaleTimeString()}
            </small>
          )}
        </div>

        {/* Right Section */}
        <div className="flex flex-1 min-w-0 justify-end items-center gap-3 px-1">

              {/* Undo / Redo */}
            <div className="flex items-center gap-2">
              <Button
                aria-label="Undo (Ctrl+Z)"
                inverted
                onClick={onUndo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                icon={ <Undo size={20} />}
                className="shadow-none text-brand-700"
                type="button"
                size="sm"
              />
              <Button
                aria-label="Redo (Ctrl+Y)"
                inverted
                onClick={onRedo}
                disabled={!canRedo}
                title="Redo (Ctrl+Y)"
                icon={ <Redo size={20} />}
                className="shadow-none text-brand-700"
                size="sm"
              />
            </div>

            {!isTemplateEditor && (
              <Button
                aria-label="Preview Document"
                icon={<Eye size={16} />}
                inverted
                title="Preview Document"
                className="relative group p-3 shadow-none text-brand-700"
                onClick={onPreviewDocument}
                size="sm"
              >
                <div className="absolute top-full right-0 mt-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded-sm shadow-lg z-10">
                  Preview your document exactly as recipients see it. You can interact with fields, but signing is disabled.
                </div>
              </Button>
            )}
            <MoreActions menuItems={menuItems as []} />
            {!isTemplateEditor && onOpenAIAssistant && (
              <Button
                aria-label="Summarize document"
                icon={<Sparkles size={16} />}
                inverted
                title="Open AI summarization"
                label="Summarize"
                onClick={onOpenAIAssistant}
                size="sm"
              />
            )}
            <div ref={saveMenuRef} className="relative flex items-stretch">
              <SaveButton
                aria-label="Save Document"
                onClick={handleSave}
                disabled={!canSaveDocument || !hasUnsavedChanges || saveStatus === 'saving'}
                title={!canSaveDocument ? 'Can Edit access is required to save changes.' : isTemplateEditor ? 'Save template changes.' : 'Save your edits.'}
                saving={saveStatus === 'saving'}
                saved={saveStatus === 'saved'}
                label={isTemplateEditor ? 'Save template' : 'Save changes'}
                className={!isTemplateEditor && onSaveAsTemplate ? 'rounded-r-none' : undefined}
              />
              {!isTemplateEditor && onSaveAsTemplate && <><Button type="button" size="sm" aria-label="More save options" aria-haspopup="menu" aria-expanded={saveMenuOpen} onClick={() => setSaveMenuOpen((open) => !open)} className="rounded-l-none border-l border-white/30 px-2" icon={<ChevronDown size={15} />} />{saveMenuOpen && <div role="menu" className="absolute right-0 top-full z-50 mt-1 min-w-56 rounded-md border border-slate-200 bg-white p-1 shadow-lg"><button type="button" role="menuitem" onClick={() => { setSaveMenuOpen(false); onSaveAsTemplate(); }} className="w-full rounded px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">Save as Template</button></div>}</>}
            </div>
          {!isTemplateEditor && (
            <Button
              onClick={handleSendClick}
              disabled={isSendDisabled}
              title={sendTitle}
              label={`Send ${recipientCount}`}
              icon={<Send size={18}/>}
              size="sm"
            />
          )}
          {isAlreadySent && (
            <div className="flex items-center gap-2">
              <div className="text-xs text-amber-600">Already sent</div>
              <Button
                onClick={() => onVoidAndDerive?.()}
                title="Void the current request and start a new signing cycle"
                label="Void & Create New Revision"
                size="sm"
              />
            </div>
          )}
          <Button
            icon={<LogOut size={16} />}
            inverted
            title="Exit from builder"
            onClick={handleExit}
            aria-label="Exit from builder"
            className="shadow-none group relative p-3 text-brand-700"
            size="sm"
          >
           <div className="absolute top-full right-0 mt-2 hidden group-hover:block w-34 p-2 bg-gray-800 text-white text-xs rounded-sm shadow-lg z-1000">
                 Exit from builder
            </div>
          </Button>

        </div>

    </div>

  </>
  );
};

export default ActionToolBar;
