'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { useDashboardSidebar } from '@/hooks/useDashboardSidebar';
import useContextStore from '@/hooks/useContextStore';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { DEFAULT_WORKSPACE_SETTINGS } from '@/lib/workspace-settings';
import { SecondarySidebarType, SidebarType } from '@/types/types';

import { PrimarySidebar, SecondarySidebar } from './Sidebar';

import Brand from '../Brand';
import { cn } from '@/lib/utils';

type DashboardSidebarShellProps = {
  activeSidebar: SidebarType;
  setActiveSidebar: (s: SidebarType) => void;
  activeSecondarybar: SecondarySidebarType;
  setActiveSecondarybar: (s: SecondarySidebarType) => void;
};

export default function DashboardSidebarShell({
  activeSidebar,
  setActiveSidebar,
  activeSecondarybar,
  setActiveSecondarybar,
}: DashboardSidebarShellProps) {
  const { user } = useContextStore();
  const { settings, workspaceName } = useWorkspaceSettings({
    enabled: Boolean(user?.orgId),
    orgId: user?.orgId ?? null,
  });
  const {
    isSecondaryCollapsed,
    handleToggleChange,
  } = useDashboardSidebar();
  const brandColor = settings.branding.primaryColor || DEFAULT_WORKSPACE_SETTINGS.branding.primaryColor;
  const hasCustomBrandName = Boolean(settings.branding.brandName.trim());
  const hasCustomBrandColor = brandColor !== DEFAULT_WORKSPACE_SETTINGS.branding.primaryColor;
  const accountBorderClass = activeSidebar === 'account' ? 'border-state-300' : 'border-slate-300';
  const secondaryFloatingCSS = `absolute left-16 top-0 z-20 h-full w-64 border-r ${accountBorderClass} bg-white shadow-lg opacity-0 pointer-events-none -translate-x-2 transition-[opacity,transform] duration-200`;

  return (
    <>
      <input
        id="secondary-sidebar-toggle"
        type="checkbox"
        className="peer sr-only"
        checked={isSecondaryCollapsed}
        onChange={(e) => handleToggleChange(e.target.checked)}
      />
      <aside
        className={cn("h-full w-80 border-r sidebar", accountBorderClass)}
      >
        <div className={`relative h-14 pt-0.5 border-b ${accountBorderClass}`}>
          <div className="logo-title min-w-16 px-3">
            {hasCustomBrandName ? (
              <>
                <h1 className="truncate text-xl font-semibold" style={{ color: brandColor }}>
                  {settings.branding.brandName}
                </h1>
                {workspaceName && workspaceName !== settings.branding.brandName ? (
                  <p className="truncate text-xs text-slate-500">{workspaceName}</p>
                ) : null}
              </>
            ) : (
              <Brand color={hasCustomBrandColor ? brandColor : undefined} />
            )}
          </div>
          <label
            htmlFor="secondary-sidebar-toggle"
            className={`absolute left-full top-4 ml-2 h-6 w-6 flex cursor-pointer items-center justify-center hover:bg-brand-50 ${isSecondaryCollapsed ? 'toggle-open' : 'toggle-close'}`}
            aria-label={isSecondaryCollapsed ? 'Hide secondary panel' : 'Show secondary panel'}
            title={isSecondaryCollapsed ? 'Hide secondary panel' : 'Show secondary panel'}
            style={hasCustomBrandColor ? { color: brandColor } : undefined}
          >
            {isSecondaryCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </label>
        </div>
        <div className="relative flex h-[calc(100vh-56px)]">
          <PrimarySidebar
            active={activeSidebar}
            setActive={setActiveSidebar}
          />
          {isSecondaryCollapsed ? (
            <>
              <SecondarySidebar
                active="documents"
                activeSecondarybar={activeSecondarybar}
                secondaryActive={setActiveSecondarybar}
                className={`collapsed-panel-documents ${secondaryFloatingCSS}`}
              />
              <SecondarySidebar
                active="contacts"
                activeSecondarybar={activeSecondarybar}
                secondaryActive={setActiveSecondarybar}
                className={`collapsed-panel-contacts ${secondaryFloatingCSS}`}
              />
              <SecondarySidebar
                active="account"
                activeSecondarybar={activeSecondarybar}
                secondaryActive={setActiveSecondarybar}
                className={`collapsed-panel-account ${secondaryFloatingCSS}`}
              />
            </>
          ) : (
            <div className="secondary-panel w-64 shrink-0 transition-[width,opacity] duration-300 ease-in-out">
              <SecondarySidebar
                active={activeSidebar}
                activeSecondarybar={activeSecondarybar}
                secondaryActive={setActiveSecondarybar}
              />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
