import { decryptCloudSecret, encryptCloudSecret } from '@/lib/cloud/crypto';
import { getCloudProviderLabel } from '@/lib/cloud/common';
import { getCloudProviderConfigStatus, uploadPdfToCloudProvider } from '@/lib/cloud/providers';
import type { CloudAuthorizedAccount, CloudConnectionSummary, CloudProviderId, WorkspaceCloudConnectionSummary } from '@/lib/cloud/types';
import CloudConnectionModel, { type ICloudConnection } from '@/models/CloudConnection';
import CloudExportRuleModel from '@/models/CloudExportRule';
import WorkspaceCloudArchiveRuleModel from '@/models/WorkspaceCloudArchiveRule';
import WorkspaceCloudConnectionModel, { type IWorkspaceCloudConnection } from '@/models/WorkspaceCloudConnection';

type CloudConnectionRecord = {
  _id: unknown;
  userId: unknown;
  provider: CloudProviderId;
  providerAccountId: string;
  providerEmail?: string | null;
  displayName?: string | null;
  refreshTokenEncrypted?: string;
  scopes?: string[];
  metadata?: unknown;
  lastExportedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type CloudConnectionWithSecret = Omit<CloudConnectionRecord, 'refreshTokenEncrypted' | 'metadata'> & {
  refreshToken: string;
  metadata: Record<string, string>;
};

type WorkspaceCloudConnectionRecord = Omit<CloudConnectionRecord, 'userId'> & {
  orgId: unknown;
  connectedBy: unknown;
};

export type WorkspaceCloudConnectionWithSecret = Omit<WorkspaceCloudConnectionRecord, 'refreshTokenEncrypted' | 'metadata'> & {
  refreshToken: string;
  metadata: Record<string, string>;
};

function normalizeConnectionMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, current]) => {
    if (typeof current === 'string' && current.trim()) {
      acc[key] = current;
    }
    return acc;
  }, {});
}

export async function listCloudConnectionsForUser(userId: string): Promise<CloudConnectionSummary[]> {
  const connections = await CloudConnectionModel.find({ userId })
    .select('provider providerEmail displayName lastExportedAt')
    .lean<Array<Pick<ICloudConnection, 'provider' | 'providerEmail' | 'displayName' | 'lastExportedAt'>>>();

  const connectionByProvider = new Map(connections.map((connection) => [connection.provider, connection]));

  return (['google_drive', 'dropbox'] as const).map((provider) => {
    const config = getCloudProviderConfigStatus(provider);
    const connection = connectionByProvider.get(provider);

    return {
      provider,
      label: getCloudProviderLabel(provider),
      configured: config.configured,
      missingConfig: config.missingConfig,
      connected: Boolean(connection),
      accountEmail: connection?.providerEmail || null,
      accountName: connection?.displayName || null,
      lastExportedAt: connection?.lastExportedAt ? new Date(connection.lastExportedAt).toISOString() : null,
    } satisfies CloudConnectionSummary;
  });
}

export async function listWorkspaceCloudConnections(orgId: string): Promise<WorkspaceCloudConnectionSummary[]> {
  const connections = await WorkspaceCloudConnectionModel.find({ orgId })
    .select('provider providerEmail displayName lastExportedAt connectedBy')
    .lean<Array<Pick<IWorkspaceCloudConnection, 'provider' | 'providerEmail' | 'displayName' | 'lastExportedAt' | 'connectedBy'>>>();
  const connectionByProvider = new Map(connections.map((connection) => [connection.provider, connection]));

  return (['google_drive', 'dropbox'] as const).map((provider) => {
    const config = getCloudProviderConfigStatus(provider);
    const connection = connectionByProvider.get(provider);
    return {
      provider,
      label: getCloudProviderLabel(provider),
      configured: config.configured,
      missingConfig: config.missingConfig,
      connected: Boolean(connection),
      accountEmail: connection?.providerEmail || null,
      accountName: connection?.displayName || null,
      lastExportedAt: connection?.lastExportedAt ? new Date(connection.lastExportedAt).toISOString() : null,
      connectedBy: connection?.connectedBy ? String(connection.connectedBy) : null,
    } satisfies WorkspaceCloudConnectionSummary;
  });
}

export async function upsertCloudConnectionForUser(args: {
  userId: string;
  provider: CloudProviderId;
  account: CloudAuthorizedAccount;
}): Promise<void> {
  await CloudConnectionModel.updateOne(
    { userId: args.userId, provider: args.provider },
    {
      $set: {
        providerAccountId: args.account.providerAccountId,
        providerEmail: args.account.email || null,
        displayName: args.account.displayName || null,
        refreshTokenEncrypted: encryptCloudSecret(args.account.refreshToken),
        scopes: args.account.scopes,
        metadata: normalizeConnectionMetadata(args.account.metadata),
      },
    },
    { upsert: true }
  ).exec();
}

export async function upsertWorkspaceCloudConnection(args: {
  orgId: string;
  connectedBy: string;
  provider: CloudProviderId;
  account: CloudAuthorizedAccount;
}): Promise<void> {
  await WorkspaceCloudConnectionModel.updateOne(
    { orgId: args.orgId, provider: args.provider },
    {
      $set: {
        connectedBy: args.connectedBy,
        providerAccountId: args.account.providerAccountId,
        providerEmail: args.account.email || null,
        displayName: args.account.displayName || null,
        refreshTokenEncrypted: encryptCloudSecret(args.account.refreshToken),
        scopes: args.account.scopes,
        metadata: normalizeConnectionMetadata(args.account.metadata),
      },
    },
    { upsert: true }
  ).exec();
}

export async function deleteCloudConnectionForUser(args: {
  userId: string;
  provider: CloudProviderId;
}): Promise<boolean> {
  const result = await CloudConnectionModel.deleteOne({ userId: args.userId, provider: args.provider }).exec();
  if (result.deletedCount === 1) {
    await CloudExportRuleModel.updateMany(
      { userId: args.userId, provider: args.provider, enabled: true },
      { $set: { enabled: false } }
    ).exec();
  }
  return result.deletedCount === 1;
}

export async function deleteWorkspaceCloudConnection(args: {
  orgId: string;
  provider: CloudProviderId;
}): Promise<boolean> {
  const result = await WorkspaceCloudConnectionModel.deleteOne({ orgId: args.orgId, provider: args.provider }).exec();
  if (result.deletedCount === 1) {
    await WorkspaceCloudArchiveRuleModel.updateMany(
      { orgId: args.orgId, provider: args.provider, enabled: true },
      { $set: { enabled: false } }
    ).exec();
  }
  return result.deletedCount === 1;
}

export async function getCloudConnectionForUserWithSecret(args: {
  userId: string;
  provider: CloudProviderId;
}): Promise<CloudConnectionWithSecret | null> {
  const connection = await CloudConnectionModel.findOne({ userId: args.userId, provider: args.provider })
    .select('+refreshTokenEncrypted provider providerAccountId providerEmail displayName scopes metadata lastExportedAt userId createdAt updatedAt')
    .lean<CloudConnectionRecord | null>();

  if (!connection?.refreshTokenEncrypted) {
    return null;
  }

  return {
    ...connection,
    metadata: normalizeConnectionMetadata(connection.metadata),
    refreshToken: decryptCloudSecret(connection.refreshTokenEncrypted),
  };
}

export async function getWorkspaceCloudConnectionWithSecret(args: {
  orgId: string;
  provider: CloudProviderId;
}): Promise<WorkspaceCloudConnectionWithSecret | null> {
  const connection = await WorkspaceCloudConnectionModel.findOne({ orgId: args.orgId, provider: args.provider })
    .select('+refreshTokenEncrypted provider providerAccountId providerEmail displayName scopes metadata lastExportedAt orgId connectedBy createdAt updatedAt')
    .lean<WorkspaceCloudConnectionRecord | null>();
  if (!connection?.refreshTokenEncrypted) return null;
  return {
    ...connection,
    metadata: normalizeConnectionMetadata(connection.metadata),
    refreshToken: decryptCloudSecret(connection.refreshTokenEncrypted),
  };
}

export async function exportPdfToConnectedProvider(args: {
  userId: string;
  provider: CloudProviderId;
  fileName: string;
  contentType: string;
  fileBuffer: Buffer;
  workspaceName: string | null;
  destinationFolder?: string | null;
  idempotencyKey?: string | null;
}) {
  const connection = await getCloudConnectionForUserWithSecret({
    userId: args.userId,
    provider: args.provider,
  });

  if (!connection) {
    throw new Error(`Connect ${getCloudProviderLabel(args.provider)} before exporting signed documents.`);
  }

  const upload = await uploadPdfToCloudProvider(args.provider, {
    refreshToken: connection.refreshToken,
    scopes: connection.scopes,
    metadata: connection.metadata,
    fileName: args.fileName,
    contentType: args.contentType,
    fileBuffer: args.fileBuffer,
    workspaceName: args.workspaceName,
    destinationFolder: args.destinationFolder,
    idempotencyKey: args.idempotencyKey,
  });

  const nextMetadata = upload.metadataPatch
    ? {
        ...connection.metadata,
        ...normalizeConnectionMetadata(upload.metadataPatch),
      }
    : connection.metadata;

  await CloudConnectionModel.updateOne(
    { _id: connection._id },
    {
      $set: {
        metadata: nextMetadata,
        lastExportedAt: new Date(),
      },
    }
  ).exec();

  return upload;
}

export async function exportPdfToWorkspaceProvider(args: {
  orgId: string;
  provider: CloudProviderId;
  fileName: string;
  contentType: string;
  fileBuffer: Buffer;
  workspaceName: string | null;
  destinationFolder?: string | null;
  idempotencyKey?: string | null;
}) {
  const connection = await getWorkspaceCloudConnectionWithSecret({ orgId: args.orgId, provider: args.provider });
  if (!connection) {
    throw new Error(`Connect ${getCloudProviderLabel(args.provider)} as a workspace archive destination before enabling exports.`);
  }
  const upload = await uploadPdfToCloudProvider(args.provider, {
    refreshToken: connection.refreshToken,
    scopes: connection.scopes,
    metadata: connection.metadata,
    fileName: args.fileName,
    contentType: args.contentType,
    fileBuffer: args.fileBuffer,
    workspaceName: args.workspaceName,
    destinationFolder: args.destinationFolder,
    idempotencyKey: args.idempotencyKey,
  });
  const nextMetadata = upload.metadataPatch
    ? { ...connection.metadata, ...normalizeConnectionMetadata(upload.metadataPatch) }
    : connection.metadata;
  await WorkspaceCloudConnectionModel.updateOne(
    { _id: connection._id },
    { $set: { metadata: nextMetadata, lastExportedAt: new Date() } }
  ).exec();
  return upload;
}
