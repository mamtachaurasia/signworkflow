'use client';
import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Trash2,
  Save,
  SendHorizontal,
  PenTool,
  Ban,
  ThumbsUp,
  Eye,
  Trash,
  RefreshCw,
  Download,
  ContactRound,
  Mail,
} from 'lucide-react';
import { Contact, Doc, DocumentShare, DocumentShareAccess, statuses } from '@/types/types';
import PdfThumbnail from '@/components/PdfThumbnails';
import { useRouter } from 'next/navigation';
import useContextStore from '@/hooks/useContextStore';
import toast from 'react-hot-toast';
import Filters from './dashboard/Filters';
import { useFilteredDocs } from '@/hooks/useFilteredDocs';
import DeleteModal from './documents/DeleteModal';
import { Button, Input, Modal, Select } from '@ui';
import { isAdminRole, isAuditorRole } from '@/lib/role-utils';
import { DASHBOARD_DOCUMENTS_REFRESH_EVENT } from '@/lib/dashboard-events';
interface DocumentListProps {
  searchQuery: string;
}

type TeamListEntry = {
  id: string;
  name: string;
  members?: Array<{ userId?: string }>;
};

type TeamOption = { id: string; name: string };

const TEAM_OPTIONS_CACHE_TTL_MS = 5 * 60_000;
const teamOptionsCache = new Map<string, { options: TeamOption[]; updatedAt: number }>();
const teamOptionsRequests = new Map<string, Promise<TeamOption[]>>();

type ZipFileEntry = {
  name: string;
  data: ArrayBuffer;
};

let crcTable: Uint32Array | null = null;

function getCrcTable() {
  if (crcTable) {
    return crcTable;
  }

  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    crcTable[i] = value >>> 0;
  }
  return crcTable;
}

function calculateCrc32(data: Uint8Array) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getZipDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { dosDate, dosTime };
}

function sanitizeZipBaseName(name: string, fallback: string) {
  const normalized = name
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || fallback;
}

function createZipBlob(files: ZipFileEntry[]) {
  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  const { dosDate, dosTime } = getZipDateTime();
  let offset = 0;
  let centralDirectorySize = 0;

  files.forEach((file) => {
    const fileName = encoder.encode(file.name);
    const dataBytes = new Uint8Array(file.data);
    const crc = calculateCrc32(dataBytes);
    const localHeader = new ArrayBuffer(30 + fileName.length);
    const localView = new DataView(localHeader);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, dataBytes.byteLength, true);
    localView.setUint32(22, dataBytes.byteLength, true);
    localView.setUint16(26, fileName.length, true);
    new Uint8Array(localHeader, 30).set(fileName);

    localParts.push(localHeader, file.data);

    const centralHeader = new ArrayBuffer(46 + fileName.length);
    const centralView = new DataView(centralHeader);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, dataBytes.byteLength, true);
    centralView.setUint32(24, dataBytes.byteLength, true);
    centralView.setUint16(28, fileName.length, true);
    centralView.setUint32(42, offset, true);
    new Uint8Array(centralHeader, 46).set(fileName);

    centralParts.push(centralHeader);
    offset += localHeader.byteLength + dataBytes.byteLength;
    centralDirectorySize += centralHeader.byteLength;
  });

  const endRecord = new ArrayBuffer(22);
  const endView = new DataView(endRecord);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, offset, true);

  return new Blob([...localParts, ...centralParts, endRecord], { type: 'application/zip' });
}

const statusIcons: Record<Doc['status'], React.ElementType> = {
  draft: FileText,
  saved: Save,
  sent: SendHorizontal,
  viewed: Eye,
  in_progress: Clock,
  signed: PenTool,
  approved: ThumbsUp,
  completed: CheckCircle,
  rejected: XCircle,
  delivery_failed: AlertTriangle,
  trashed: Trash,
  expired: Clock,
  cancelled: Ban,
  voided: Ban,
  pending: Clock,
};

const shareAccessOptions: Array<{
  value: DocumentShareAccess;
  label: string;
  description: string;
}> = [
    {
      value: 'can_view',
      label: 'Can View',
      description: 'Can view, download, and make copies of the document.',
    },
    {
      value: 'can_send',
      label: 'Can Send',
      description: 'Can view, download, make copies, invite to sign, and manage document invites.',
    },
    {
      value: 'can_edit',
      label: 'Can Edit',
      description: 'Can edit, download, invite to sign, and manage document invites.',
    },
  ];

function getContactDisplayName(contact: Contact) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || contact.email;
}

function getInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
}

function upsertShareEntry(entries: DocumentShare[] | undefined, share: DocumentShare) {
  const currentEntries = Array.isArray(entries) ? [...entries] : [];
  const normalizedEmail = share.email?.toLowerCase();
  if (!normalizedEmail) {
    return currentEntries;
  }
  const existingIndex = currentEntries.findIndex((entry) => entry.email?.toLowerCase() === normalizedEmail);

  if (existingIndex >= 0) {
    currentEntries[existingIndex] = {
      ...currentEntries[existingIndex],
      ...share,
    };
    return currentEntries;
  }

  return [...currentEntries, share];
}

export default function DocumentList({ searchQuery }: DocumentListProps) {
  const { documents, setDocuments, user } = useContextStore();
  const teamCacheKey = `${user?.id ?? 'unknown'}:${user?.orgId ?? 'personal'}:${user?.orgRole ?? user?.role ?? 'user'}`;
  /* -------------------- UI State -------------------- */
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedTime, setSelectedTime] = useState<string>('all');
  const [selectedOwner, setSelectedOwner] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('recent');
  const [isSortAscending, setIsSortAscending] = useState(false);
  const [downloadingDoc, setDownloadingDoc] = useState<string | null>(null);
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>(
    () => teamOptionsCache.get(teamCacheKey)?.options ?? []
  );
  /* -------------------- Selection -------------------- */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareAccess, setShareAccess] = useState<DocumentShareAccess>('can_view');
  const [shareContact, setShareContact] = useState('');
  const [shareContactEmail, setShareContactEmail] = useState('');
  const [shareContactId, setShareContactId] = useState('');
  const [shareContacts, setShareContacts] = useState<Contact[]>([]);
  const [isShareContactListOpen, setIsShareContactListOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareUpdatingEmail, setShareUpdatingEmail] = useState<string | null>(null);
  const [isRemovingAllShareAccess, setIsRemovingAllShareAccess] = useState(false);

  const router = useRouter();
  const activeDocuments = useMemo(
    () => documents.filter((doc) => !doc.deletedAt),
    [documents]
  );
  const fallbackTeamOptions = useMemo(
    () =>
      Array.from(
        new Map(
          activeDocuments
            .filter((doc) => doc.teamId)
            .map((doc) => [
              String(doc.teamId),
              {
                id: String(doc.teamId),
                name: doc.teamName || 'Untitled team',
              },
            ])
        ).values()
      ),
    [activeDocuments]
  );
  const availableTeams = teamOptions.length > 0 ? teamOptions : fallbackTeamOptions;
  const selectedDocsForShare = useMemo(
    () => documents.filter((doc) => selectedIds.includes(doc.id)),
    [documents, selectedIds]
  );
  const shareAccessDescription =
    shareAccessOptions.find((option) => option.value === shareAccess)?.description ||
    shareAccessOptions[0].description;
  const filteredShareContacts = useMemo(() => {
    const query = shareContact.trim().toLowerCase();
    const matches = query
      ? shareContacts.filter((contact) =>
        `${getContactDisplayName(contact)} ${contact.email} ${contact.companyName || ''}`
          .toLowerCase()
          .includes(query)
      )
      : shareContacts;

    return matches.slice(0, 8);
  }, [shareContact, shareContacts]);
  const primarySharedDocument = selectedDocsForShare.length === 1 ? selectedDocsForShare[0] : null;
  const primarySharedEntries = Array.isArray(primarySharedDocument?.sharedWith)
    ? primarySharedDocument.sharedWith.filter((share) => !share.revokedAt)
    : [];
  const filteredDocuments = useFilteredDocs(
    activeDocuments,
    selectedStatus,
    searchQuery,
    selectedTeamId
  );
  const fullyFilteredDocuments = useMemo(() => {
    const now = Date.now();
    const currentUserId = user?.id ? String(user.id) : '';

    return filteredDocuments.filter((doc) => {
      if (selectedType === 'docs' && doc.isTemplate) {
        return false;
      }

      if (selectedTime === '7d' || selectedTime === '30d') {
        const ageLimit = selectedTime === '7d' ? 7 : 30;
        const createdTime = new Date(doc.createdAt || 0).getTime();
        if (!createdTime || Number.isNaN(createdTime)) {
          return false;
        }
        const daysSinceCreate = (now - createdTime) / (1000 * 60 * 60 * 24);
        if (daysSinceCreate > ageLimit) {
          return false;
        }
      }

      if (selectedOwner === 'me') {
        const ownerIds = [doc.userId, doc.ownerId]
          .filter((ownerId): ownerId is string => typeof ownerId === 'string' && ownerId.length > 0)
          .map((ownerId) => String(ownerId));
        if (!currentUserId || !ownerIds.includes(currentUserId)) {
          return false;
        }
      }

      if (selectedOwner === 'team') {
        if (!doc.teamId) {
          return false;
        }
      }

      return true;
    });
  }, [filteredDocuments, selectedOwner, selectedTime, selectedType, user?.id]);
  const sortedDocuments = useMemo(() => {
    const docs = [...fullyFilteredDocuments];
    const comparator = (a: Doc, b: Doc) => {
      if (sortBy === 'name') {
        const left = (a.name || '').toLowerCase();
        const right = (b.name || '').toLowerCase();
        return left.localeCompare(right);
      }

      const left = new Date(a.createdAt || 0).getTime();
      const right = new Date(b.createdAt || 0).getTime();
      return left - right;
    };
    docs.sort(comparator);

    const sortMultiplier =
      sortBy === 'oldest'
        ? (isSortAscending ? -1 : 1)
        : (isSortAscending ? 1 : -1);
    return sortMultiplier === 1 ? docs : docs.reverse();
  }, [fullyFilteredDocuments, isSortAscending, sortBy]);
  /* -------------------- Download -------------------- */

  useEffect(() => {
    let cancelled = false;

    if (!user?.orgId) {
      setTeamOptions([]);
      return () => {
        cancelled = true;
      };
    }

    const cached = teamOptionsCache.get(teamCacheKey);
    if (cached) {
      setTeamOptions(cached.options);
      if (Date.now() - cached.updatedAt < TEAM_OPTIONS_CACHE_TTL_MS) {
        return () => {
          cancelled = true;
        };
      }
    }

    const loadTeams = async () => {
      try {
        let request = teamOptionsRequests.get(teamCacheKey);
        if (!request) {
          request = fetch('/api/orgs/teams', { credentials: 'include' }).then(async (response) => {
            if (!response.ok) return cached?.options ?? [];

            const payload = await response.json().catch(() => ({}));
            const teams = Array.isArray(payload?.teams) ? (payload.teams as TeamListEntry[]) : [];
            const canViewAllTeams =
              isAdminRole(user?.orgRole || user?.role) || isAuditorRole(user?.orgRole || user?.role);
            const visibleTeams = canViewAllTeams
              ? teams
              : teams.filter((team) =>
                Array.isArray(team.members)
                  ? team.members.some((member) => member?.userId === user?.id)
                  : false
              );

            return visibleTeams.map((team) => ({
              id: team.id,
              name: team.name,
            }));
          });
          teamOptionsRequests.set(teamCacheKey, request);
        }

        const options = await request;
        teamOptionsCache.set(teamCacheKey, { options, updatedAt: Date.now() });

        if (!cancelled) {
          setTeamOptions(options);
        }
      } catch (error) {
        console.error('Failed to load team filters:', error);
      } finally {
        teamOptionsRequests.delete(teamCacheKey);
      }
    };

    void loadTeams();

    return () => {
      cancelled = true;
    };
  }, [teamCacheKey, user?.id, user?.orgId, user?.orgRole, user?.role]);

  useEffect(() => {
    if (!isShareModalOpen) {
      return;
    }

    let cancelled = false;

    const loadContacts = async () => {
      try {
        const response = await fetch('/api/contacts', { credentials: 'include' });
        if (!response.ok) {
          return;
        }
        const payload = await response.json().catch(() => ({}));
        if (!cancelled) {
          setShareContacts(Array.isArray(payload?.contacts) ? payload.contacts : []);
        }
      } catch (error) {
        console.error('Failed to load share contacts:', error);
      }
    };

    void loadContacts();

    return () => {
      cancelled = true;
    };
  }, [isShareModalOpen]);

  useEffect(() => {
    if (selectedTeamId === 'all' || selectedTeamId === 'unassigned') {
      return;
    }

    if (!availableTeams.some((team) => team.id === selectedTeamId)) {
      setSelectedTeamId('all');
    }
  }, [availableTeams, selectedTeamId]);

  async function handleDownloadSignedCopy(doc: Doc) {
    try {
      setDownloadingDoc(doc.id);
      const res = await fetch(`/api/documents/download-signed?documentId=${encodeURIComponent(doc.documentId || doc.id)}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to download signed document');
      }

      // Download the PDF
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.name}-signed.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Signed document downloaded successfully');
    } catch (err) {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error('Failed to download signed document');
      }
    } finally {
      setDownloadingDoc(null);
    }
  }

  async function handleResetStatus(doc: Doc) {
    try {
      const res = await fetch(`/api/documents/${doc.id}/reset`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to reset document status');
      }

      const { document: updatedDoc } = await res.json();

      // Update the document in the local state
      setDocuments(prev => prev.map(d => {
        if (d.id === updatedDoc._id) {
          return {
            ...d,
            ...updatedDoc,
            id: updatedDoc._id,
            createdAt: new Date(updatedDoc.createdAt),
            updatedAt: new Date(updatedDoc.updatedAt),
          };
        }
        return d;
      }));

      toast.success('Document status has been reset.');
    } catch (err) {
      if (err instanceof Error) {
        toast.error(`Cannot reset: ${err.message}`);
      } else {
        toast.error('Cannot reset: Unknown error');
      }
    }
  }

  /* -------------------- Selection helpers -------------------- */
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const selectableIds = sortedDocuments.map(d => d.id);

    const allSelected =
      selectableIds.length > 0 &&
      selectableIds.every(id => selectedIds.includes(id));

    if (allSelected) {
      // deselect only selectable docs
      setSelectedIds(prev =>
        prev.filter(id => !selectableIds.includes(id))
      );
    } else {
      // select all non-trashed docs
      setSelectedIds(selectableIds);
    }
  };

  const handleDeleteDoc = (trashedIds: string[]) => {
    const deletedAt = new Date();
    setDocuments(prev =>
      prev.map(doc =>
        trashedIds.includes(doc.id)
          ? {
            ...doc,
            deletedAt,
            statusBeforeDelete: doc.statusBeforeDelete || doc.status,
          }
          : doc
      )
    );
    setSelectedIds([]);
    setIsDeleteModalOpen(false);
    localStorage.removeItem('currentDocumentId');
  };

  const handleBulkDownload = async () => {
    const selectedDocs = documents.filter((doc) => selectedIds.includes(doc.id));
    if (!selectedDocs.length) return;
    try {
      const zipFiles: ZipFileEntry[] = [];
      const usedNames = new Set<string>();
      let addedFilesCount = 0;
      await Promise.all(
        selectedDocs.map(async (doc) => {
          try {
            const fileUrl = doc.fileUrl ?? doc.url;
            if (!fileUrl) return;
            const response = await fetch(fileUrl);
            if (!response.ok) return;
            const blob = await response.blob();
            const extension = blob.type.includes('pdf') ? 'pdf' : 'bin';
            const baseName = sanitizeZipBaseName(doc.name || doc.id, doc.id);
            let fileName = `${baseName}.${extension}`;
            let suffix = 2;

            while (usedNames.has(fileName)) {
              fileName = `${baseName} (${suffix}).${extension}`;
              suffix += 1;
            }

            usedNames.add(fileName);
            zipFiles.push({
              name: fileName,
              data: await blob.arrayBuffer(),
            });
            addedFilesCount += 1;
          } catch {
            // Keep processing remaining files; partial success is surfaced in toast messaging.
          }
        })
      );

      if (addedFilesCount === 0) {
        toast.error('No downloadable files found for selected documents');
        return;
      }

      const zipBlob = createZipBlob(zipFiles);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documents-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      if (addedFilesCount < selectedDocs.length) {
        toast.success(`${addedFilesCount} of ${selectedDocs.length} selected files downloaded as ZIP`);
      } else {
        toast.success('Selected files downloaded as ZIP');
      }
    } catch {
      toast.error('Failed to download selected files');
    }
  };

  const resetShareForm = () => {
    setShareContact('');
    setShareContactEmail('');
    setShareContactId('');
    setShareAccess('can_view');
    setIsShareContactListOpen(false);
  };

  const handleCloseShareModal = () => {
    setIsShareModalOpen(false);
    resetShareForm();
  };

  const handleSelectShareContact = (contact: Contact) => {
    setShareContact(getContactDisplayName(contact));
    setShareContactEmail(contact.email);
    setShareContactId(contact._id || '');
    setIsShareContactListOpen(false);
  };

  const handleShareSubmit = async () => {
    const selectedDocs = selectedDocsForShare;
    if (!selectedDocs.length || (!shareContact.trim() && !shareContactEmail.trim()) || isSharing) {
      return;
    }

    setIsSharing(true);
    const results = await Promise.all(
      selectedDocs.map(async (doc) => {
        try {
          const response = await fetch('/api/documents/share', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              documentId: doc.id,
              contact: shareContact.trim(),
              contactEmail: shareContactEmail.trim() || undefined,
              contactId: shareContactId || undefined,
              access: shareAccess,
            }),
          });
          const payload = await response.json().catch(() => ({}));
          return {
            docId: doc.id,
            ok: response.ok && payload?.success !== false,
            emailSent: Boolean(payload?.emailSent),
            share: payload?.share as DocumentShare | undefined,
            message: typeof payload?.message === 'string' ? payload.message : undefined,
          };
        } catch (error) {
          return {
            docId: doc.id,
            ok: false,
            emailSent: false,
            share: undefined,
            message: error instanceof Error ? error.message : undefined,
          };
        }
      })
    );

    setIsSharing(false);
    const successfulResults = results.filter((result) => result.ok);
    const sharedCount = successfulResults.length;

    if (sharedCount === 0) {
      toast.error(results.find((result) => result.message)?.message || 'Unable to share selected files right now.');
      return;
    }

    const shareByDocId = new Map<string, DocumentShare>();
    successfulResults.forEach((result) => {
      if (result.share?.email) {
        shareByDocId.set(result.docId, result.share);
      }
    });
    if (shareByDocId.size > 0) {
      setDocuments((prev) =>
        prev.map((doc) => {
          const share = shareByDocId.get(doc.id);
          return share ? { ...doc, sharedWith: upsertShareEntry(doc.sharedWith, share) } : doc;
        })
      );
    }

    const failedNotifications = successfulResults.filter((result) => !result.emailSent).length;
    if (sharedCount < selectedDocs.length) {
      toast.success(`Shared ${sharedCount} of ${selectedDocs.length} file(s) with ${shareContact}`);
    } else if (failedNotifications > 0) {
      toast.error(
        `Access saved for ${sharedCount} file(s), but ${failedNotifications} email notification(s) failed.`
      );
    } else {
      toast.success(`Shared ${selectedDocs.length} file(s) with ${shareContact}`);
    }
    handleCloseShareModal();
  };

  const handleChangeExistingShareAccess = async (email: string, access: DocumentShareAccess) => {
    if (!primarySharedDocument || shareUpdatingEmail) {
      return;
    }

    setShareUpdatingEmail(email);
    try {
      const response = await fetch('/api/documents/share', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: primarySharedDocument.id,
          email,
          access,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || 'Failed to update access');
      }

      const sharedWith = Array.isArray(payload?.sharedWith)
        ? (payload.sharedWith as DocumentShare[])
        : primarySharedEntries.map((share) => (share.email === email ? { ...share, access } : share));
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === primarySharedDocument.id ? { ...doc, sharedWith } : doc))
      );
      if (payload?.emailSent === false) {
        toast.error(payload?.emailError || `Access updated for ${email}, but the email notification failed.`);
      } else {
        toast.success(`Access updated for ${email}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update access');
    } finally {
      setShareUpdatingEmail(null);
    }
  };

  const handleRemoveShareAccess = async (email: string) => {
    if (!primarySharedDocument || shareUpdatingEmail) {
      return;
    }

    setShareUpdatingEmail(email);
    try {
      const response = await fetch('/api/documents/share', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: primarySharedDocument.id,
          email,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || 'Failed to remove access');
      }

      const sharedWith = Array.isArray(payload?.sharedWith)
        ? (payload.sharedWith as DocumentShare[])
        : primarySharedEntries.filter((share) => share.email !== email);
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === primarySharedDocument.id ? { ...doc, sharedWith } : doc))
      );
      toast.success(`Removed access for ${email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove access');
    } finally {
      setShareUpdatingEmail(null);
    }
  };

  const handleRemoveAllShareAccess = async () => {
    if (!primarySharedDocument || isRemovingAllShareAccess || primarySharedEntries.length === 0) {
      return;
    }

    setIsRemovingAllShareAccess(true);
    try {
      const response = await fetch('/api/documents/share', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: primarySharedDocument.id,
          removeAll: true,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || 'Failed to remove access');
      }

      const sharedWith = Array.isArray(payload?.sharedWith) ? (payload.sharedWith as DocumentShare[]) : [];
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === primarySharedDocument.id ? { ...doc, sharedWith } : doc))
      );
      toast.success('Removed access from everyone');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove access');
    } finally {
      setIsRemovingAllShareAccess(false);
    }
  };

  return (
    <>

      <Filters
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
        selectedTeamId={selectedTeamId}
        setSelectedTeamId={setSelectedTeamId}
        teams={availableTeams}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
        selectedTime={selectedTime}
        setSelectedTime={setSelectedTime}
        selectedOwner={selectedOwner}
        setSelectedOwner={setSelectedOwner}
        sortBy={sortBy}
        setSortBy={setSortBy}
        toggleSelectAll={toggleSelectAll}
        selectedIds={selectedIds}
        visibleDocumentIds={sortedDocuments.map((doc) => doc.id)}
        bulkDelete={() => setIsDeleteModalOpen(true)}
        onBulkDownload={handleBulkDownload}
        onBulkShare={() => {
          resetShareForm();
          setIsShareModalOpen(true);
        }}
        onRefresh={() => {
          window.dispatchEvent(
            new CustomEvent(DASHBOARD_DOCUMENTS_REFRESH_EVENT, {
              detail: { source: 'filters' },
            })
          );
        }}
        onToggleSortDirection={() => setIsSortAscending((prev) => !prev)}
        isSortAscending={isSortAscending}
      />
      <div className="space-y-2 mt-2">
        {sortedDocuments.map((doc) => {
          const statusObj = statuses.find(item => item?.value == doc.status)
          const StatusIcon = statusIcons[doc.status];
          const statusColor = statusObj?.color;
          const docFileUrl = doc.fileUrl ?? doc.url ?? '';
          const currentUserId = user?.id ? String(user.id) : null;
          const ownerId = doc.ownerId ?? doc.userId;
          const canResumeWriting = Boolean(doc.hasEditableContent)
            && (doc.status === 'draft' || doc.status === 'saved')
            && (String(ownerId ?? '') === currentUserId || doc.shareAccess === 'can_edit');
          return (
            <div
              key={doc.id}
              className="flex items-center px-4 py-2 bg-white rounded-lg shadow-xs hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(doc.id)}
                  onChange={() => toggleSelect(doc.id)}
                  className="h-4 w-4 accent-brand-600"
                />
                <PdfThumbnail
                  fileUrl={docFileUrl}
                  width={40}
                  height={50}
                  cacheKey={`${docFileUrl}:${doc.currentVersion ?? ''}:${
                    doc.updatedAt ? new Date(doc.updatedAt).getTime() : ''
                  }`}
                />
                <div className="font-medium text-gray-900" onClick={() => {
                  if (docFileUrl && doc.documentId) {
                    localStorage.setItem('currentDocumentId', doc.documentId);
                    // clear any previous session id so a new session will start when editor opens
                    localStorage.removeItem('currentSessionId');
                    router.push(`/builder/${doc.documentId}${canResumeWriting ? '?workspace=content' : ''}`);
                  } else {
                    toast('No file found for this document.');
                  }
                }}>
                  {doc.name}
                  {doc.teamId ? (
                    <span className="ml-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {doc.teamName || 'Team'}
                    </span>
                  ) : null}
                  {canResumeWriting ? (
                    <span className="ml-2 inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                      Editable draft
                    </span>
                  ) : null}
                  <small className="flex text-gray-500">
                    Created {doc.createdAt && new Date(doc.createdAt).toLocaleDateString()}
                  </small>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm">
                {doc.status == 'rejected' && <Button size="sm"
                  className="rounded-full! relative group"
                  onClick={(e) => {
                    e?.stopPropagation();
                    handleResetStatus(doc);
                  }}
                  disabled={downloadingDoc === doc.id}
                  title="Reset Status"
                  data-testid={`reset-status-${doc.id}`}
                  icon={<RefreshCw size={16} />}
                  inverted
                >
                  <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded-sm shadow-lg z-10">
                    The document signing request was rejected by a recipient. Reset the document status to continue signing.
                  </div>
                </Button>
                }
                <Button size="sm"
                  className="text-red-500 hover:text-red-700 rounded-full! relative"
                  onClick={(e) => {
                    e?.stopPropagation();
                    setIsDeleteModalOpen(true);
                    setSelectedIds([doc.id]);
                  }}
                  inverted
                  data-testid={`delete-doc-${doc.id}`}
                  icon={<Trash2 size={16} />}
                  title="Delete"
                />

                <Button size="sm" inverted
                  className={`rounded-full!`}
                  title='View / Download'
                  icon={<Eye size={16} />}
                  disabled={!docFileUrl}
                  onClick={(e) => {
                    e?.stopPropagation();
                    window.open(docFileUrl, '_Blank')
                  }}
                />

                <Button size="sm"
                  onClick={(e) => {
                    if (doc.status !== 'completed') {
                      return false
                    }
                    e?.stopPropagation();
                    handleDownloadSignedCopy(doc);
                  }}
                  inverted
                  disabled={downloadingDoc === doc.id || doc.status !== 'completed'}
                  className={`rounded-full! relative group`}
                  title="Download Signed Copy"
                  data-testid={`download-signed-${doc.id}`}
                  icon={<Download size={16} className={`${downloadingDoc === doc.id ? 'animate-bounce' : ''}`} />}
                >
                  {doc.status !== 'completed' &&
                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded-sm shadow-lg z-10">
                      Signed copy will be available once all recipients complete signing.
                    </div>
                  }
                </Button>

                {StatusIcon && <StatusIcon size={22} className={`ml-2 ${statusColor}`} />}
                <span className={`capitalize ${statusColor}`}>
                  {doc.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <DeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        selectedDocs={documents.filter(doc => selectedIds.includes(doc.id))}
        onDeleteComplete={handleDeleteDoc}
      />
      {isShareModalOpen && (
        <Modal onClose={handleCloseShareModal} title={`Share ${selectedIds.length === 1 ? 'Document' : 'Documents'}`}
          description="Grant access to this document by sharing it with your contacts. You can manage permissions and revoke access at any time." open={isShareModalOpen} className="max-w-3xl">

          <div className="p-1">
            <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto]">
              <div className="relative">

                <div className="relative">
                  <Input
                    type="text"
                    placeholder="Enter an email or contact name"
                    label="Share with"
                    value={shareContact}
                    onChange={(e) => {
                      setShareContact(e.target.value);
                      setShareContactEmail('');
                      setShareContactId('');
                      setIsShareContactListOpen(true);
                    }}
                    onFocus={() => setIsShareContactListOpen(true)}
                    onBlur={() => window.setTimeout(() => setIsShareContactListOpen(false), 120)}

                  />
                  <ContactRound size={18} className="text-gray-400 absolute right-5 bottom-3" name={shareContact} aria-label="Show contacts" onClick={() => setIsShareContactListOpen((open) => !open)} />
                </div>

                {isShareContactListOpen && (
                  <div className="absolute z-[1000001] mt-2 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-xl">
                    {filteredShareContacts.length > 0 ? (
                      filteredShareContacts.map((contact) => {
                        const contactName = getContactDisplayName(contact);
                        return (
                          <button
                            key={contact._id || contact.email}
                            type="button"
                            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSelectShareContact(contact)}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700">
                              {getInitials(contactName)}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-900">{contactName}</span>
                              <span className="block truncate text-xs text-slate-500">{contact.email}</span>
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-4 py-3 text-sm text-slate-500">
                        No matching contacts. Enter a valid email address to share directly.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm">Access</label>
                <Select
                  className="w-full"
                  value={shareAccess}
                  onChange={(e) => setShareAccess(e.target.value as DocumentShareAccess)}
                  contentClassName="z-[1000002]"
                >
                  {shareAccessOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>

              <Button
                label={isSharing ? 'Sharing...' : 'Share'}
                onClick={handleShareSubmit}
                disabled={isSharing || (!shareContact.trim() && !shareContactEmail.trim())}
              />
            </div>

            <p className="mt-3 text-sm text-slate-600">{shareAccessDescription}</p>

            <div className="mt-8 border-t border-slate-200 pt-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                    {getInitials(user?.name || user?.email || 'You')}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">(You)</p>
                    <p className="truncate text-sm text-slate-600">{user?.email || 'Current user'}</p>
                  </div>
                </div>
                <span className="shrink-0 font-semibold text-slate-600 text-sm">Owner</span>
              </div>

              <h3 className="mt-8  font-semibold text-slate-900">People With Access</h3>
              {primarySharedDocument ? (
                <div className="mt-4 space-y-3">
                  {primarySharedEntries.length > 0 ? (
                    primarySharedEntries.map((share) => {
                      const label = share.name || share.email;
                      const accountStatusLabel =
                        share.accountStatus === 'pending'
                          ? 'Account invite pending'
                          : share.accountStatus === 'guest'
                            ? 'Guest link access'
                            : '';
                      return (
                        <div key={share.email} className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-100 px-3 py-2">
                          <div className="flex min-w-0 items-center gap-4">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700">
                              {getInitials(label)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{label}</p>
                              <p className="truncate text-sm text-slate-600">{share.email}</p>
                              {accountStatusLabel ? (
                                <p className="truncate text-xs font-medium text-amber-700">
                                  {accountStatusLabel}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div className="ml-auto flex shrink-0 items-center gap-2">
                            <Select
                              className="h-9 min-w-[8.5rem] border-slate-300 text-sm font-semibold"
                              value={share.access}
                              disabled={shareUpdatingEmail === share.email}
                              onChange={(event) =>
                                handleChangeExistingShareAccess(
                                  share.email,
                                  event.target.value as DocumentShareAccess
                                )
                              }
                            >
                              {shareAccessOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                              title={`Remove access for ${share.email}`}
                              icon={<Trash2 className="h-4 w-4" />}
                              disabled={shareUpdatingEmail === share.email}
                              onClick={() => handleRemoveShareAccess(share.email)}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-slate-500">No one else has access yet.</p>
                  )}
                  {primarySharedEntries.length > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      label={isRemovingAllShareAccess ? 'Removing access...' : 'Remove access from Everyone'}
                      disabled={isRemovingAllShareAccess || Boolean(shareUpdatingEmail)}
                      onClick={handleRemoveAllShareAccess}
                    />
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                  <Mail className="h-4 w-4" />
                  Access will be applied to all {selectedIds.length} selected documents.
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
