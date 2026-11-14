import type { Recipient } from '@/types/types';

const RECIPIENT_COLORS = [
  '#3B82F6',
  '#F59E0B',
  '#10B981',
  '#EF4444',
  '#8B5CF6',
  '#F97316',
  '#06B6D4',
  '#84CC16',
];

type TeamMemberInput = {
  email: string;
  name: string;
};

export function generateRecipientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `recipient_${crypto.randomUUID()}`;
  }
  return `recipient_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function getNextRecipientColor(currentRecipients: Recipient[]) {
  const usedColors = currentRecipients.map((recipient) => recipient.color);
  return RECIPIENT_COLORS.find((color) => !usedColors.includes(color)) || RECIPIENT_COLORS[0];
}

export function generateUniqueRecipientName(baseName: string, existingNames: string[]) {
  let finalName = baseName.trim();
  if (existingNames.includes(finalName)) {
    let counter = 2;
    while (existingNames.includes(`${finalName} ${counter}`)) {
      counter += 1;
    }
    finalName = `${finalName} ${counter}`;
  }
  return finalName;
}

export function createDraftRecipient(
  currentRecipients: Recipient[],
  overrides: Partial<Recipient> = {}
): Recipient {
  const defaultName = `Recipient ${currentRecipients.length + 1}`;
  const name = generateUniqueRecipientName(defaultName, currentRecipients.map((recipient) => recipient.name));
  const isCC = overrides.isCC ?? false;

  return {
    id: generateRecipientId(),
    email: '',
    name,
    role: isCC ? 'viewer' : 'signer',
    color: getNextRecipientColor(currentRecipients),
    order: currentRecipients.length + 1,
    isCC,
    totalFields: 0,
    status: 'pending',
    ...overrides,
  };
}

export function addTeamMembersToRecipients(options: {
  recipients: Recipient[];
  members: TeamMemberInput[];
  role: Recipient['role'];
  asCc: boolean;
}) {
  const { recipients, members, role, asCc } = options;
  const existingEmails = new Set(recipients.map((recipient) => recipient.email.trim().toLowerCase()).filter(Boolean));
  const existingNames = recipients.map((recipient) => recipient.name);
  let nextRecipients = [...recipients];
  let order = recipients.length + 1;
  let added = 0;
  let skipped = 0;

  members.forEach((member) => {
    const email = member.email.trim().toLowerCase();
    if (!email || existingEmails.has(email)) {
      skipped += 1;
      return;
    }

    const displayName = generateUniqueRecipientName(member.name || member.email, existingNames);
    nextRecipients = [
      ...nextRecipients,
      {
        id: generateRecipientId(),
        email: member.email,
        name: displayName,
        role: asCc ? 'viewer' : role,
        color: getNextRecipientColor(nextRecipients),
        order,
        isCC: asCc,
        totalFields: 0,
        status: 'pending',
      },
    ];
    existingEmails.add(email);
    existingNames.push(displayName);
    order += 1;
    added += 1;
  });

  return { recipients: nextRecipients, added, skipped };
}
