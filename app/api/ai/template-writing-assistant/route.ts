import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClientIp, isSecureRequest, validateCsrfToken, withSecurityHeaders } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { hasAnySignedRecipient } from '@/lib/document-guards';
import { buildDocumentWriteFilter, normalizeShareEmail } from '@/lib/document-sharing';
import { canManageTemplate } from '@/lib/template-access';
import { consumeRateLimit } from '@/lib/rateLimit';
import { getAIService } from '@/lib/modules/ai/ai.service';
import {
  getNewWritingSmartVariableKeys,
  WritingAssistantInputError,
  WritingAssistantProviderError,
  WritingPlaceholderIntegrityError,
} from '@/lib/modules/ai/writing-assistant';
import DocumentModel from '@/models/Document';
import TemplateModel from '@/models/Template';
import UserModel from '@/models/Users';
import connectDB from '@/utils/db';

const ObjectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const Schema = z.object({
  templateId: ObjectIdSchema.optional(),
  documentId: ObjectIdSchema.optional(),
  mode: z.enum(['draft','rewrite','professional','concise','plain_language','grammar']),
  allowNewVariables: z.boolean().optional(),
  instruction: z.string().max(2000).default(''),
  selectedText: z.string().max(12000).default(''),
  sectionText: z.string().max(12000).default(''),
}).refine(
  ({ templateId, documentId }) => Boolean(templateId) !== Boolean(documentId),
  { message: 'Exactly one writing resource is required.' }
);

async function getRequesterEmail(userId: string): Promise<string | null> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null;
  const user = await UserModel.findById(userId)
    .select('email')
    .lean<{ email?: unknown } | null>();
  return normalizeShareEmail(user?.email);
}

function smartVariableLabel(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export async function POST(req: NextRequest) {
  if (!isSecureRequest(req)) return withSecurityHeaders(req, NextResponse.json({ message: 'HTTPS is required' }, { status: 400 }));
  if (!validateCsrfToken(req)) return withSecurityHeaders(req, NextResponse.json({ message: 'CSRF validation failed' }, { status: 403 }));
  const auth = await getAuthContext(req);
  if (!auth?.userId || auth.userId.startsWith('guest_')) return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  const rateLimit = await consumeRateLimit({ key: `${auth.userId}:${getClientIp(req)}`, namespace: 'ai:writing', limit: 30, windowSeconds: 900 });
  if (!rateLimit.allowed) return withSecurityHeaders(req, NextResponse.json({ message: 'Too many requests. Try again later.' }, { status: 429 }));
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid writing request' }, { status: 400 }));
  await connectDB();
  const resourceType = parsed.data.templateId ? 'template' : 'document';
  const resourceId = parsed.data.templateId || parsed.data.documentId;
  let canCreateNewVariables = false;
  let existingDocumentVariableKeys = new Set<string>();
  if (parsed.data.templateId) {
    if (!auth.orgId) return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
    const template = await TemplateModel.findById(parsed.data.templateId);
    if (!template || template.isSystemTemplate || !canManageTemplate(template, auth)) {
      return withSecurityHeaders(req, NextResponse.json({ message: 'Only your editable template copy can use AI writing.' }, { status: 403 }));
    }
  } else if (parsed.data.documentId) {
    const requesterEmail = await getRequesterEmail(auth.userId);
    const document = await DocumentModel.findOne(buildDocumentWriteFilter({
      userId: auth.userId,
      orgId: auth.orgId,
      userEmail: requesterEmail,
      documentId: parsed.data.documentId,
      minimumAccess: 'can_edit',
    }));
    if (
      !document ||
      !document.editableContent ||
      !['draft', 'saved'].includes(String(document.status)) ||
      hasAnySignedRecipient(document)
    ) {
      return withSecurityHeaders(req, NextResponse.json({ message: 'Only editable draft documents can use AI writing.' }, { status: 403 }));
    }
    existingDocumentVariableKeys = new Set(
      Array.isArray(document.editableContent.variables)
        ? document.editableContent.variables
          .map((variable: { key?: unknown }) => variable?.key)
          .filter((key: unknown): key is string => typeof key === 'string')
        : []
    );
    canCreateNewVariables = parsed.data.mode === 'draft' && parsed.data.allowNewVariables === true;
  }
  try {
    const source = parsed.data.selectedText.trim() || parsed.data.sectionText.trim() || 'Draft new agreement language.';
    let aiService: ReturnType<typeof getAIService>;
    try {
      aiService = getAIService();
    } catch (error) {
      throw new WritingAssistantProviderError(error);
    }
    const suggestion = canCreateNewVariables
      ? await aiService.assistWriting(source, parsed.data.instruction, parsed.data.mode, { allowNewVariables: true })
      : await aiService.assistWriting(source, parsed.data.instruction, parsed.data.mode);
    const newVariables = canCreateNewVariables
      ? getNewWritingSmartVariableKeys(source, suggestion)
        .filter((key) => !existingDocumentVariableKeys.has(key))
        .map((key) => ({
          key,
          label: smartVariableLabel(key),
          defaultValue: '',
          required: true,
        }))
      : [];
    return withSecurityHeaders(req, NextResponse.json(
      newVariables.length > 0 ? { suggestion, newVariables } : { suggestion }
    ));
  } catch (error) {
    if (error instanceof WritingPlaceholderIntegrityError) {
      return withSecurityHeaders(req, NextResponse.json({
        code: error.code,
        message: 'The AI suggestion changed one or more template variables. Please try again.',
      }, { status: 422 }));
    }
    if (error instanceof WritingAssistantInputError) {
      return withSecurityHeaders(req, NextResponse.json({
        code: error.code,
        message: 'The selected text or writing instruction could not be processed.',
      }, { status: 400 }));
    }
    if (error instanceof WritingAssistantProviderError) {
      console.error('AI writing provider failed:', {
        resourceType,
        resourceId,
        mode: parsed.data.mode,
        error: error.cause instanceof Error ? error.cause.message : error.message,
      });
      return withSecurityHeaders(req, NextResponse.json({
        code: error.code,
        message: 'AI writing is temporarily unavailable. Please try again.',
      }, { status: 502 }));
    }

    console.error('AI writing assistant failed:', {
      resourceType,
      resourceId,
      mode: parsed.data.mode,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unable to generate writing' }, { status: 500 }));
  }
}
