import { randomUUID } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import {
  clearAuthTokenCookie,
  clearCsrfCookie,
  clearRefreshTokenCookie,
  hashRefreshToken,
  issueCsrfToken,
  setCsrfCookie,
  setRefreshTokenCookie,
} from '@/lib/auth';
import {
  getAccessTokenTtl,
  getRefreshTokenExpiryDate,
  signAccessToken,
  signRefreshToken,
} from '@/lib/jwt';
import { ensureUserOrg, getActiveOrgContextForUser } from '@/lib/orgs';
import MembershipModel, { type MembershipRole } from '@/models/Membership';
import SessionModel from '@/models/Session';
import UserModel from '@/models/Users';
import { computeDeletionSchedule } from '@/lib/user-deletion';

export interface SafeAuthUser {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  name: string;
  picture: string;
}

type OrgAwareUser = {
  _id: unknown;
  primaryOrgId?: unknown | null;
};

type ResolvedAuthOrgState = {
  orgContext: Awaited<ReturnType<typeof getActiveOrgContextForUser>>;
  effectiveRole: MembershipRole;
};

interface UserShape {
  _id: unknown;
  email: string;
  role: string;
  tokenVersion: number;
  firstName?: string;
  lastName?: string;
  picture?: string;
}

interface IssueSessionInput {
  user: UserShape;
  deviceInfo?: string;
  ipAddress: string;
  userAgent: string;
  authTimeSeconds?: number;
}

export function toSafeAuthUser(user: {
  _id: unknown;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
}): SafeAuthUser {
  return {
    id: String(user._id),
    email: user.email,
    role: user.role,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    picture: user.picture || '',
  };
}

export async function resolveAuthOrgState(
  user: OrgAwareUser,
  options: { bootstrapIfMissing?: boolean } = {}
): Promise<ResolvedAuthOrgState> {
  const userId = String(user._id);
  const shouldBootstrap = options.bootstrapIfMissing === true;
  const orgContext = shouldBootstrap
    ? await ensureUserOrg(userId)
    : await getActiveOrgContextForUser(userId);

  return {
    orgContext,
    effectiveRole: orgContext?.role ?? 'user',
  };
}

export function toClientAuthUser(
  safeUser: SafeAuthUser,
  authOrgState: ResolvedAuthOrgState
): SafeAuthUser & { orgId: string | null; orgRole: MembershipRole | null } {
  return {
    ...safeUser,
    role: authOrgState.effectiveRole,
    orgId: authOrgState.orgContext ? String(authOrgState.orgContext.orgId) : null,
    orgRole: authOrgState.orgContext?.role ?? null,
  };
}

export function clearAllAuthCookies(response: NextResponse, req?: NextRequest): void {
  clearAuthTokenCookie(response, req);
  clearRefreshTokenCookie(response, req);
  clearCsrfCookie(response, req);
}

export function applyAuthSessionCookies(
  response: NextResponse,
  refreshToken: string,
  refreshExpiresAt: Date,
  req?: NextRequest
): void {
  clearAuthTokenCookie(response, req);
  setRefreshTokenCookie(response, refreshToken, refreshExpiresAt, req);
  setCsrfCookie(response, issueCsrfToken(), req);
}

export async function issueSessionForUser(input: IssueSessionInput): Promise<{
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  accessTokenTtl: string;
  safeUser: SafeAuthUser;
}> {
  const nowSeconds = input.authTimeSeconds ?? Math.floor(Date.now() / 1000);
  const sessionId = randomUUID();

  const accessToken = signAccessToken({
    userId: String(input.user._id),
    role: input.user.role,
    tokenVersion: input.user.tokenVersion,
    sessionId,
    authTime: nowSeconds,
  });

  const refreshToken = signRefreshToken({
    userId: String(input.user._id),
    tokenVersion: input.user.tokenVersion,
    sessionId,
    authTime: nowSeconds,
  });

  const refreshExpiresAt = getRefreshTokenExpiryDate();

  await SessionModel.create({
    _id: sessionId,
    userId: input.user._id,
    refreshTokenHash: hashRefreshToken(refreshToken),
    deviceInfo: input.deviceInfo || '',
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    expiresAt: refreshExpiresAt,
    revoked: false,
  });

  return {
    sessionId,
    accessToken,
    refreshToken,
    refreshExpiresAt,
    accessTokenTtl: getAccessTokenTtl(),
    safeUser: toSafeAuthUser(input.user),
  };
}

export async function revokeSessionById(sessionId: string): Promise<void> {
  await SessionModel.updateOne({ _id: sessionId }, { $set: { revoked: true } }).exec();
}

export async function revokeAllUserSessionsAndBumpTokenVersion(userId: string): Promise<void> {
  await SessionModel.updateMany({ userId }, { $set: { revoked: true } }).exec();
  await UserModel.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } }).exec();
}

export async function softDeleteUserAndRevokeSessions(userId: string): Promise<void> {
  const schedule = computeDeletionSchedule();
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        isDeleted: true,
        isActive: false,
        deletedAt: schedule.deletedAt,
        deletionScheduledAt: schedule.deletionScheduledAt,
        failedLoginAttempts: 0,
        lockUntil: null,
      },
      $inc: {
        tokenVersion: 1,
      },
    }
  ).exec();

  await SessionModel.updateMany({ userId }, { $set: { revoked: true } }).exec();

  await MembershipModel.updateMany(
    { userId, status: 'active' },
    { $set: { status: 'disabled', disabledReason: 'user_deleted' } }
  ).exec();
}
