import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import connectDB from '@/utils/db';
import Document from '@/models/Document';

export async function GET(req: NextRequest) {
    await connectDB();

    try {
        const context = await getAuthContext(req);
        if (!context?.userId || !context.orgId) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        // This legacy endpoint is retained for compatibility with older
        // clients. Do not return raw document records: document versions carry
        // internal object-store references and other server-only metadata.
        const templates = await Document.find({
            userId: context.userId,
            orgId: context.orgId,
            isTemplate: true,
        })
            .select('_id documentName originalFileName status currentVersion isTemplate createdAt updatedAt')
            .lean();

        return NextResponse.json(templates, { status: 200 });

    } catch (error) {
        console.error('Error fetching templates:', error);
        return NextResponse.json({
            message: 'An internal server error occurred',
        }, { status: 500 });
    }
}
