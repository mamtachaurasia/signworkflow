import crypto from 'crypto';

import bcrypt from 'bcryptjs';

import { normalizeShareEmail, type DocumentShareAccess } from '@/lib/document-sharing';
import User from '@/models/Users';

export type DocumentShareAccountStatus = 'registered' | 'pending' | 'guest';

export type DocumentShareAccountInviteResult = {
  status: DocumentShareAccountStatus;
  userId?: string;
  createdUser?: boolean;
};

function splitDisplayName(name?: string | null): { firstName: string; lastName: string; fullName: string } {
  const fullName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  const parts = fullName.split(' ').filter(Boolean);

  return {
    firstName: parts[0] || '',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
    fullName,
  };
}

export function documentShareAccessRequiresAccount(access: DocumentShareAccess): boolean {
  return access === 'can_send' || access === 'can_edit';
}

export async function ensureDocumentShareAccountInvite(params: {
  email: string;
  name?: string | null;
  access: DocumentShareAccess;
  invitedBy: string;
  documentId: string;
  now?: Date;
}): Promise<DocumentShareAccountInviteResult> {
  const normalizedEmail = normalizeShareEmail(params.email);
  if (!normalizedEmail) {
    throw new Error('A valid email is required to create a share invite.');
  }

  const existingUser = await User.findOne({ email: normalizedEmail })
    .select('_id email isDeleted pendingAccount')
    .exec();

  if (existingUser && existingUser.isDeleted) {
    return { status: 'registered', userId: String(existingUser._id) };
  }

  const requiresAccount = documentShareAccessRequiresAccount(params.access);

  if (existingUser && existingUser.pendingAccount === true) {
    if (!requiresAccount) {
      return {
        status: 'guest',
        userId: String(existingUser._id),
        createdUser: false,
      };
    }

    await User.updateOne(
      { _id: existingUser._id },
      {
        $set: {
          pendingAccount: true,
          pendingInvite: {
            source: 'document_share',
            invitedBy: params.invitedBy,
            documentId: params.documentId,
            access: params.access,
            invitedAt: params.now || new Date(),
          },
        },
      }
    ).exec();

    return {
      status: 'pending',
      userId: String(existingUser._id),
      createdUser: false,
    };
  }

  if (existingUser) {
    return { status: 'registered', userId: String(existingUser._id) };
  }

  if (!requiresAccount) {
    return { status: 'guest' };
  }

  const { firstName, lastName, fullName } = splitDisplayName(params.name);
  const internalPassword = crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(internalPassword, 12);
  const now = params.now || new Date();

  const newUser = await User.create({
    email: normalizedEmail,
    passwordHash,
    password: passwordHash,
    firstName,
    lastName,
    name: fullName,
    picture: '',
    isActive: true,
    isDeleted: false,
    role: 'user',
    tokenVersion: 0,
    failedLoginAttempts: 0,
    lockUntil: null,
    mfaEnabled: false,
    mfaSecret: null,
    pendingAccount: true,
    pendingInvite: {
      source: 'document_share',
      invitedBy: params.invitedBy,
      documentId: params.documentId,
      access: params.access,
      invitedAt: now,
    },
  });

  return {
    status: 'pending',
    userId: String(newUser._id),
    createdUser: true,
  };
}
