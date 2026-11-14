import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { uploadPdfToDropbox } from '@/lib/cloud/dropbox';
import { uploadPdfToGoogleDrive } from '@/lib/cloud/google-drive';

function jsonResponse(value: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
}

describe('cloud provider destination folders', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.GOOGLE_DRIVE_CLIENT_ID = 'google-client';
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'google-secret';
    process.env.DROPBOX_CLIENT_ID = 'dropbox-client';
    process.env.DROPBOX_CLIENT_SECRET = 'dropbox-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reuses the named Google Drive folder and uploads the PDF into it', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'google-access' }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'folder-1', name: 'Signed Contracts' }] }))
      .mockResolvedValueOnce(new Response('', { status: 200, headers: { location: 'https://upload.example/session-1' } }))
      .mockResolvedValueOnce(jsonResponse({ id: 'file-1', name: 'Agreement.pdf', webViewLink: 'https://drive.example/file-1' }));

    const result = await uploadPdfToGoogleDrive({
      refreshToken: 'refresh',
      metadata: {},
      fileName: 'Agreement.pdf',
      contentType: 'application/pdf',
      fileBuffer: Buffer.from('pdf'),
      workspaceName: 'Acme',
      destinationFolder: 'Signed Contracts',
    });

    expect(result.providerFileId).toBe('file-1');
    expect(String(fetchMock.mock.calls[1][0])).toContain('www.googleapis.com/drive/v3/files?');
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      name: 'Acme - Agreement.pdf',
      parents: ['folder-1'],
    });
  });

  it('creates the named Dropbox folder before uploading the PDF into it', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'dropbox-access' }))
      .mockResolvedValueOnce(jsonResponse({ metadata: { id: 'folder-1' } }))
      .mockResolvedValueOnce(jsonResponse({ id: 'file-1', name: 'Agreement.pdf', path_display: '/Signed Contracts/Agreement.pdf' }));

    const result = await uploadPdfToDropbox({
      refreshToken: 'refresh',
      metadata: {},
      fileName: 'Agreement.pdf',
      contentType: 'application/pdf',
      fileBuffer: Buffer.from('pdf'),
      workspaceName: 'Acme',
      destinationFolder: 'Signed Contracts',
    });

    expect(result.providerFileId).toBe('file-1');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.dropboxapi.com/2/files/create_folder_v2');
    const uploadHeaders = fetchMock.mock.calls[2][1]?.headers as Record<string, string>;
    expect(JSON.parse(uploadHeaders['Dropbox-API-Arg'])).toEqual(expect.objectContaining({
      path: '/Signed Contracts/Agreement.pdf',
      mode: 'add',
      autorename: true,
    }));
  });

  it('tags new automatic Google Drive exports with the stable job identity', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'google-access' }))
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'folder-1', name: 'Signed Contracts' }] }))
      .mockResolvedValueOnce(new Response('', { status: 200, headers: { location: 'https://upload.example/session-1' } }))
      .mockResolvedValueOnce(jsonResponse({ id: 'file-1', name: 'Agreement.pdf', webViewLink: 'https://drive.example/file-1' }));

    await uploadPdfToGoogleDrive({
      refreshToken: 'refresh',
      metadata: {},
      fileName: 'Agreement.pdf',
      contentType: 'application/pdf',
      fileBuffer: Buffer.from('pdf'),
      workspaceName: 'Acme',
      destinationFolder: 'Signed Contracts',
      idempotencyKey: 'export-job-1',
    });

    const lookupUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(lookupUrl.searchParams.get('q')).toContain("value = 'export-job-1'");
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toEqual({
      name: 'Acme - Agreement.pdf',
      parents: ['folder-1'],
      appProperties: { signworkflowExportJob: 'export-job-1' },
    });
  });

  it('reuses an existing Google Drive export when the same job is retried', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'google-access' }))
      .mockResolvedValueOnce(jsonResponse({
        files: [{
          id: 'existing-file',
          name: 'Acme - Agreement.pdf',
          webViewLink: 'https://drive.example/existing-file',
        }],
      }));

    const result = await uploadPdfToGoogleDrive({
      refreshToken: 'refresh',
      metadata: {},
      fileName: 'Agreement.pdf',
      contentType: 'application/pdf',
      fileBuffer: Buffer.from('pdf'),
      workspaceName: 'Acme',
      destinationFolder: 'Signed Contracts',
      idempotencyKey: 'export-job-1',
    });

    expect(result).toEqual(expect.objectContaining({
      providerFileId: 'existing-file',
      providerUrl: 'https://drive.example/existing-file',
    }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('overwrites the same deterministic Dropbox path when an automatic job is retried', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'dropbox-access' }))
        .mockResolvedValueOnce(jsonResponse({ metadata: { id: 'folder-1' } }))
        .mockResolvedValueOnce(jsonResponse({ id: 'file-1', name: 'Agreement.pdf', path_display: '/Signed Contracts/Agreement.pdf' }));
    }

    const input = {
      refreshToken: 'refresh',
      metadata: {},
      fileName: 'Agreement.pdf',
      contentType: 'application/pdf',
      fileBuffer: Buffer.from('pdf'),
      workspaceName: 'Acme',
      destinationFolder: 'Signed Contracts',
      idempotencyKey: 'export-job-1',
    };
    await uploadPdfToDropbox(input);
    await uploadPdfToDropbox(input);

    const firstHeaders = fetchMock.mock.calls[2][1]?.headers as Record<string, string>;
    const secondHeaders = fetchMock.mock.calls[5][1]?.headers as Record<string, string>;
    const firstUpload = JSON.parse(firstHeaders['Dropbox-API-Arg']);
    const secondUpload = JSON.parse(secondHeaders['Dropbox-API-Arg']);
    expect(firstUpload).toEqual(expect.objectContaining({
      path: expect.stringMatching(/^\/Signed Contracts\/Agreement--sw-[0-9a-f]{24}\.pdf$/),
      mode: 'overwrite',
      autorename: false,
    }));
    expect(secondUpload.path).toBe(firstUpload.path);
  });
});
