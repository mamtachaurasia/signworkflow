'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';

import { getCookieValue } from '@/utils/cookies';

const MAX_CLOUD_IMPORT_SIZE_BYTES = 25 * 1024 * 1024;
const GOOGLE_DRIVE_FILES_QUERY =
  "trashed = false and (mimeType = 'application/pdf' or mimeType = 'application/msword' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')";

type CloudPickerConfig = {
  googleDrive: {
    clientId: string;
    scope: string;
    mimeTypes: string[];
    configured: boolean;
    missingConfig: string[];
  };
  dropbox: {
    appKey: string;
    extensions: string[];
    configured: boolean;
    missingConfig: string[];
  };
};

export type GoogleDriveDocument = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string | null;
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type GoogleOAuth2Client = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: unknown) => void;
  }) => GoogleTokenClient;
};

type DropboxChooserFile = {
  name: string;
  link: string;
  bytes?: number;
  isDir?: boolean;
};

type DropboxChooserOptions = {
  success: (files: DropboxChooserFile[]) => void;
  cancel?: () => void;
  linkType?: 'preview' | 'direct';
  multiselect?: boolean;
  extensions?: string[];
};

type DropboxChooser = {
  choose: (options: DropboxChooserOptions) => void;
  isBrowserSupported?: () => boolean;
};

type GoogleDriveFilesResponse = {
  files?: Array<{
    id?: string;
    name?: string;
    mimeType?: string;
    size?: string;
    modifiedTime?: string;
  }>;
  error?: {
    message?: string;
  };
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleOAuth2Client;
      };
    };
    Dropbox?: DropboxChooser;
  }
}

let pickerConfigPromise: Promise<CloudPickerConfig> | null = null;

function guessMimeType(fileName: string): string {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith('.pdf')) return 'application/pdf';
  if (normalized.endsWith('.doc')) return 'application/msword';
  if (normalized.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/octet-stream';
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function parseApiError(response: Response, fallback: string): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return new Error(payload?.message || fallback);
}

async function getCloudPickerConfig(): Promise<CloudPickerConfig> {
  if (!pickerConfigPromise) {
    pickerConfigPromise = fetch('/api/cloud/picker-config', {
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw await parseApiError(response, 'Unable to load cloud picker configuration.');
        }
        return (await response.json()) as CloudPickerConfig;
      })
      .catch((error) => {
        pickerConfigPromise = null;
        throw error;
      });
  }

  return pickerConfigPromise;
}

function loadExternalScript(src: string, id: string, attributes?: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Cloud import is only available in the browser.'));
      return;
    }

    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Unable to load cloud picker.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;

    for (const [key, value] of Object.entries(attributes || {})) {
      script.setAttribute(key, value);
    }

    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve();
      },
      { once: true }
    );
    script.addEventListener('error', () => reject(new Error('Unable to load cloud picker.')), { once: true });

    document.body.appendChild(script);
  });
}

async function requestGoogleDriveAccessToken(config: CloudPickerConfig['googleDrive']): Promise<string> {
  await loadExternalScript('https://accounts.google.com/gsi/client', 'google-identity-services');

  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Google Drive import could not start.');
  }

  return new Promise((resolve, reject) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: config.clientId,
      scope: config.scope,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }

        if (!response.access_token) {
          reject(new Error('Google Drive did not return an access token.'));
          return;
        }

        resolve(response.access_token);
      },
      error_callback: (error) => {
        reject(error instanceof Error ? error : new Error('Google Drive authorization failed.'));
      },
    });

    tokenClient.requestAccessToken({ prompt: 'consent select_account' });
  });
}

async function listGoogleDriveDocuments(accessToken: string): Promise<GoogleDriveDocument[]> {
  const params = new URLSearchParams({
    fields: 'files(id,name,mimeType,size,modifiedTime)',
    includeItemsFromAllDrives: 'true',
    orderBy: 'modifiedTime desc',
    pageSize: '30',
    q: GOOGLE_DRIVE_FILES_QUERY,
    spaces: 'drive',
    supportsAllDrives: 'true',
  });

  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => null)) as GoogleDriveFilesResponse | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Unable to load files from Google Drive.');
  }

  return (payload?.files || [])
    .filter((file) => file.id && file.name && file.mimeType)
    .map((file) => ({
      id: file.id as string,
      name: file.name as string,
      mimeType: file.mimeType as string,
      size: file.size ? Number(file.size) : null,
      modifiedTime: file.modifiedTime || null,
    }));
}

async function downloadGoogleDriveDocument(
  file: GoogleDriveDocument,
  accessToken: string
): Promise<File> {
  if (typeof file.size === 'number' && file.size > MAX_CLOUD_IMPORT_SIZE_BYTES) {
    throw new Error('File too large. Maximum upload size is 25MB.');
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error('Unable to download the selected Google Drive file.');
  }

  const blob = await response.blob();
  if (blob.size > MAX_CLOUD_IMPORT_SIZE_BYTES) {
    throw new Error('File too large. Maximum upload size is 25MB.');
  }

  return new File([blob], file.name, {
    type: file.mimeType || blob.type || guessMimeType(file.name),
  });
}

async function downloadDropboxDocument(file: DropboxChooserFile): Promise<File> {
  if (typeof file.bytes === 'number' && file.bytes > MAX_CLOUD_IMPORT_SIZE_BYTES) {
    throw new Error('File too large. Maximum upload size is 25MB.');
  }

  const csrfToken = getCookieValue('csrf_token');
  const mimeType = guessMimeType(file.name);
  const response = await fetch('/api/cloud/import-url', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: JSON.stringify({
      provider: 'dropbox',
      url: file.link,
      name: file.name,
      mimeType,
    }),
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Unable to download the selected Dropbox file.');
  }

  const blob = await response.blob();
  if (blob.size > MAX_CLOUD_IMPORT_SIZE_BYTES) {
    throw new Error('File too large. Maximum upload size is 25MB.');
  }

  return new File([blob], file.name, {
    type: blob.type || mimeType,
  });
}

async function chooseDropboxDocument(config: CloudPickerConfig['dropbox']): Promise<File | null> {
  await loadExternalScript('https://www.dropbox.com/static/api/2/dropins.js', 'dropboxjs', {
    'data-app-key': config.appKey,
  });

  const chooser = window.Dropbox;
  if (!chooser) {
    throw new Error('Dropbox chooser could not start.');
  }
  if (chooser.isBrowserSupported?.() === false) {
    throw new Error('Dropbox chooser is not supported in this browser.');
  }

  return new Promise((resolve, reject) => {
    chooser.choose({
      linkType: 'direct',
      multiselect: false,
      extensions: config.extensions,
      cancel: () => resolve(null),
      success: (files) => {
        const selectedFile = files.find((file) => !file.isDir);
        if (!selectedFile) {
          resolve(null);
          return;
        }

        downloadDropboxDocument(selectedFile).then(resolve).catch(reject);
      },
    });
  });
}

export function formatCloudFileSize(size: number | null): string {
  if (typeof size !== 'number' || Number.isNaN(size)) return 'Unknown size';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function useCloudDocumentPicker({
  onFileSelected,
}: {
  onFileSelected: (file: File, sourceLabel: string) => void;
}) {
  const [googleDriveAccessToken, setGoogleDriveAccessToken] = useState<string | null>(null);
  const [googleDriveDialogOpen, setGoogleDriveDialogOpen] = useState(false);
  const [googleDriveFiles, setGoogleDriveFiles] = useState<GoogleDriveDocument[]>([]);
  const [googleDriveLoading, setGoogleDriveLoading] = useState(false);
  const [importingCloudFileId, setImportingCloudFileId] = useState<string | null>(null);
  const [isPickingCloud, setIsPickingCloud] = useState(false);

  const closeGoogleDriveDialog = useCallback(() => {
    if (importingCloudFileId) return;
    setGoogleDriveDialogOpen(false);
  }, [importingCloudFileId]);

  const openGoogleDrive = useCallback(async () => {
    setGoogleDriveDialogOpen(true);
    setGoogleDriveLoading(true);
    setIsPickingCloud(true);

    try {
      const config = await getCloudPickerConfig();
      if (!config.googleDrive.configured) {
        throw new Error('Google Drive import is not configured.');
      }

      const accessToken = await requestGoogleDriveAccessToken(config.googleDrive);
      setGoogleDriveAccessToken(accessToken);
      setGoogleDriveFiles(await listGoogleDriveDocuments(accessToken));
    } catch (error) {
      setGoogleDriveDialogOpen(false);
      toast.error(getErrorMessage(error, 'Unable to open Google Drive.'));
    } finally {
      setGoogleDriveLoading(false);
      setIsPickingCloud(false);
    }
  }, []);

  const importGoogleDriveFile = useCallback(
    async (file: GoogleDriveDocument) => {
      if (!googleDriveAccessToken) {
        toast.error('Google Drive authorization expired. Open Google Drive again.');
        return;
      }

      setImportingCloudFileId(file.id);
      try {
        const selectedFile = await downloadGoogleDriveDocument(file, googleDriveAccessToken);
        setGoogleDriveDialogOpen(false);
        onFileSelected(selectedFile, 'Google Drive');
      } catch (error) {
        toast.error(getErrorMessage(error, 'Unable to import the selected Google Drive file.'));
      } finally {
        setImportingCloudFileId(null);
      }
    },
    [googleDriveAccessToken, onFileSelected]
  );

  const openDropbox = useCallback(async () => {
    setIsPickingCloud(true);
    try {
      const config = await getCloudPickerConfig();
      if (!config.dropbox.configured) {
        throw new Error('Dropbox import is not configured.');
      }

      const selectedFile = await chooseDropboxDocument(config.dropbox);
      if (selectedFile) {
        onFileSelected(selectedFile, 'Dropbox');
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to open Dropbox.'));
    } finally {
      setIsPickingCloud(false);
    }
  }, [onFileSelected]);

  return {
    closeGoogleDriveDialog,
    googleDriveDialogOpen,
    googleDriveFiles,
    googleDriveLoading,
    importGoogleDriveFile,
    importingCloudFileId,
    isPickingCloud,
    openDropbox,
    openGoogleDrive,
  };
}
