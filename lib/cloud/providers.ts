import { NextRequest } from 'next/server';

import {
  buildDropboxAuthorizationUrl,
  completeDropboxAuthorization,
  getDropboxConfig,
  uploadPdfToDropbox,
} from '@/lib/cloud/dropbox';
import {
  buildGoogleDriveAuthorizationUrl,
  completeGoogleDriveAuthorization,
  getGoogleDriveConfig,
  uploadPdfToGoogleDrive,
} from '@/lib/cloud/google-drive';
import { getCloudProviderLabel } from '@/lib/cloud/common';
import type { CloudAuthorizedAccount, CloudProviderId, CloudUploadInput, CloudUploadResult } from '@/lib/cloud/types';

export function getCloudProviderConfigStatus(provider: CloudProviderId, req?: NextRequest) {
  switch (provider) {
    case 'google_drive': {
      const config = getGoogleDriveConfig(req);
      return {
        provider,
        label: getCloudProviderLabel(provider),
        configured: config.missingConfig.length === 0,
        missingConfig: config.missingConfig,
      };
    }
    case 'dropbox': {
      const config = getDropboxConfig(req);
      return {
        provider,
        label: getCloudProviderLabel(provider),
        configured: config.missingConfig.length === 0,
        missingConfig: config.missingConfig,
      };
    }
    default:
      return {
        provider,
        label: getCloudProviderLabel(provider),
        configured: false,
        missingConfig: [],
      };
  }
}

export function buildCloudProviderAuthorizationUrl(
  provider: CloudProviderId,
  req: NextRequest,
  state: string
): string {
  switch (provider) {
    case 'google_drive':
      return buildGoogleDriveAuthorizationUrl(req, state);
    case 'dropbox':
      return buildDropboxAuthorizationUrl(req, state);
    default:
      throw new Error('Unsupported cloud provider.');
  }
}

export async function completeCloudProviderAuthorization(
  provider: CloudProviderId,
  req: NextRequest,
  code: string
): Promise<CloudAuthorizedAccount> {
  switch (provider) {
    case 'google_drive':
      return completeGoogleDriveAuthorization(req, code);
    case 'dropbox':
      return completeDropboxAuthorization(req, code);
    default:
      throw new Error('Unsupported cloud provider.');
  }
}

export async function uploadPdfToCloudProvider(
  provider: CloudProviderId,
  input: CloudUploadInput
): Promise<CloudUploadResult> {
  switch (provider) {
    case 'google_drive':
      return uploadPdfToGoogleDrive(input);
    case 'dropbox':
      return uploadPdfToDropbox(input);
    default:
      throw new Error('Unsupported cloud provider.');
  }
}
