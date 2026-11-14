import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import {
  buildCaseInsensitiveEmailFilter,
  ContactBodySchema,
  isValidContactId,
  zodIssuesToMessages,
} from '@/lib/contact-schemas';
import Contact from '@/models/Contact';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';

// GET - Fetch a specific contact
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const contextAuth = await getAuthContext(req);
    if (!contextAuth?.userId || !contextAuth.orgId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const contactId = (await context.params).id;

    if (!contactId) {
      return NextResponse.json({ message: 'Contact ID missing' }, { status: 400 });
    }

    if (!isValidContactId(contactId)) {
      return NextResponse.json({ message: 'Invalid contact ID' }, { status: 400 });
    }

    const contact = await Contact.findOne({
      _id: contactId,
      userId: contextAuth.userId,
      orgId: contextAuth.orgId,
    }).lean();

    if (!contact) {
      return NextResponse.json({ message: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('API Error in GET /api/contacts/[id]', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}

// PUT - Update a contact
export const PUT = withTrialWriteAccessFromAuthContext(async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext
) {
  try {
    if (!authContext?.userId || !authContext.orgId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const contactId = (await context.params).id;

    if (!contactId) {
      return NextResponse.json({ message: 'Contact ID missing' }, { status: 400 });
    }

    if (!isValidContactId(contactId)) {
      return NextResponse.json({ message: 'Invalid contact ID' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const parsed = ContactBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Validation failed', errors: zodIssuesToMessages(parsed.error.issues) },
        { status: 400 }
      );
    }

    const existingContact = await Contact.findOne({
      _id: { $ne: contactId },
      userId: authContext.userId,
      orgId: authContext.orgId,
      email: buildCaseInsensitiveEmailFilter(parsed.data.email),
    })
      .select('_id')
      .lean();
    if (existingContact) {
      return NextResponse.json(
        { message: 'Contact with this email already exists' },
        { status: 409 }
      );
    }

    const contact = await Contact.findOneAndUpdate(
      { _id: contactId, userId: authContext.userId, orgId: authContext.orgId },
      { $set: parsed.data },
      { new: true, runValidators: true }
    ).lean();

    if (!contact) {
      return NextResponse.json({ message: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('API Error in PUT /api/contacts/[id]', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
});

// DELETE - Delete a contact
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const contextAuth = await getAuthContext(req);
    if (!contextAuth?.userId || !contextAuth.orgId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const contactId = (await context.params).id;

    if (!contactId) {
      return NextResponse.json({ message: 'Contact ID missing' }, { status: 400 });
    }

    if (!isValidContactId(contactId)) {
      return NextResponse.json({ message: 'Invalid contact ID' }, { status: 400 });
    }

    const contact = await Contact.findOneAndDelete({
      _id: contactId,
      userId: contextAuth.userId,
      orgId: contextAuth.orgId,
    }).lean();

    if (!contact) {
      return NextResponse.json({ message: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('API Error in DELETE /api/contacts/[id]', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
