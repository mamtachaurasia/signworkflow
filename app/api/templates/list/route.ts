import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import TemplateModel, { ITemplate } from '@/models/Template';
import { FilterQuery } from 'mongoose';
import connectDB from '@/utils/db';
import { buildTemplateListFilter } from '@/lib/template-access';
import { isTemplateJurisdiction } from '@/config/template-jurisdictions';
import { getTemplateLayoutState } from '@/lib/template-layout';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
    try {
        await connectDB();
        const context = await getAuthContext(req);
        const userId = context?.userId || null;
        const orgId = context?.orgId || null;

        const { searchParams } = new URL(req.url);
        const category = searchParams.get('category');
        const isSystem = searchParams.get('isSystem') === 'true';
        const search = searchParams.get('search');
        const jurisdiction = searchParams.get('jurisdiction');
        const isActive = searchParams.get('isActive');
        const returnCount = searchParams.get('returnCount') === 'true'; // New parameter

        const limit = searchParams.get('limit');

        /**  
         * The correct type for a Mongoose find() query  
         */
        const query: FilterQuery<ITemplate> = {};
        if (isActive === 'false') {
            query.isActive = false;
        } else if (isActive === 'true') { // Corrected typo
            query.isActive = true;
        }

        if (isSystem || !userId || !orgId) {
            query.isSystemTemplate = true;
        } else {
            Object.assign(query, buildTemplateListFilter({ userId, orgId }));
        }

        if (category) {
            query.category = category;
        }
        if (jurisdiction && !isTemplateJurisdiction(jurisdiction)) {
            return NextResponse.json({ message: 'Invalid template jurisdiction' }, { status: 400 });
        }
        if (jurisdiction) {
            query.jurisdiction = jurisdiction;
        }

        if (search) {
            query.$text = { $search: search };
        }

        let totalCount = 0;
        if (returnCount) {
            totalCount = await TemplateModel.countDocuments(query);
        }

        let templatesQuery = TemplateModel.find(query)
            .sort({ createdAt: -1 })
            .select(
                '_id name description category jurisdiction isSystemTemplate templateFileUrl thumbnailUrl pageCount tags createdAt updatedAt duplicateCount isActive deletedAt sharingScope userId orgId editableContent.version editableContent.variables fields defaultSigners fieldLayoutStatus layoutRevision fieldLayoutRevision'
            );
        
        if (limit) {
            const parsedLimit = parseInt(limit, 10);
            if (!isNaN(parsedLimit) && parsedLimit > 0) {
                templatesQuery = templatesQuery.limit(parsedLimit);
            }
        }

        const templates = await templatesQuery;
        const responseTemplates = templates.map((template) => ({
            ...(typeof template.toObject === 'function' ? template.toObject() : template),
            ...getTemplateLayoutState(template),
        }));

        return NextResponse.json({ success: true, templates: responseTemplates, ...(returnCount && { totalCount }) }); // Include totalCount conditionally
    } catch (error) {
        console.error('Error fetching templates:', error);
        return NextResponse.json({ message: 'Failed to fetch templates' }, { status: 500 });
    }
}
