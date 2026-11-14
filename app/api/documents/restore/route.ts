import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import DocumentModel from '@/models/Document';
import { buildWorkspaceOwnedFilter } from '@/lib/workspace-scope';

export async function POST(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    if (!context?.userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const userId = context.userId;
    const orgId = context.orgId;
    const { documentIds } = await req.json();

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json(
        { message: 'Document IDs are required' },
        { status: 400 }
      );
    }

    const restoredAt = new Date();
    // Restore any soft-deleted documents; prefer statusBeforeDelete if present
    const result = await DocumentModel.updateMany(
      buildWorkspaceOwnedFilter({
        userId,
        orgId,
        extra: {
          _id: { $in: documentIds },
          deletedAt: { $ne: null },
        },
      }),
      [
        {
          $set: {
            deletedAt: null,
            updatedAt: restoredAt,
            status: {
              $cond: [
                { $ne: [{ $ifNull: ['$statusBeforeDelete', null] }, null] },
                '$statusBeforeDelete',
                {
                  $cond: [
                    { $and: [{ $eq: ['$status', 'trashed'] }, { $ne: ['$completedAt', null] }] },
                    'completed',
                    '$status',
                  ],
                },
              ],
            },
          },
        },
        {
          $unset: ['statusBeforeDelete'],
        },
      ]
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { message: 'No matching documents found to restore' },
        { status: 200 }
      );
    }

    return NextResponse.json({
      message: `Successfully restored ${result.modifiedCount} document(s)`,
    });
  } catch (error) {
    console.error('Error bulk restoring documents:', error);
    return NextResponse.json(
      { message: 'Error bulk restoring documents' },
      { status: 500 }
    );
  }
}
