export const CLOUD_PROVIDER_IDS = ['google_drive', 'dropbox'] as const;

export type CloudProviderId = (typeof CLOUD_PROVIDER_IDS)[number];

export function isCloudProviderId(value: string): value is CloudProviderId {
  return (CLOUD_PROVIDER_IDS as readonly string[]).includes(value);
}

export type CloudConnectionMetadata = Record<string, string>;

export type CloudConnectionSummary = {
  provider: CloudProviderId;
  label: string;
  configured: boolean;
  missingConfig: string[];
  connected: boolean;
  accountEmail: string | null;
  accountName: string | null;
  lastExportedAt: string | null;
};

export type WorkspaceCloudConnectionSummary = CloudConnectionSummary & {
  connectedBy?: string | null;
};

export type CloudConnectStartResult = {
  authorizationUrl: string;
};

export type CloudAuthorizedAccount = {
  providerAccountId: string;
  email: string | null;
  displayName: string | null;
  refreshToken: string;
  scopes: string[];
  metadata?: CloudConnectionMetadata;
};

export type CloudUploadInput = {
  refreshToken: string;
  scopes?: string[];
  metadata: CloudConnectionMetadata;
  fileName: string;
  contentType: string;
  fileBuffer: Buffer;
  workspaceName: string | null;
  destinationFolder?: string | null;
  idempotencyKey?: string | null;
};

export type CloudUploadResult = {
  providerFileId: string;
  providerFileName: string;
  providerUrl: string | null;
  metadataPatch?: CloudConnectionMetadata;
};
