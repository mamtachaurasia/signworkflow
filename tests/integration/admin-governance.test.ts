import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateKeyPairSync } from 'node:crypto';

import Users from '@/models/Users';
import DocumentModel from '@/models/Document';
import MembershipModel from '@/models/Membership';
import OrganizationModel from '@/models/Organization';
import SessionModel from '@/models/Session';
import { signAccessToken } from '@/lib/jwt';
import { connectTestDb, disconnectTestDb, resetTestDb } from '../helpers/db';
import { POST as promoteUser } from '@/app/api/admin/users/promote/route';
import { GET as getPolicies, POST as createPolicy } from '@/app/api/retention/policies/route';
import { POST as createHold } from '@/app/api/retention/holds/route';
import { POST as releaseHold } from '@/app/api/retention/holds/[holdId]/release/route';

async function createAuthenticatedOwner() {
  const user = await Users.create({
    email: 'workspace.owner@example.com',
    role: 'owner',
    firstName: 'Workspace',
    lastName: 'Owner',
  });
  const organization = await OrganizationModel.create({
    name: 'Governance Workspace',
    slug: `governance-${String(user._id)}`,
    ownerUserId: user._id,
    plan: 'enterprise',
    status: 'active',
    seatLimit: 25,
  });
  await MembershipModel.create({
    orgId: organization._id,
    userId: user._id,
    role: 'owner',
    status: 'active',
  });
  await Users.updateOne(
    { _id: user._id },
    { $set: { primaryOrgId: organization._id, role: 'owner' } },
  );

  const sessionId = `governance-${String(user._id)}`;
  await SessionModel.create({
    _id: sessionId,
    userId: user._id,
    refreshTokenHash: 'not-used-by-access-token-tests',
    expiresAt: new Date(Date.now() + 60_000),
    revoked: false,
  });
  const accessToken = signAccessToken({
    userId: String(user._id),
    role: 'owner',
    tokenVersion: user.tokenVersion ?? 0,
    sessionId,
    authTime: Math.floor(Date.now() / 1000),
  });

  return {
    userId: String(user._id),
    orgId: String(organization._id),
    headers: {
      authorization: `Bearer ${accessToken}`,
      'x-org-id': String(organization._id),
    },
  };
}

describe('admin governance routes (integration)', () => {
  beforeAll(async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.JWT_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    process.env.JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.ADMIN_BOOTSTRAP_TOKEN = 'test-bootstrap-token';
    process.env.RETENTION_ADMIN_TOKEN = 'test-retention-token';
    await connectTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('creates the first workspace owner with the bootstrap token', async () => {
    const email = 'admin.one@example.com';
    await Users.create({
      email,
      role: 'user',
      firstName: 'Admin',
      lastName: 'User',
    });

    const req = new NextRequest('http://localhost/api/admin/users/promote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-bootstrap-token': 'test-bootstrap-token',
      },
      body: JSON.stringify({ email, role: 'owner' }),
    });

    const res = await promoteUser(req);
    expect(res.status).toBe(200);

    const updated = await Users.findOne({ email }).lean();
    expect(updated?.role).toBe('owner');
    const membership = await MembershipModel.findOne({ userId: updated?._id }).lean();
    expect(membership?.role).toBe('owner');
  });

  it('creates and lists retention policies for an authenticated workspace owner', async () => {
    const actor = await createAuthenticatedOwner();
    const createReq = new NextRequest('http://localhost/api/retention/policies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...actor.headers,
      },
      body: JSON.stringify({
        name: 'Default 7 Year',
        durationYears: 7,
        triggerEvent: 'completedAt',
      }),
    });

    const createRes = await createPolicy(createReq);
    expect(createRes.status).toBe(201);

    const listReq = new NextRequest('http://localhost/api/retention/policies', {
      headers: actor.headers,
    });
    const listRes = await getPolicies(listReq);
    const payload = await listRes.json();
    expect(Array.isArray(payload.policies)).toBe(true);
    expect(payload.policies.length).toBe(1);
  });

  it('applies and releases legal holds', async () => {
    const actor = await createAuthenticatedOwner();
    const doc = await DocumentModel.create({
      userId: actor.userId,
      orgId: actor.orgId,
      documentName: 'Policy Doc',
      originalFileName: 'policy.pdf',
      currentVersion: 0,
      versions: [],
      recipients: [],
      signingEvents: [],
      status: 'draft',
    });

    const holdReq = new NextRequest('http://localhost/api/retention/holds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...actor.headers,
      },
      body: JSON.stringify({
        name: 'Test Hold',
        documentIds: [String(doc._id)],
      }),
    });

    const holdRes = await createHold(holdReq);
    expect(holdRes.status).toBe(201);
    const holdPayload = await holdRes.json();
    const holdId = String(holdPayload.holdId);

    const updatedAfterHold = await DocumentModel.findById(doc._id).lean();
    expect(updatedAfterHold?.legalHold?.status).toBe('active');

    const releaseReq = new NextRequest(
      `http://localhost/api/retention/holds/${holdId}/release`,
      {
        method: 'POST',
        headers: {
          ...actor.headers,
        },
      }
    );

    const releaseRes = await releaseHold(releaseReq, { params: { holdId } });
    expect(releaseRes.status).toBe(200);

    const updatedAfterRelease = await DocumentModel.findById(doc._id).lean();
    expect(updatedAfterRelease?.legalHold?.status).toBe('none');
    expect(Array.isArray(updatedAfterRelease?.legalHold?.holdIds)).toBe(true);
    expect(updatedAfterRelease?.legalHold?.holdIds?.length || 0).toBe(0);
  });
});
