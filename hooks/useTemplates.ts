'use client';

import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { TemplateJurisdiction } from '@/config/template-jurisdictions';
import type {
    CreateDocumentFromTemplateResult,
    CreateScratchTemplateInput,
    CreateTemplateInput,
    Template,
} from '@/types/templates';
import { getCsrfHeaders } from '@/utils/cookies';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setTemplates,
  setTemplatesError,
  setTemplatesLoading,
  setTrashedTemplatesCount,
  upsertTemplate,
} from '@/store/slices/templatesSlice';

export type {
    CreateDocumentFromTemplateResult,
    CreateScratchTemplateInput,
    CreateTemplateInput,
    Template,
    TemplateMetadataInput,
    TemplateSaveMode,
} from '@/types/templates';

export function useTemplates() {
    const dispatch = useAppDispatch();
    const templates = useAppSelector((state) => state.templates.items);
    const loading = useAppSelector((state) => state.templates.loading);
    const error = useAppSelector((state) => state.templates.error);
    const isLoggedIn = useAppSelector((state) => state.session.isLoggedIn);

    const persistGuestSessionId = useCallback((guestId: unknown): string | null => {
        if (typeof guestId === 'string' && guestId.startsWith('guest_')) {
            localStorage.setItem('guest_session_id', guestId);
            return guestId;
        }
        return null;
    }, []);

    const resolveGuestSessionId = useCallback((): string => {
        const existing = persistGuestSessionId(localStorage.getItem('guest_session_id'));
        if (existing) return existing;
        const next = `guest_${uuidv4()}`;
        persistGuestSessionId(next);
        return next;
    }, [persistGuestSessionId]);

    const fetchTemplates = useCallback(async (category?: string, search?: string, isActive?: boolean, jurisdiction?: TemplateJurisdiction | null) => {
        dispatch(setTemplatesLoading(true));
        dispatch(setTemplatesError(null));
        try {
            const params = new URLSearchParams();
            if (category) params.append('category', category);
            if (search) params.append('search', search);
            if (typeof isActive === 'boolean') {
                params.append('isActive', String(isActive));
            }
            if (jurisdiction) params.append('jurisdiction', jurisdiction);

            const response = await fetch(`/api/templates/list?${params}`, {
                credentials: 'include',
            });

            if (!response.ok) throw new Error('Failed to fetch templates');
            const data = await response.json();
            dispatch(setTemplates(data.templates || []));
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'An error occurred';
            dispatch(setTemplatesError(errMsg));
            console.error('Error fetching templates:', errMsg);
        } finally {
            dispatch(setTemplatesLoading(false));
        }
    }, [dispatch]);

    const createTemplate = useCallback(async (templateData: CreateTemplateInput) => {
        dispatch(setTemplatesLoading(true));
        dispatch(setTemplatesError(null));
        try {
            const response = await fetch('/api/templates/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getCsrfHeaders(),
                },
                credentials: 'include',
                body: JSON.stringify(templateData),
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => null);
                throw new Error(errorPayload?.message || 'Failed to create template');
            }

            const data = await response.json();
            if (!data.template) {
                throw new Error('The template was saved without a usable response. Please try again.');
            }
            dispatch(upsertTemplate(data.template));
            return data.template;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'An error occurred';
            dispatch(setTemplatesError(errMsg));
            console.error('Error creating template:', err);
            throw err instanceof Error ? err : new Error(errMsg);
        } finally {
            dispatch(setTemplatesLoading(false));
        }
    }, [dispatch]);

    const createScratchTemplate = useCallback(async (
        templateData: CreateScratchTemplateInput = {}
    ): Promise<Template> => {
        dispatch(setTemplatesLoading(true));
        dispatch(setTemplatesError(null));
        try {
            const response = await fetch('/api/templates/scratch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getCsrfHeaders(),
                },
                credentials: 'include',
                body: JSON.stringify({
                    name: templateData.name?.trim() || 'Untitled template',
                }),
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Failed to create a blank template');
            }
            if (!data?.success || !data.template) {
                throw new Error('The blank template was created without a usable response. Please try again.');
            }

            dispatch(upsertTemplate(data.template));
            return data.template as Template;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'An error occurred';
            dispatch(setTemplatesError(errMsg));
            console.error('Error creating scratch template:', err);
            throw err instanceof Error ? err : new Error(errMsg);
        } finally {
            dispatch(setTemplatesLoading(false));
        }
    }, [dispatch]);

    const duplicateTemplate = useCallback(async (templateId: string) => {
        dispatch(setTemplatesLoading(true));
        dispatch(setTemplatesError(null));
        try {
            const response = await fetch('/api/templates/duplicate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getCsrfHeaders(),
                },
                credentials: 'include',
                body: JSON.stringify({ templateId }),
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => null);
                throw new Error(errorPayload?.message || 'Failed to duplicate template');
            }

            const data = await response.json();
            if (!data.template) {
                throw new Error('The template copy was created without a usable response. Please try again.');
            }
            dispatch(upsertTemplate(data.template));
            return data.template;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'An error occurred';
            dispatch(setTemplatesError(errMsg));
            console.error('Error duplicating template:', err);
            throw err instanceof Error ? err : new Error(errMsg);
        } finally {
            dispatch(setTemplatesLoading(false));
        }
    }, [dispatch]);

    const deleteTemplate = useCallback(async (templateId: string) => {
        dispatch(setTemplatesLoading(true));
        dispatch(setTemplatesError(null));
        try {
            const response = await fetch(`/api/templates/${templateId}`, {
                method: 'DELETE',
                headers: getCsrfHeaders(),
                credentials: 'include',
            });

            if (!response.ok) throw new Error('Failed to delete template');
            dispatch(setTemplates(templates.filter((template) => template._id !== templateId)));
            return true;
        } catch (err) {
            dispatch(setTemplatesError(err instanceof Error ? err.message : 'An error occurred'));
            console.error('Error deleting template:', err);
            return false;
        } finally {
            dispatch(setTemplatesLoading(false));
        }
    }, [dispatch, templates]);

    const fetchTrashedTemplatesCount = useCallback(async () => {
        dispatch(setTemplatesLoading(true));
        dispatch(setTemplatesError(null));
        try {
            const response = await fetch('/api/templates/list?isActive=false&returnCount=true', {
                credentials: 'include',
            });

            if (!response.ok) throw new Error('Failed to fetch trashed templates count');
            const data = await response.json();
            dispatch(setTrashedTemplatesCount(data.totalCount));
        } catch (err) {
            dispatch(setTemplatesError(err instanceof Error ? err.message : 'An error occurred'));
            console.error('Error fetching trashed templates count:', err);
        } finally {
            dispatch(setTemplatesLoading(false));
        }
    }, [dispatch]);

    const trashTemplate = useCallback(async (templateId: string): Promise<Template | null> => {
        dispatch(setTemplatesLoading(true));
        dispatch(setTemplatesError(null));
        try {
            const response = await fetch('/api/templates/trash', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getCsrfHeaders(),
                },
                credentials: 'include',
                body: JSON.stringify({ templateIds: [templateId] }),
            });

            if (!response.ok) {
                let errorMessage = 'Failed to trash template';
                try {
                    const contentType = response.headers.get('content-type');
                    if (contentType?.includes('application/json')) {
                        const errorPayload = await response.json();
                        errorMessage = errorPayload?.message || errorMessage;
                    }
                } catch {
                    throw new Error('Failed to move template in trash.');
                }

                throw new Error(errorMessage);
            }
            const data = await response.json();
            if (data.template) {
                dispatch(upsertTemplate(data.template));
            }
            void fetchTrashedTemplatesCount();

            return data.template ?? null;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An error occurred';
            dispatch(setTemplatesError(message));
            console.error('Error trashing template:', err);
            return null;
        } finally {
            dispatch(setTemplatesLoading(false));
        }
    }, [dispatch, fetchTrashedTemplatesCount]);

    const restoreTemplate = useCallback(async (templateId: string): Promise<boolean> => {
        dispatch(setTemplatesLoading(true));
        dispatch(setTemplatesError(null));
        try {
            const response = await fetch(`/api/templates/restore`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getCsrfHeaders(),
                },
                credentials: 'include',
                body: JSON.stringify({ templateIds: [templateId] }),
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => null);
                throw new Error(errorPayload?.message || 'Failed to restore template');
            }
            void fetchTrashedTemplatesCount();
            return true;
        } catch (err) {
            dispatch(setTemplatesError(err instanceof Error ? err.message : 'An error occurred'));
            console.error('Error restoring template:', err);
            return false;
        } finally {
            dispatch(setTemplatesLoading(false));
        }
    }, [dispatch, fetchTrashedTemplatesCount]);

    const createDocumentFromTemplate = useCallback(async (templateId: string, documentName?: string, variableValues?: Record<string, string>, recipientAssignments?: Array<{ id: string; name: string; email: string; role: 'signer' | 'approver' | 'viewer'; order: number }>, deferPreparation?: boolean): Promise<CreateDocumentFromTemplateResult | null> => {
        dispatch(setTemplatesLoading(true));
        dispatch(setTemplatesError(null));
        try {
            const guestId = isLoggedIn ? null : resolveGuestSessionId();

            const response = await fetch('/api/templates/use', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getCsrfHeaders(),
                },
                credentials: 'include',
                body: JSON.stringify({
                    templateId,
                    documentName,
                    variableValues,
                    recipientAssignments,
                    deferPreparation,
                    ...(guestId ? { guestId } : {}),
                }),
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => null);
                throw new Error(errorPayload?.message || 'Failed to create document from template');
            }
            const data: CreateDocumentFromTemplateResult = await response.json();
            localStorage.setItem('currentDocumentId', data.documentId);
            localStorage.setItem('currentSessionId', data.sessionId);
            persistGuestSessionId(data.guestId);

            return data;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'An error occurred';
            dispatch(setTemplatesError(errMsg));
            console.error('Error using template:', err);
            return null;
        } finally {
            dispatch(setTemplatesLoading(false));
        }
    }, [dispatch, isLoggedIn, persistGuestSessionId, resolveGuestSessionId]);

    const uploadTemplate = useCallback(async (file: File, templateData: Partial<Template>) => {
        dispatch(setTemplatesLoading(true));
        dispatch(setTemplatesError(null));
        try {
            const formData = new FormData();

            formData.append('file', file);
            formData.append('name', templateData.name || '');
            formData.append('description', templateData.description || '');
            formData.append('category', templateData.category || '');
            formData.append('sharingScope', templateData.sharingScope || 'private');
            if (templateData.tags && Array.isArray(templateData.tags)) {
                formData.append('tags', templateData.tags.join(', '));
            }

            const response = await fetch('/api/templates/upload', {
                method: 'POST',
                body: formData,
                headers: getCsrfHeaders(),
                credentials: 'include',
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => null);
                throw new Error(errorPayload?.message || 'Failed to upload template');
            }

            const data = await response.json();
            if (data.template) {
                dispatch(upsertTemplate(data.template));
            }
            return data.template;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'An error occurred';
            dispatch(setTemplatesError(errMsg));
            console.error('Error uploading template:', err);
            throw err instanceof Error ? err : new Error(errMsg);
        } finally {
            dispatch(setTemplatesLoading(false));
        }
    }, [dispatch]);

    return {
        templates,
        loading,
        error,
        fetchTemplates,
        createTemplate,
        createScratchTemplate,
        duplicateTemplate,
        deleteTemplate,
        createDocumentFromTemplate,
        uploadTemplate,
        trashTemplate,
        restoreTemplate,
        fetchTrashedTemplatesCount,
    };
}
