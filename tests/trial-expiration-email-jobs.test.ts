import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock('@/utils/db', () => ({ default: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendTrialExpirationEmail: mocks.sendEmail }));

import OrganizationModel from '@/models/Organization';
import Users from '@/models/Users';
import { processTrialExpirationEmailJobs } from '@/lib/trial-expiration-email-jobs';

let database: MongoMemoryServer;

describe('trial expiration email jobs', () => {
  beforeAll(async () => {
    database = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    await mongoose.connect(database.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await database?.stop();
  });

  beforeEach(async () => {
    mocks.sendEmail.mockReset().mockResolvedValue({ success: true });
    await OrganizationModel.deleteMany({});
    await Users.deleteMany({});
  });

  it('emails the active workspace owner once after trial expiration', async () => {
    const owner = await Users.create({
      email: 'owner@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    const organization = await OrganizationModel.create({
      name: 'Acme Workspace',
      ownerUserId: owner._id,
      plan: 'trial',
      trialEndsAt: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(await processTrialExpirationEmailJobs()).toMatchObject({
      processed: 1,
      sent: 1,
      failed: 0,
      skipped: 0,
    });
    expect(mocks.sendEmail).toHaveBeenCalledWith({
      email: 'owner@example.com',
      messageId: `<trial-expiration-${String(organization._id)}@signworkflow.com>`,
      recipientName: 'Ada Lovelace',
      workspaceName: 'Acme Workspace',
      trialEndsAt: new Date('2026-03-01T00:00:00.000Z'),
    });

    const savedOrganization = await OrganizationModel.findById(organization._id).lean();
    expect(savedOrganization?.trialExpirationEmailSentAt).toBeInstanceOf(Date);
    expect(savedOrganization?.trialExpirationEmailClaimId).toBeUndefined();
    expect(await processTrialExpirationEmailJobs()).toMatchObject({
      processed: 0,
      sent: 0,
    });
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
  });

  it('only processes expired trials', async () => {
    const owner = await Users.create({ email: 'owner@example.com' });
    await OrganizationModel.create([
      {
        name: 'Expired Trial',
        ownerUserId: owner._id,
        plan: 'trial',
        trialEndsAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        name: 'Active Trial',
        ownerUserId: owner._id,
        plan: 'trial',
        trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      {
        name: 'Paid Workspace',
        ownerUserId: owner._id,
        plan: 'business',
        trialEndsAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);

    const result = await processTrialExpirationEmailJobs();

    expect(result.sent).toBe(1);
    expect(result.processed).toBe(1);
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
  });

  it('releases failed sends so a later run can retry', async () => {
    const owner = await Users.create({ email: 'owner@example.com' });
    const organization = await OrganizationModel.create({
      name: 'Retry Workspace',
      ownerUserId: owner._id,
      plan: 'trial',
      trialEndsAt: new Date('2026-03-01T00:00:00.000Z'),
    });
    mocks.sendEmail
      .mockResolvedValueOnce({ success: false, error: 'SMTP unavailable' })
      .mockResolvedValueOnce({ success: true });

    expect(await processTrialExpirationEmailJobs()).toMatchObject({
      processed: 1,
      sent: 0,
      failed: 1,
      failures: [{ organizationId: String(organization._id), reason: 'email_delivery_failed' }],
    });
    const failedOrganization = await OrganizationModel.findById(organization._id).lean();
    expect(failedOrganization?.trialExpirationEmailSentAt).toBeNull();
    expect(failedOrganization?.trialExpirationEmailClaimId).toBeUndefined();

    expect(await processTrialExpirationEmailJobs()).toMatchObject({
      processed: 1,
      sent: 1,
      failed: 0,
    });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('does not send duplicate emails when workers overlap', async () => {
    const owner = await Users.create({ email: 'owner@example.com' });
    await OrganizationModel.create({
      name: 'Concurrent Workspace',
      ownerUserId: owner._id,
      plan: 'trial',
      trialEndsAt: new Date('2026-03-01T00:00:00.000Z'),
    });

    await Promise.all([processTrialExpirationEmailJobs(), processTrialExpirationEmailJobs()]);

    expect(mocks.sendEmail).toHaveBeenCalledOnce();
  });
});
