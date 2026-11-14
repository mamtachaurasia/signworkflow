import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { BulkDeleteContactsBodySchema, zodIssuesToMessages } from '@/lib/contact-schemas';
import Contact from '@/models/Contact';

export async function DELETE(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    if (!context?.userId || !context.orgId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = BulkDeleteContactsBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Validation failed', errors: zodIssuesToMessages(parsed.error.issues) },
        { status: 400 }
      );
    }

    await Contact.deleteMany({
      _id: { $in: parsed.data.contactIds },
      userId: context.userId,
      orgId: context.orgId,
    });

    return NextResponse.json({ message: 'Contacts deleted successfully' });
  } catch (error) {
    console.error('API Error in DELETE /api/contacts/bulk-delete', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
