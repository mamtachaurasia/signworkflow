import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import {
  buildCaseInsensitiveEmailFilter,
  ContactBodySchema,
  zodIssuesToMessages,
} from '@/lib/contact-schemas';
import Contact from '@/models/Contact';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';

// GET - Fetch all contacts
export async function GET(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    if (!context?.userId || !context.orgId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const contacts = await Contact.find({ userId: context.userId, orgId: context.orgId })
      .sort({ firstName: 1, lastName: 1, email: 1 })
      .lean();

    return NextResponse.json({ contacts });
  } catch (error) {
    console.error('API Error in GET /api/contacts', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}

// POST - Create a new contact
export const POST = withTrialWriteAccessFromAuthContext(async function POST(req: NextRequest, _context, authContext) {
  try {
    if (!authContext?.userId || !authContext.orgId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
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

    const newContact = await Contact.create({
      userId: authContext.userId,
      orgId: authContext.orgId,
      ...parsed.data,
    });

    return NextResponse.json({ contact: newContact }, { status: 201 });
  } catch (error) {
    console.error('API Error in POST /api/contacts', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
});
