'use client';

// Reuse this authenticated page's RSC payload for quick back/forward revisits.
// Client data still revalidates independently below.
export const unstable_dynamicStaleTime = 60;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import DashboardSidebarShell from '@/components/dashboard/DashboardSidebarShell';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import SearchInput from '@/components/dashboard/DocSearch';
import TemplateSearch from '@/components/templates/TemplateSearch';
import { Button } from '@ui';

import useContextStore from '@/hooks/useContextStore';
import { useAuth } from '@/components/auth/AuthProvider';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';

import { Doc, SecondarySidebarType, SidebarType } from '@/types/types';
import { ACCOUNT_CONFIG, type AccountSection } from '@/config/account.config';
import { DOCUMENT_CONFIG, type DocumentConfigItem } from '@/config/document.config';
import {
  DASHBOARD_ACCOUNT_BASE,
  NO_WORKSPACE_ACCOUNT_SECTION,
  canAccessAccountSectionWithoutOrg,
  getAccountSectionFromSegment,
  getDashboardAccountPath,
} from '@/lib/account-routing';
import { DASHBOARD_DOCUMENTS_REFRESH_EVENT } from '@/lib/dashboard-events';
import {
  getDashboardDocumentsUpdatedAt,
  markDashboardDocumentsUpdated,
} from '@/lib/dashboard-document-cache';

/* ------------------------------------------------------------------ */
/* Constants */
/* ------------------------------------------------------------------ */

const SIDEBAR_ROUTE_MAP: Array<{ match: string; sidebar: SidebarType }> = [
  { match: `${DASHBOARD_ACCOUNT_BASE}`, sidebar: 'account' },
  { match: '/account', sidebar: 'account' },
  { match: '/contacts', sidebar: 'contacts' },
];

// Dashboard views have intentionally different page-level props and are selected at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ViewComponent = React.ComponentType<any>;
type DocumentListItem = {
  id: string;
  originalFileName?: string;
  name?: string;
  status?: Doc['status'];
  userId?: string | { toString(): string } | null;
  ownerId?: string | { toString(): string } | null;
  teamId?: string | null;
  teamName?: string | null;
  createdAt: string | Date;
  updatedAt?: string | Date;
  currentVersion?: number;
  deletedAt?: Date | null;
  statusBeforeDelete?: Doc['status'];
  paymentRequest?: Doc['paymentRequest'];
  sharedWith?: Doc['sharedWith'];
  shareAccess?: Doc['shareAccess'];
  hasEditableContent?: boolean;
};
type DocumentsLoadState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  scopeKey: string | null;
};

const DOCUMENT_REFRESH_INTERVAL_MS = 60_000;
const DOCUMENT_CACHE_TTL_MS = 30_000;

function areDocumentListsEqual(current: Doc[], next: Doc[]) {
  if (current.length !== next.length) return false;

  const comparableDocument = (doc: Doc) => ({
    id: doc.id,
    documentId: doc.documentId,
    name: doc.name,
    status: doc.status,
    userId: doc.userId ? String(doc.userId) : null,
    ownerId: doc.ownerId ? String(doc.ownerId) : null,
    teamId: doc.teamId ?? null,
    teamName: doc.teamName ?? null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    currentVersion: doc.currentVersion ?? null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
    statusBeforeDelete: doc.statusBeforeDelete ?? null,
    paymentRequest: doc.paymentRequest ?? null,
    sharedWith: doc.sharedWith ?? [],
    shareAccess: doc.shareAccess ?? null,
    hasEditableContent: Boolean(doc.hasEditableContent),
  });

  return current.every(
    (document, index) =>
      JSON.stringify(comparableDocument(document)) ===
      JSON.stringify(comparableDocument(next[index]))
  );
}

function DashboardViewSkeleton() {
  return <div className="h-72 animate-pulse rounded-lg bg-white shadow-xs" role="status" aria-label="Loading view" />;
}

const dynamicView = (loader: () => Promise<{ default: ViewComponent }>) =>
  dynamic(loader, { loading: DashboardViewSkeleton });

const UploadZone = dynamic(() => import('@/components/UploadZone'), { loading: DashboardViewSkeleton });
const Contacts = dynamic(() => import('@/components/contacts/Contacts'), { loading: DashboardViewSkeleton });
const WorkspaceMembersPage = dynamic(() => import('@/app/account/workspace/members/page'), { loading: DashboardViewSkeleton });

const accountViewMap: Record<AccountSection, ViewComponent> = {
  profile: dynamicView(() => import('@/app/account/profile/page')),
  subscription: dynamicView(() => import('@/app/account/subscription/page')),
  settings: dynamicView(() => import('@/app/account/settings/page')),
  'signing-defaults': dynamicView(() => import('@/app/account/signingDefaults/page')),
  'payment-services': dynamicView(() => import('@/app/account/paymentServices/page')),
  notifications: dynamicView(() => import('@/app/account/notificationSettings/page')),
  integrations: dynamicView(() => import('@/app/account/integrations/page')),
  'cloud-storages': dynamicView(() => import('@/app/account/cloudStorage/page')),
  'my-teams': dynamicView(() => import('@/app/account/myTeams/page')),
  workspace: dynamicView(() => import('@/app/account/myWorkspaces/page')),
  'workspace-access': dynamicView(() => import('@/app/account/workspaceAccess/page')),
  'audit-trail': dynamicView(() => import('@/app/account/auditTrail/page')),
  'admin-governance': dynamicView(() => import('@/app/account/admin-governance/page')),
};

const documentViewMap: Partial<Record<SecondarySidebarType, ViewComponent>> = {
  'dash-documents': dynamicView(() => import('@/components/DocumentList')),
  'my-templates': dynamicView(() => import('@/app/templates/page')),
  'system-templates': dynamicView(() => import('@/app/templates/page')),
  trash: dynamicView(() => import('@/app/trash/page')),
};

// Keep config-supplied overrides available for embedders and isolated UI tests while
// production config remains metadata-only, so it does not pull every view into this chunk.
const applyConfiguredDocumentViews = (items: readonly DocumentConfigItem[]) => {
  items.forEach((item) => {
    const configuredComponent = (item as DocumentConfigItem & { component?: ViewComponent }).component;
    if (configuredComponent) documentViewMap[item.id] = configuredComponent;
    if (item.children) applyConfiguredDocumentViews(item.children);
  });
};
applyConfiguredDocumentViews(DOCUMENT_CONFIG);

const mapDocumentListItem = (doc: DocumentListItem): Doc => {
  const id = String(doc.id);

  return {
    id,
    documentId: id,
    name: doc.name ?? doc.originalFileName ?? 'Untitled',
    folder: '',
    status: doc.status ?? 'saved',
    userId: doc.userId ? String(doc.userId) : undefined,
    ownerId: doc.ownerId ? String(doc.ownerId) : undefined,
    teamId: doc.teamId ?? null,
    teamName: doc.teamName ?? null,
    createdAt: new Date(doc.createdAt),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : undefined,
    currentVersion: doc.currentVersion,
    file: undefined,
    url: `/api/documents/${id}`,
    fileUrl: `/api/documents/${id}`,
    deletedAt: doc.deletedAt,
    statusBeforeDelete: doc.statusBeforeDelete,
    paymentRequest: doc.paymentRequest ?? null,
    sharedWith: doc.sharedWith ?? [],
    shareAccess: doc.shareAccess ?? null,
    hasEditableContent: Boolean(doc.hasEditableContent),
  };
};

const accountSectionSet = new Set<AccountSection>(ACCOUNT_CONFIG.map((item) => item.id));
const documentSectionSet = new Set<SecondarySidebarType>([
  'dash-documents',
  'templates',
  'my-templates',
  'system-templates',
  'trash',
]);
const getAccountPathSegments = (pathname: string) => {
  const prefixes = [DASHBOARD_ACCOUNT_BASE, '/account'];
  for (const prefix of prefixes) {
    if (pathname.startsWith(prefix)) {
      const rest = pathname.slice(prefix.length);
      return rest.split('/').filter(Boolean);
    }
  }
  return null;
};

const deriveInitialSidebarState = (pathname: string, searchParams: ReturnType<typeof useSearchParams>) => {
  const match = SIDEBAR_ROUTE_MAP.find((r) => pathname.startsWith(r.match));
  const section = searchParams.get('section');
  const segments = getAccountPathSegments(pathname);
  const accountViewFromPath = getAccountSectionFromSegment(segments?.[0] ?? null);
  const accountViewFromParam = getAccountSectionFromSegment(searchParams.get('view'));
  const accountView = accountViewFromPath ?? accountViewFromParam;
  const isAccountView = Boolean(accountView && accountViewMap[accountView]);

  let sidebar: SidebarType = 'documents';
  if (match) {
    sidebar = match.sidebar;
  } else if (section === 'contacts') {
    sidebar = 'contacts';
  } else if (isAccountView) {
    sidebar = 'account';
  }

  let secondary: SecondarySidebarType = 'dash-documents';
  if (sidebar === 'account') {
    secondary = (accountView ?? 'profile') as SecondarySidebarType;
  }

  return { sidebar, secondary };
};

function DashboardDocumentsSkeleton() {
  const rows = Array.from({ length: 6 }, (_, index) => index);

  return (
    <div
      className="space-y-3"
      role="status"
      aria-label="Loading documents"
      aria-live="polite"
    >
      <span className="sr-only">Loading documents</span>
      <div className="flex min-h-14 flex-wrap items-center gap-3 rounded-lg bg-white px-4 py-3 shadow-xs">
        <div className="h-9 w-28 animate-pulse rounded-md bg-slate-200" />
        <div className="h-9 w-32 animate-pulse rounded-md bg-slate-200" />
        <div className="h-9 w-32 animate-pulse rounded-md bg-slate-200" />
        <div className="h-9 w-28 animate-pulse rounded-md bg-slate-200" />
        <div className="ml-auto h-9 w-9 animate-pulse rounded-md bg-slate-200" />
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row}
            className="flex min-h-16 items-center gap-3 rounded-lg bg-white px-4 py-2 shadow-xs"
          >
            <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-slate-200" />
            <div className="h-12 w-10 shrink-0 animate-pulse rounded bg-slate-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-2/5 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-28 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-8 w-24 animate-pulse rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardDocumentsErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto flex min-h-72 max-w-xl flex-col items-center justify-center rounded-lg bg-white px-6 py-10 text-center shadow-xs">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">Documents could not load</h2>
      <p className="mt-2 text-sm text-slate-600">
        Refresh the list to try again.
      </p>
      <Button
        type="button"
        className="mt-5"
        variant="outline"
        icon={<RefreshCw className="h-4 w-4" />}
        onClick={onRetry}
      >
        Retry
      </Button>
    </div>
  );
}
/* ------------------------------------------------------------------ */
/* component */
/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const { logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialState = deriveInitialSidebarState(pathname, searchParams);
  const {
    documents,
    setDocuments,
    isLoggedIn,
    user,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory
  } = useContextStore();
  const { status: subscriptionStatus, loading: subscriptionLoading } = useSubscriptionStatus({ enabled: isLoggedIn });
  const [activeSidebar, setActiveSidebar] = useState<SidebarType>(initialState.sidebar);
  const [activeSecondarybar, setActiveSecondarybar] = useState<SecondarySidebarType>(initialState.secondary);
  const [documentsLoadState, setDocumentsLoadState] = useState<DocumentsLoadState>({
    status: 'idle',
    scopeKey: null,
  });
  const accountPathSegments = useMemo(() => getAccountPathSegments(pathname), [pathname]);
  const accountPathSection = useMemo(
    () => getAccountSectionFromSegment(accountPathSegments?.[0] ?? null),
    [accountPathSegments]
  );
  const accountViewFromParam = useMemo(
    () => getAccountSectionFromSegment(searchParams.get('view')),
    [searchParams]
  );
  const resolvedAccountSection = useMemo(() => {
    if (accountPathSection) return accountPathSection;
    if (accountViewFromParam) return accountViewFromParam;
    if (accountSectionSet.has(activeSecondarybar as AccountSection)) {
      return activeSecondarybar as AccountSection;
    }
    return 'profile';
  }, [accountPathSection, accountViewFromParam, activeSecondarybar]);
  const resolvedSecondarybar =
    activeSidebar === 'account'
      ? (resolvedAccountSection as SecondarySidebarType)
      : activeSecondarybar;
  const isWorkspaceMembersView = accountPathSection === 'workspace' && accountPathSegments?.[1] === 'members';
  const documentScopeKey = isLoggedIn && user
    ? `${user.id ?? user.email}:${user.orgId ?? 'personal'}`
    : null;
  const documentsRef = React.useRef(documents);
  documentsRef.current = documents;
  const cachedDocumentsAt = documentScopeKey
    ? getDashboardDocumentsUpdatedAt(documentScopeKey)
    : undefined;
  const hasDocumentSnapshot = cachedDocumentsAt !== undefined;
  const refreshDocuments = useCallback(async (options: { signal?: AbortSignal; clearOnError?: boolean; showLoading?: boolean } = {}) => {
    if (!documentScopeKey) {
      setDocumentsLoadState((current) =>
        current.status === 'idle' && current.scopeKey === null
          ? current
          : { status: 'idle', scopeKey: null }
      );
      return;
    }

    if (options.showLoading) {
      setDocumentsLoadState((current) =>
        current.status === 'loading' && current.scopeKey === documentScopeKey
          ? current
          : { status: 'loading', scopeKey: documentScopeKey }
      );
    }

    try {
      const res = await fetch('/api/documents/list', {
        signal: options.signal,
        credentials: 'include',
      });

      if (res.status === 401) {
        setDocuments([]);
        setDocumentsLoadState({ status: 'idle', scopeKey: null });
        await logout();
        window.location.replace('/login');
        return;
      }

      if (!res.ok) throw new Error('Failed to fetch documents');

      const { success, documents = [] } = await res.json();
      if (!success || !Array.isArray(documents)) throw new Error('Invalid response');

      const nextDocuments = documents.map(mapDocumentListItem);
      if (!areDocumentListsEqual(documentsRef.current, nextDocuments)) {
        setDocuments(nextDocuments);
      }
      markDashboardDocumentsUpdated(documentScopeKey);
      setDocumentsLoadState((current) =>
        current.status === 'ready' && current.scopeKey === documentScopeKey
          ? current
          : { status: 'ready', scopeKey: documentScopeKey }
      );
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return;
      }

      console.error(e);
      if (options.clearOnError !== false) {
        setDocuments([]);
      }
      if (options.showLoading) {
        setDocumentsLoadState((current) =>
          current.status === 'error' && current.scopeKey === documentScopeKey
            ? current
            : { status: 'error', scopeKey: documentScopeKey }
        );
      }
    }
  }, [documentScopeKey, logout, setDocuments]);
  const retryDocuments = useCallback(() => {
    void refreshDocuments({
      clearOnError: true,
      showLoading: true,
    });
  }, [refreshDocuments]);

  /* ------------------------------------------------------------------ */
  /* effects */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    localStorage.removeItem('currentDocumentId');
    localStorage.removeItem('currentSessionId');
  }, []);

  useEffect(() => {
    const match = SIDEBAR_ROUTE_MAP.find((r) => pathname.startsWith(r.match));
    const section = searchParams.get('section');
    const accountView = accountPathSection ?? accountViewFromParam;
    const isAccountView = Boolean(accountView && accountViewMap[accountView]);

    if (match) {
      setActiveSidebar(match.sidebar);
    } else if (section === 'contacts') {
      setActiveSidebar('contacts');
    } else if (isAccountView) {
      setActiveSidebar('account');
    } else {
      setActiveSidebar('documents');
    }

    if (accountView) {
      setActiveSecondarybar(accountView as SecondarySidebarType);
    }
  }, [pathname, searchParams, accountPathSection, accountViewFromParam]);

  useEffect(() => {
    if (activeSidebar === 'account') {
      setActiveSecondarybar((prev) =>
        accountSectionSet.has(prev as AccountSection) ? prev : 'profile'
      );
      return;
    }
    if (activeSidebar === 'documents') {
      setActiveSecondarybar((prev) =>
        documentSectionSet.has(prev as SecondarySidebarType) ? prev : 'dash-documents'
      );
      return;
    }
  }, [activeSidebar]);

  useEffect(() => {
    if (!isLoggedIn || !user) return;
    if (user.orgId) return;
    if (activeSidebar !== 'account') {
      return;
    }
    if (accountPathSection && canAccessAccountSectionWithoutOrg(accountPathSection) && !isWorkspaceMembersView) {
      return;
    }

    router.replace(getDashboardAccountPath(NO_WORKSPACE_ACCOUNT_SECTION));
  }, [accountPathSection, activeSidebar, isLoggedIn, isWorkspaceMembersView, router, user]);

  useEffect(() => {
    if (!isLoggedIn || !user || user.orgId) return;
    if (activeSidebar === 'contacts') {
      setActiveSidebar('documents');
      setActiveSecondarybar('dash-documents');
    }
  }, [activeSecondarybar, activeSidebar, isLoggedIn, user]);

  useEffect(() => {
    if (!documentScopeKey || activeSidebar !== 'documents') {
      setDocumentsLoadState((current) =>
        current.status === 'idle' && current.scopeKey === null
          ? current
          : { status: 'idle', scopeKey: null }
      );
      return;
    }

    let controller: AbortController | null = null;

    const runRefresh = (options: { clearOnError?: boolean; showLoading?: boolean } = {}) => {
      controller?.abort();
      controller = new AbortController();
      void refreshDocuments({
        signal: controller.signal,
        clearOnError: options.clearOnError,
        showLoading: options.showLoading,
      });
    };

    const cacheIsFresh =
      hasDocumentSnapshot &&
      Date.now() - (cachedDocumentsAt ?? 0) < DOCUMENT_CACHE_TTL_MS;
    if (cacheIsFresh) {
      setDocumentsLoadState((current) =>
        current.status === 'ready' && current.scopeKey === documentScopeKey
          ? current
          : { status: 'ready', scopeKey: documentScopeKey }
      );
    } else {
      runRefresh({
        clearOnError: !hasDocumentSnapshot,
        showLoading: !hasDocumentSnapshot,
      });
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        runRefresh({ clearOnError: false });
      }
    }, DOCUMENT_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runRefresh({ clearOnError: false });
      }
    };

    const handleDocumentRefresh = () => {
      runRefresh({ clearOnError: false });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener(DASHBOARD_DOCUMENTS_REFRESH_EVENT, handleDocumentRefresh);

    return () => {
      controller?.abort();
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener(DASHBOARD_DOCUMENTS_REFRESH_EVENT, handleDocumentRefresh);
    };
  }, [activeSidebar, cachedDocumentsAt, documentScopeKey, hasDocumentSnapshot, refreshDocuments]);


  /* ------------------------------------------------------------------ */
  /* derived state */
  /* ------------------------------------------------------------------ */
  const activeDocuments = useMemo(
    () => documents.filter((doc) => !doc.deletedAt),
    [documents]
  );
  const isDocumentsRootView =
    activeSidebar === 'documents' &&
    activeSecondarybar === 'dash-documents';
  const documentDataReady =
    Boolean(documentScopeKey) &&
    ((documentsLoadState.status === 'ready' &&
      documentsLoadState.scopeKey === documentScopeKey) ||
      hasDocumentSnapshot);
  const documentDataError =
    Boolean(documentScopeKey) &&
    !hasDocumentSnapshot &&
    documentsLoadState.status === 'error' &&
    documentsLoadState.scopeKey === documentScopeKey;
  const showDocumentsLoading =
    isDocumentsRootView &&
    !documentDataReady &&
    !documentDataError;
  const showDocumentsLoadError =
    isDocumentsRootView &&
    documentDataError;
  const showUploadZone =
    isDocumentsRootView &&
    documentDataReady &&
    activeDocuments.length === 0;

  const isTemplateView = activeSecondarybar === 'my-templates' || activeSecondarybar === 'system-templates';
  const showTrialUpgrade =
    isLoggedIn &&
    !subscriptionLoading &&
    subscriptionStatus.workspaceTier === 'trial';
  const showAccountTrialHeader = activeSidebar === 'account' && showTrialUpgrade;
  const accountChromeBorderClass = activeSidebar === 'account' ? 'border-state-300' : 'border-slate-300';

  /* ------------------------------------------------------------------ */
  /* render */
  /* ------------------------------------------------------------------ */

  return (
    <div className="flex h-screen w-full">
      {/* Sidebar */}
      <DashboardSidebarShell
        activeSidebar={activeSidebar}
        setActiveSidebar={setActiveSidebar}
        activeSecondarybar={resolvedSecondarybar}
        setActiveSecondarybar={setActiveSecondarybar}
      />
      <div className="w-full bg-gray-200">
        <header className={`flex items-center justify-end border-b gap-4 px-4 h-14 w-full bg-white ${accountChromeBorderClass}`}>
          {showAccountTrialHeader ? (
            <p className="text-xs ">
              We hope you&apos;re enjoying your free trial. Improve your workflows by selecting a plan
              that best suits your needs.
            </p>
          ) : isTemplateView ? (  
            <TemplateSearch
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
            />
          ) : (
            <SearchInput
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              placeholder={
                activeSidebar === 'contacts'
                  ? 'Search contacts...'
                  : 'Search documents and forms'
              }
            />
          )}
          <DashboardHeader
            showTrialUpgrade={showTrialUpgrade}
            showTrialOnly={showAccountTrialHeader}
            trialEndsAt={subscriptionStatus.organization?.trialEndsAt ?? null}
            workspaceName={subscriptionStatus.organization?.name ?? null}
          />
        </header>
        <div
          className="h-[calc(100vh-56px)] overflow-auto p-12"
        >
          {showDocumentsLoading ? (
            <DashboardDocumentsSkeleton />
          ) : showDocumentsLoadError ? (
            <DashboardDocumentsErrorState onRetry={retryDocuments} />
          ) : showUploadZone ? (
            <UploadZone />
          ) : (
            <>
              {activeSidebar === 'documents' && (() => {
                const DocumentComponent = documentViewMap[activeSecondarybar];
                return DocumentComponent ? (
                  <DocumentComponent
                    searchQuery={searchQuery}
                    selectedCategory={selectedCategory}
                    setSelectedCategory={setSelectedCategory}
                    initialViewMode={
                      activeSecondarybar === 'my-templates'
                        ? 'my'
                        : activeSecondarybar === 'system-templates'
                          ? 'system'
                          : undefined
                    }
                  />
                ) : null;
              })()}
              {activeSidebar === 'contacts' && <Contacts searchQuery={searchQuery} />}
              {activeSidebar === 'account' && (
                <div className="account-theme">
                  {(() => {
                    if (isWorkspaceMembersView) {
                      return <WorkspaceMembersPage />;
                    }
                    const AccountComponent = accountViewMap[resolvedAccountSection];
                    return AccountComponent ? <AccountComponent /> : null;
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
