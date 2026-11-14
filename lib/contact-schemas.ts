import mongoose from 'mongoose';
import { z } from 'zod';

import type { CSVContact } from '@/utils/csvParser';

export const MAX_CONTACT_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function preprocessOptionalString(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return value;
}

function optionalTrimmedString(maxLength: number) {
  return z.preprocess(
    preprocessOptionalString,
    z.union([z.string().max(maxLength), z.undefined()])
  );
}

const AddressInputSchema = z
  .object({
    country: optionalTrimmedString(100),
    streetAddress: optionalTrimmedString(200),
    apartment: optionalTrimmedString(200),
    city: optionalTrimmedString(100),
    state: optionalTrimmedString(100),
    zipCode: optionalTrimmedString(30),
  })
  .strict()
  .transform((address) => {
    const normalizedEntries = Object.entries(address).filter(([, value]) => value !== undefined);
    return normalizedEntries.length > 0
      ? (Object.fromEntries(normalizedEntries) as {
          country?: string;
          streetAddress?: string;
          apartment?: string;
          city?: string;
          state?: string;
          zipCode?: string;
        })
      : undefined;
  });

export const ContactBodySchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z
      .string()
      .trim()
      .max(320)
      .email()
      .transform((email) => email.toLowerCase()),
    phone: optionalTrimmedString(40),
    companyName: optionalTrimmedString(200),
    jobTitle: optionalTrimmedString(200),
    address: z.preprocess(
      (value) => (value === null ? undefined : value),
      AddressInputSchema.optional()
    ),
    description: optionalTrimmedString(2000),
  })
  .strict();

export const BulkDeleteContactsBodySchema = z
  .object({
    contactIds: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(500)
      .transform((contactIds) => [...new Set(contactIds)]),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const contactId of value.contactIds) {
      if (!mongoose.Types.ObjectId.isValid(contactId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid contact ID: ${contactId}`,
        });
      }
    }
  });

export type ContactInput = z.output<typeof ContactBodySchema>;

export function buildCaseInsensitiveEmailFilter(email: string): RegExp {
  const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedEmail}$`, 'i');
}

export function dedupeContactsByEmail(contacts: ContactInput[]) {
  const uniqueContacts: ContactInput[] = [];
  const seenEmails = new Set<string>();
  let duplicateCount = 0;

  for (const contact of contacts) {
    const normalizedEmail = contact.email.toLowerCase();
    if (seenEmails.has(normalizedEmail)) {
      duplicateCount += 1;
      continue;
    }

    seenEmails.add(normalizedEmail);
    uniqueContacts.push(contact);
  }

  return { contacts: uniqueContacts, duplicateCount };
}

export function isValidContactId(contactId: string): boolean {
  return mongoose.Types.ObjectId.isValid(contactId);
}

export function normalizeImportedContacts(csvContacts: CSVContact[]) {
  const contacts: ContactInput[] = [];
  let invalidCount = 0;

  for (const csvContact of csvContacts) {
    const parsed = ContactBodySchema.safeParse(csvContact);
    if (!parsed.success) {
      invalidCount += 1;
      continue;
    }

    contacts.push(parsed.data);
  }

  return { contacts, invalidCount };
}

export function zodIssuesToMessages(issues: Array<{ message: string }>): string[] {
  return issues.map((issue) => issue.message);
}
