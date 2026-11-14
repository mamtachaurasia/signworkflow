import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/utils/db';
import TemplateModel, { ITemplate } from '@/models/Template';
import { v4 as uuidv4 } from 'uuid';
import { buildTemplateListFilter } from '@/lib/template-access';
import { createDocumentFromTemplateRecord } from '@/lib/template-documents';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';
import { normalizeVariableKey } from '@/lib/template-content';
import { getTemplateLayoutState } from '@/lib/template-layout';
import { normalizeTemplateDefaultSigners } from '@/lib/template-signers';
import { getTemplatePdfArtifact } from '@/lib/template-artifacts';

export const POST = withTrialWriteAccessFromAuthContext(
    async function POST(req: NextRequest, _context, authContext) {
    await connectDB();

    try {
        const userId = authContext?.userId && !authContext.userId.startsWith('guest_') ? authContext.userId : null;
        const orgId = authContext?.orgId || null;

        let requestBody: Record<string, unknown>;
        try {
            const body = await req.json();
            if (!body || typeof body !== 'object' || Array.isArray(body)) {
                return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
            }
            requestBody = body as Record<string, unknown>;
        } catch {
            return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
        }

        const {
            templateId,
            documentName: rawDocumentName,
            guestId,
            variableValues: rawVariableValues,
            recipientAssignments: rawRecipientAssignments,
            deferPreparation,
        } = requestBody;
        const requestedDocName = typeof rawDocumentName === 'string'
            ? rawDocumentName.trim().slice(0, 200)
            : undefined;

        if (typeof templateId !== 'string' || !mongoose.Types.ObjectId.isValid(templateId)) {
            return NextResponse.json({ message: 'Template ID is required' }, { status: 400 });
        }

        const templateQuery = userId && orgId
            ? {
                _id: templateId,
                ...buildTemplateListFilter({ userId, orgId, orgRole: authContext?.orgRole }),
            }
            : {
                _id: templateId,
                isSystemTemplate: true,
            };

        const template: ITemplate | null = await TemplateModel.findOne(templateQuery).lean() as ITemplate | null;
        if (!template) {
            return NextResponse.json({ message: 'Template not found' }, { status: 404 });
        }

        if (!getTemplatePdfArtifact(template)) {
            return NextResponse.json({
                message: 'This template is being migrated to secure object storage. Please try again after migration completes.',
                code: 'TEMPLATE_ARTIFACT_UNAVAILABLE',
            }, { status: 409 });
        }

        if (getTemplateLayoutState(template).fieldLayoutStatus === 'needs_review') {
            return NextResponse.json({
                message: 'Review and save the template fields before creating an agreement.',
                code: 'TEMPLATE_FIELD_LAYOUT_NEEDS_REVIEW',
            }, { status: 409 });
        }

        const definitions = template.editableContent?.variables || [];
        const allowedVariables = new Map(definitions.map((variable) => [variable.key, variable]));
        const variableValues = Object.fromEntries(
            Object.entries(rawVariableValues && typeof rawVariableValues === 'object' ? rawVariableValues : {})
                .flatMap(([rawKey, rawValue]) => {
                    const key = normalizeVariableKey(rawKey);
                    if (!allowedVariables.has(key) || typeof rawValue !== 'string') return [];
                    return [[key, rawValue.trim().slice(0, 2000)]];
                })
        );
        const missingRequired = definitions.filter((variable) => variable.required && !(variableValues[variable.key] || variable.defaultValue));
        if (missingRequired.length > 0 && deferPreparation !== true) {
            return NextResponse.json({ message: `Complete required template details: ${missingRequired.map((variable) => variable.label).join(', ')}` }, { status: 400 });
        }
        // Use the same role-ID normalization as the Template Builder. Legacy
        // templates can have fields with recipient IDs while their reusable
        // roles have no explicit ID; generating `role_1` here would orphan the
        // copied fields in the agreement Builder.
        const roleDefinitions = normalizeTemplateDefaultSigners(
            template.defaultSigners || [],
            template.fields || [],
            String(template._id)
        );
        const assignmentsById = new Map((Array.isArray(rawRecipientAssignments) ? rawRecipientAssignments : []).map((assignment) => [String(assignment?.id || ''), assignment]));
        const recipientAssignments = roleDefinitions.map((role, index) => {
            const roleId = role.id;
            const assignment = assignmentsById.get(roleId);
            return {
                id: roleId,
                name: typeof assignment?.name === 'string' ? assignment.name.trim().slice(0, 200) : String(role.name || '').trim().slice(0, 200),
                email: typeof assignment?.email === 'string' ? assignment.email.trim().toLowerCase().slice(0, 320) : String(role.email || '').trim().toLowerCase().slice(0, 320),
                role: role.role,
                order: role.order || index + 1,
            };
        });
        // For guests, use the provided guestId (validated) so they can access their documents
        let ownerId: string;

        if (userId) {
            ownerId = userId;
        } else {
            const safeGuestId =
                typeof guestId === 'string' && guestId.startsWith('guest_')
                    ? guestId
                    : `guest_${uuidv4()}`;
            ownerId = safeGuestId;
        }

        const result = await createDocumentFromTemplateRecord({
            template,
            ownerId,
            orgId,
            documentName: requestedDocName,
            variableValues,
            recipientAssignments,
            deferPreparation: deferPreparation === true,
        });

        return NextResponse.json({
            message: 'Document created from template successfully',
            documentId: result.documentId,
            sessionId: result.sessionId,
            guestId: result.guestId,
            recipients: result.recipients,
            fields: result.fields,
        }, { status: 201 });

    } catch (error) {
        console.error('[USE TEMPLATE] An internal server error occurred:', error);
        return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
    }
},
    { authOptions: { allowGuest: true }, requireCsrf: true, useSecurityHeaders: true }
);
