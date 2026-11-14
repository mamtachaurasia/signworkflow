import { NextRequest, NextResponse } from 'next/server';
import {
  buildCaseInsensitiveEmailFilter,
  dedupeContactsByEmail,
  MAX_CONTACT_IMPORT_FILE_SIZE_BYTES,
  normalizeImportedContacts,
} from '@/lib/contact-schemas';
import Contact from '@/models/Contact';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';
import { parseCSVToContacts } from '@/utils/csvParser';

export const POST = withTrialWriteAccessFromAuthContext(async function POST(req: NextRequest, _context, authContext) {
  try {
    if (!authContext?.userId || !authContext.orgId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ message: 'No file uploaded' }, { status: 400 });
    }

    const hasCsvMimeType = file.type === 'text/csv' || file.type === 'application/vnd.ms-excel';
    if (!file.name.toLowerCase().endsWith('.csv') && !hasCsvMimeType) {
      return NextResponse.json({ message: 'Please upload a CSV file' }, { status: 400 });
    }

    if (file.size > MAX_CONTACT_IMPORT_FILE_SIZE_BYTES) {
      return NextResponse.json({ message: 'CSV file exceeds 10MB limit' }, { status: 400 });
    }

    const csvText = await file.text();
    const parsedContacts = parseCSVToContacts(csvText);
    const { contacts: normalizedContacts, invalidCount } = normalizeImportedContacts(parsedContacts);

    if (normalizedContacts.length === 0) {
      return NextResponse.json({ message: 'No valid contacts found in CSV' }, { status: 400 });
    }

    const { contacts: dedupedContacts, duplicateCount } = dedupeContactsByEmail(normalizedContacts);
    const emailFilters = dedupedContacts.map((contact) => buildCaseInsensitiveEmailFilter(contact.email));

    const existingContacts = emailFilters.length
      ? await Contact.find({
          userId: authContext.userId,
          orgId: authContext.orgId,
          email: { $in: emailFilters },
        })
          .select('email')
          .lean<Array<{ email: string }>>()
      : [];

    const existingEmails = new Set(existingContacts.map((contact) => contact.email.toLowerCase()));
    const contactsToInsert = dedupedContacts
      .filter((contact) => !existingEmails.has(contact.email))
      .map((contact) => ({ ...contact, userId: authContext.userId, orgId: authContext.orgId }));

    if (contactsToInsert.length > 0) {
      await Contact.insertMany(contactsToInsert, { ordered: false });
    }

    const skippedCount =
      invalidCount + duplicateCount + (dedupedContacts.length - contactsToInsert.length);

    return NextResponse.json({
      message:
        contactsToInsert.length > 0
          ? `Imported ${contactsToInsert.length} contact(s); skipped ${skippedCount} duplicate or invalid row(s).`
          : `No new contacts to import; skipped ${skippedCount} duplicate or invalid row(s).`,
      importedCount: contactsToInsert.length,
      skippedCount,
    });
  } catch (error) {
    console.error('API Error in POST /api/contacts/bulk-import', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
});
