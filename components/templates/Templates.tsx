'use client';
import PdfThumbnail from '@/components/PdfThumbnails';
import TemplatePreviewModal from '@/components/TemplatePreviewModal';
import CreateTemplateModal from '@/components/CreateTemplateModal';
import useContextStore from '@/hooks/useContextStore';
import type { CreateDocumentFromTemplateResult, Template } from '@/hooks/useTemplates';
import { Copy, Eye, FilePen, FilePenLine, LockKeyhole, Plus, Share2, Trash2, Users } from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@ui';
import  DeleteModal  from './DeleteModal';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { isAdminRole } from '@/lib/role-utils';
import BulkSendTemplateModal from './BulkSendTemplateModal';
import type { TemplateJurisdiction } from '@/config/template-jurisdictions';
import { getPendingTemplateUseId } from '@/lib/template-use-guard';
import { evaluateTemplateReadiness } from '@/lib/template-readiness';
import { getCsrfHeaders } from '@/utils/cookies';
import {
  buildDocumentBuilderHref,
  buildTemplateBuilderHref,
  buildTemplateLoginHref,
  createTemplateNavigationContext,
  type TemplateNavigationWorkspace,
} from '@/lib/template-navigation';

function templateNeedsSetup(template: Template): boolean {
  return !evaluateTemplateReadiness({
    fields: template.fields,
    roles: template.defaultSigners,
    fieldLayoutStatus: template.fieldLayoutStatus,
  }).ready;
}

function getTemplateSetupWorkspace(template: Template): TemplateNavigationWorkspace {
  if (template.fieldLayoutStatus === 'needs_review') return 'review';
  if (templateNeedsSetup(template)) return 'fields';
  return template.editableContent ? 'content' : 'fields';
}

export function Templates({
  initialViewMode,
  templates,
  loading,
  error,
  fetchTemplates,
  duplicateTemplate,
  trashTemplate,
  createDocumentFromTemplate,
  onTemplateDeleted,
  searchQuery,
  selectedCategory,
  selectedJurisdiction,
}: {
  initialViewMode?: 'all' | 'my' | 'system',
  templates: Template[],
  loading: boolean,
  error: string | null,
  fetchTemplates: (category?: string, search?: string, isActive?: boolean, jurisdiction?: TemplateJurisdiction | null) => Promise<void>,
  duplicateTemplate: (templateId: string) => Promise<Template>,
  trashTemplate: (templateId: string) => Promise<Template | null>,
  createDocumentFromTemplate: (templateId: string, documentName?: string, variableValues?: Record<string, string>, recipientAssignments?: Array<{ id: string; name: string; email: string; role: 'signer' | 'approver' | 'viewer'; order: number }>, deferPreparation?: boolean) => Promise<CreateDocumentFromTemplateResult | null>,
  onTemplateDeleted?: () => void,
  searchQuery: string,
  selectedCategory: string | null,
  selectedJurisdiction?: TemplateJurisdiction | null
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isLoggedIn, setShowModal, user } = useContextStore();
  const { status: subscriptionStatus } = useSubscriptionStatus({ enabled: true });
  const [filterMode, setFilterMode] = useState<'all' | 'my' | 'system'>(initialViewMode || 'all');
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [localTemplates, setLocalTemplates] = useState<Template[]>(templates);
  const [operatingTemplateId, setOperatingTemplateId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
  const [bulkSendTemplate, setBulkSendTemplate] = useState<Template | null>(null);
  const [pendingUseTemplateId, setPendingUseTemplateId] = useState<string | null>(null);
  const [pendingCustomizeTemplateId, setPendingCustomizeTemplateId] = useState<string | null>(null);
  const envelopeOperationLockRef = useRef<string | null>(null);
  const lastConsumedUseIdRef = useRef<string | null>(null);
  const lastConsumedCustomizeIdRef = useRef<string | null>(null);
  const canShareTemplates = subscriptionStatus.entitlements.templateCollaboration;
  const canBulkSend = subscriptionStatus.entitlements.bulkSend;
  const canManageSharedTemplates = isAdminRole(user?.orgRole || user?.role);

  const canManageTemplate = (template: Template): boolean =>
    !template.isSystemTemplate && (canManageSharedTemplates || template.userId === user?.id);

  const getNavigationContext = () =>
    createTemplateNavigationContext(pathname, searchParams, filterMode);

  const getBuilderHref = (template: Template, workspace = getTemplateSetupWorkspace(template)) =>
    buildTemplateBuilderHref(template._id, workspace, getNavigationContext());

  useEffect(() => {
    setLocalTemplates(templates);
  }, [templates]);

  useEffect(() => {
    if (initialViewMode) setFilterMode(initialViewMode);
  }, [initialViewMode]);

  useEffect(() => {
    fetchTemplates(selectedCategory ?? undefined, searchQuery, undefined, selectedJurisdiction);
  }, [selectedCategory, selectedJurisdiction, searchQuery, fetchTemplates]);

  // Honor incoming view query param (e.g. ?view=my) so embedded dashboard can open My Templates
  useEffect(() => {
    const view = searchParams?.get('view');
    if (view === 'my' || view === 'system' || view === 'all') {
      setFilterMode(view);
    }
  }, [searchParams]);

  useEffect(() => {
    const useId = getPendingTemplateUseId({
      searchParams,
      pendingUseTemplateId,
      lastConsumedUseId: lastConsumedUseIdRef.current,
    });
    if (!useId) return;

    lastConsumedUseIdRef.current = useId;
    setPendingUseTemplateId(useId);
    const next = new URLSearchParams(searchParams?.toString() || '');
    next.delete('use');
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ''}`, { scroll: false });
  }, [pathname, pendingUseTemplateId, router, searchParams]);

  useEffect(() => {
    if (!isLoggedIn || pendingCustomizeTemplateId) return;
    const customizeId = searchParams?.get('customize');
    if (!customizeId || customizeId === lastConsumedCustomizeIdRef.current) return;

    lastConsumedCustomizeIdRef.current = customizeId;
    setPendingCustomizeTemplateId(customizeId);
    const next = new URLSearchParams(searchParams?.toString() || '');
    next.delete('customize');
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ''}`, { scroll: false });
  }, [isLoggedIn, pathname, pendingCustomizeTemplateId, router, searchParams]);


  const handleDuplicate = async (templateId: string) => {
    if (!isLoggedIn) {
      setShowModal(true);
      return;
    }

    const originalTemplates = localTemplates;
    const templateToDuplicate = localTemplates.find(t => t._id === templateId);

    if (!templateToDuplicate) return;
    setOperatingTemplateId(templateId);

    // Optimistic UI update: add duplicated template immediately
    const tempId = `temp_${Date.now()}`;
    const duplicatedTemplate: Template = {
      ...templateToDuplicate,
      _id: tempId,
      name: `${templateToDuplicate.name} (Copy)`,
    };
    setLocalTemplates([...localTemplates, duplicatedTemplate]);

    try {
      const result = await duplicateTemplate(templateId);
      // Replace temporary template with the actual response.
      setLocalTemplates(prev => [
        ...prev.filter(t => t._id !== tempId),
        result,
      ]);
      toast.success('Template duplicated successfully');
    } catch (error) {
      // Rollback on error
      setLocalTemplates(originalTemplates);
      toast.error(error instanceof Error ? error.message : 'Unable to create a template copy');
    } finally {
      setOperatingTemplateId(null);
    }
  };

  const createSystemTemplateCopy = async (template: Template) => {
    setOperatingTemplateId(template._id);
    try {
      const copy = await duplicateTemplate(template._id);
      if (!copy) throw new Error('Unable to create an editable copy');
      setLocalTemplates((current) => current.some((item) => item._id === copy._id) ? current : [...current, copy]);
      toast.success('Private editable copy created');
      router.push(getBuilderHref(copy, copy.editableContent ? 'content' : 'fields'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to customize this template');
    } finally {
      setOperatingTemplateId(null);
    }
  };

  const getCustomizeResumeHref = (templateId: string): string => {
    const context = getNavigationContext();
    const [returnPath, rawQuery = ''] = context.returnTo.split('?');
    const params = new URLSearchParams(rawQuery);
    params.set('customize', templateId);
    return `${returnPath}?${params.toString()}`;
  };

  const handleCustomizeTemplate = async (template: Template) => {
    if (!isLoggedIn) {
      router.push(buildTemplateLoginHref(getCustomizeResumeHref(template._id)));
      return;
    }
    await createSystemTemplateCopy(template);
  };

  const handleEditTemplate = async (template: Template) => {
    if (template.isSystemTemplate) {
      await handleCustomizeTemplate(template);
      return;
    }

    const builderHref = getBuilderHref(template);
    router.push(isLoggedIn ? builderHref : buildTemplateLoginHref(builderHref));
  };

  const handleDelete = async (template:Template) => {
    const templateId = template._id;

    setOperatingTemplateId(templateId);
    const originalTemplates = localTemplates;

    try {
      const result = await trashTemplate(templateId); // result is now Template | null
      if (result) { // If a template object is returned, it was successfully trashed
        // Update localTemplates to reflect the trashed state of the template
        setLocalTemplates(prev =>
          prev.map(t => (t._id === result._id ? { ...t, ...result } : t))
        );
        toast.success('Template moved to trash successfully');
        if (onTemplateDeleted) {
          onTemplateDeleted();
        }
      } else {
        // Rollback on failure (result is null)
        setLocalTemplates(originalTemplates);
        toast.error('Failed to move template to trash');
      }
    } catch {
      // Rollback on error
      setLocalTemplates(originalTemplates);
      toast.error('Failed to move template to trash');
    } finally {
      setOperatingTemplateId(null);
      setTemplateToDelete(null);
    }
  };

  const openCreatedAgreement = (result: CreateDocumentFromTemplateResult) => {
    router.push(buildDocumentBuilderHref(
      result.documentId,
      getNavigationContext(),
      result.guestId
    ));
  };

  const finishPreparedEnvelope = (result: CreateDocumentFromTemplateResult) => {
    toast.success('Envelope opened in the Builder');
    openCreatedAgreement(result);
  };

  const handleUseTemplate = async (template: Template) => {
    if (templateNeedsSetup(template)) {
      if (template.isSystemTemplate) {
        await handleCustomizeTemplate(template);
      } else if (canManageTemplate(template)) {
        await handleEditTemplate(template);
      } else {
        toast.error('Ask an owner or workspace admin to finish this template setup.');
      }
      return;
    }
    if (envelopeOperationLockRef.current !== null || operatingTemplateId !== null) return;

    envelopeOperationLockRef.current = template._id;
    setOperatingTemplateId(template._id);
    try {
      const documentName = `${template.name} - ${new Date().toLocaleDateString()}`;
      if (template.editableContent) {
        const result = await createDocumentFromTemplate(template._id, documentName, undefined, undefined, true);
        if (result) {
          finishPreparedEnvelope(result);
        } else {
          toast.error('Failed to create document from template');
        }
        return;
      }

      const result = await createDocumentFromTemplate(template._id, documentName);
      if (result) {
        finishPreparedEnvelope(result);
      } else {
        toast.error('Failed to create document from template');
      }
    } finally {
      envelopeOperationLockRef.current = null;
      setOperatingTemplateId(null);
    }
  };

  useEffect(() => {
    if (!pendingUseTemplateId) return;
    const template = localTemplates.find((item) => item._id === pendingUseTemplateId);
    if (!template) return;
    setPendingUseTemplateId(null);
    void handleUseTemplate(template);
    // The pending ID is the intentional one-shot trigger after returning from editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localTemplates, pendingUseTemplateId]);

  useEffect(() => {
    if (!pendingCustomizeTemplateId) return;
    const template = localTemplates.find((item) => item._id === pendingCustomizeTemplateId);
    if (!template) return;
    setPendingCustomizeTemplateId(null);
    if (!template.isSystemTemplate) {
      toast.error('Only system templates can be customized as a copy.');
      return;
    }
    void createSystemTemplateCopy(template);
    // The pending ID is the intentional one-shot trigger after authentication.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localTemplates, pendingCustomizeTemplateId]);

  const handleSharingScopeChange = async (template: Template, nextScope: 'private' | 'workspace') => {
    if (!isLoggedIn) {
      setShowModal(true);
      return;
    }
    if (!canShareTemplates) {
      toast.error('Business Plus is required to share templates with your workspace.');
      return;
    }

    setOperatingTemplateId(template._id);
    const originalTemplates = localTemplates;
    setLocalTemplates((prev) =>
      prev.map((item) =>
        item._id === template._id
          ? { ...item, sharingScope: nextScope }
          : item
      )
    );

    try {
      const response = await fetch(`/api/templates/${template._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
        credentials: 'include',
        body: JSON.stringify({ sharingScope: nextScope }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || 'Unable to update template sharing');
      }
      toast.success(
        nextScope === 'workspace'
          ? 'Template shared with your workspace'
          : 'Template moved back to private'
      );
      await fetchTemplates(selectedCategory ?? undefined, searchQuery);
    } catch (error) {
      setLocalTemplates(originalTemplates);
      toast.error(error instanceof Error ? error.message : 'Unable to update template sharing');
    } finally {
      setOperatingTemplateId(null);
    }
  };

  const isReadOnlyIncompleteTemplate = (template: Template): boolean =>
    templateNeedsSetup(template) && !template.isSystemTemplate && !canManageTemplate(template);

  const getPrimaryActionLabel = (template: Template): string => {
    if (!templateNeedsSetup(template)) return 'Create Envelope';
    if (template.isSystemTemplate) return 'Customize';
    if (canManageTemplate(template)) return 'Finish setup';
    return 'Ask an owner to finish setup';  
  };

  const handlePrimaryAction = async (template: Template) => {
    if (!templateNeedsSetup(template)) {
      await handleUseTemplate(template);
      return;
    }
    if (template.isSystemTemplate) {
      await handleCustomizeTemplate(template);
      return;
    }
    if (canManageTemplate(template)) await handleEditTemplate(template);
  };



  const filteredTemplates = localTemplates.filter((template) => {
    if (template.deletedAt || template.isActive === false) {
      return false;
    }
    if (selectedJurisdiction && template.jurisdiction !== selectedJurisdiction) {
      return false;
    }
    if (filterMode === 'my') {
      return !template.isSystemTemplate;
    }
    if (filterMode === 'system') {
      return template.isSystemTemplate;
    }
    return true;
  });


  return (
   <>
        {filterMode === 'my' && (
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">My Templates</h2>
              <p className="text-sm text-gray-500">
                Private templates you created and workspace-shared templates you can collaborate on.
              </p>
            </div>
            {isLoggedIn && (
              <Button size="sm"
                onClick={() => setShowCreateModal(true)}
               icon={<Plus className="w-4 h-4" />}
               label='Create Template'
              />
            )}
          </div>
        )}

        {loading && <div className="text-center py-12 text-gray-500">Loading templates...</div>}

        {error && <div className="text-center py-12 text-red-600">{error}</div>}

        {!loading && filteredTemplates.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map((template) => (
              <div key={template._id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition">
                <div className="bg-gray-200 relative">
                  {template.templateFileUrl ? (
                    <PdfThumbnail fileUrl={template.templateFileUrl} width={400} height={225} className="w-full h-full object-cover" />
                  ) : template.thumbnailUrl ? (
                    <Image
                      src={template.thumbnailUrl}
                      alt={template.name}
                      className="w-full h-full object-cover"
                      quality={100}
                      width={100}
                      height={100}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.onerror = null;
                        target.style.display = 'none';
                        target.parentElement?.querySelector('.fallback-thumb')?.classList.remove('hidden');
                      }} />
                  ) : (
                      <div title="System Template" className={`fallback-thumb absolute top-2 right-2 bg-blue-500 p-1 rounded-sm flex items-center text-white text-xs`}>
                        {template.pageCount || 1} page(s)
                      </div>
                  )}
                  {template.isSystemTemplate && (
                      <div title="System Template" className={`fallback-thumb absolute top-2 right-2 bg-purple-500 p-1 rounded-sm flex items-center text-white text-xs`}>
                        {template.pageCount || 1} page(s)
                      </div>
                  )}
              

                <div className="p-4 absolute bottom-0 text-gray-900 bg-white/10 backdrop-blur-xl border-t w-full">
                  <h3 className="font-semibold text-lg mb-1 truncate">{template.name}</h3>
                  {template.description && (
                    <p className="text-sm mb-3 line-clamp-2">{template.description}</p>
                  )}

                  <div className="flex items-center justify-between mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs bg-sky-700 text-gray-100 px-2 py-1 rounded-sm">
                        {template.category}
                      </span>
                      {template.editableContent && (
                        <span className="rounded-sm bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                          Fully editable
                        </span>
                      )}
                      <span className={`rounded-sm px-2 py-1 text-xs font-medium ${
                        templateNeedsSetup(template)
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {templateNeedsSetup(template) ? 'Setup required' : 'Ready to use'}
                      </span>
                      {template.sharingScope === 'workspace' && (
                        <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                          <Users className="h-3.5 w-3.5" />
                          Workspace shared
                        </span>
                      )}
                      {!template.isSystemTemplate &&
                        template.sharingScope === 'workspace' &&
                        template.userId &&
                        template.userId !== user?.id && (
                          <span className="rounded-sm bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                            Shared by teammate
                          </span>
                        )}
                    </div>
                    {template.duplicateCount ? (
                      <span className="text-xs text-sky-700">Used {template.duplicateCount} times</span>
                    ) : null}
                  </div>

                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={() => void handlePrimaryAction(template)}
                      className="cursor-pointer text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={operatingTemplateId !== null || isReadOnlyIncompleteTemplate(template)}
                      title={isReadOnlyIncompleteTemplate(template)
                        ? 'An owner or workspace admin must finish setup before this template can Create Envelopes.'
                        : undefined}
                    >
                      {!templateNeedsSetup(template) ? (
                        <Plus className="w-4 h-4" />
                      ) : template.isSystemTemplate ? (
                        <Copy className="w-4 h-4" />
                      ) : canManageTemplate(template) ? (
                        <FilePenLine className="w-4 h-4" />
                      ) : (
                        <LockKeyhole className="w-4 h-4" />
                      )}
                      {getPrimaryActionLabel(template)}
                    </Button>
                    {!templateNeedsSetup(template) &&
                      (template.isSystemTemplate || (isLoggedIn && canManageTemplate(template))) && (
                      <Button
                       size="sm"
                       variant={'link'}
                        onClick={() => template.isSystemTemplate
                          ? void handleCustomizeTemplate(template)
                          : void handleEditTemplate(template)}
                        className="cursor-pointer text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        title={template.isSystemTemplate ? 'Create your own editable copy' : 'Open Template Builder'}
                        disabled={operatingTemplateId !== null}
                      >
                        {template.isSystemTemplate ? 'Customize' : <FilePen className="w-4 h-4" xlinkTitle="Edit Template"/>}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={'link'}
                      onClick={() => setPreviewTemplate(template)}
                      className="cursor-pointer text-xs p-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Template overview"
                      aria-label={`View ${template.name} template overview`}
                      disabled={operatingTemplateId !== null}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {!template.isSystemTemplate && (
                      <Button
                        size="sm"
                        variant={'link'}
                        onClick={() => handleDuplicate(template._id)}
                        className="cursor-pointer text-xs p-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Duplicate template"
                        aria-label={`Duplicate ${template.name}`}
                        disabled={operatingTemplateId !== null}
                      >
                        <Copy className={`w-4 h-4 ${operatingTemplateId === template._id ? 'animate-spin' : ''}`} />
                      </Button>
                    )}
                    {canBulkSend && !templateNeedsSetup(template) && (
                      <Button
                        variant={'link'}
                        size="sm"
                        onClick={() => setBulkSendTemplate(template)}
                        className="cursor-pointer text-xs p-2 disabled:opacity-50 disabled:cursor-not-allowed"  
                        title="Bulk Send"
                        disabled={operatingTemplateId !== null}
                      >
                        <Users className="w-4 h-4" />
                      </Button>
                    )}
                    {isLoggedIn && (
                      <>
                        {!template.isSystemTemplate &&
                          (canManageSharedTemplates || template.userId === user?.id) && (
                            <Button
                             size="sm"
                              variant={'link'}
                              onClick={() =>
                                handleSharingScopeChange(
                                  template,
                                  template.sharingScope === 'workspace' ? 'private' : 'workspace'
                                )
                              }
                               className="cursor-pointer text-xs p-2 disabled:opacity-50 disabled:cursor-not-allowed"  
                              title={
                                template.sharingScope === 'workspace'
                                  ? 'Make private'
                                  : 'Share with workspace'
                              }
                              disabled={operatingTemplateId !== null}
                            >
                              <Share2 className={`w-4 h-4 ${operatingTemplateId === template._id ? 'animate-spin' : ''}`} />
                            </Button>
                          )}
                          {!template.isSystemTemplate &&
                            (canManageSharedTemplates || template.userId === user?.id) && (
                            <Button
                              size="sm"
                              variant={'destructive'}
                              onClick={() => setTemplateToDelete(template)}
                              className="cursor-pointer text-xs p-2 disabled:opacity-50 disabled:cursor-not-allowed"  
                              title="Delete template"
                              disabled={operatingTemplateId !== null}
                            >
                              <Trash2 className={`w-4 h-4 ${operatingTemplateId === template._id ? 'animate-spin' : ''}`} />
                            </Button>
                          )}
                      </>
                    )}
                  </div>
                </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filteredTemplates.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4 text-6xl">📄</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No templates found</h3>
            <p className="text-gray-600 mb-6">
              {searchQuery ? 'Try adjusting your search' : 'Create your first template to get started'}
            </p>
        
          </div>
        )}
  
        {previewTemplate && (
          <TemplatePreviewModal
            isOpen={!!previewTemplate}
            onClose={() => setPreviewTemplate(null)}
            templateUrl={previewTemplate.templateFileUrl}
            templateName={previewTemplate.name}
            template={previewTemplate}
          />
        )}

        {showCreateModal && (
          <CreateTemplateModal
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => {
              setShowCreateModal(false);
              fetchTemplates(selectedCategory ?? undefined, searchQuery);
            }}
          />
        )}
      {templateToDelete && (
        <DeleteModal
          isOpen={!!templateToDelete}
          onClose={() => setTemplateToDelete(null)} 
          onConfirmDelete={() => handleDelete(templateToDelete as Template)}
          selectedDocs={[templateToDelete]}
        />
      )} 
      <BulkSendTemplateModal
        isOpen={Boolean(bulkSendTemplate)}
        template={bulkSendTemplate}
        onClose={() => setBulkSendTemplate(null)}
      />
    </>
  );
}
