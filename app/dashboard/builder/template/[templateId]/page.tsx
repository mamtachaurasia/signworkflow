import { redirect } from 'next/navigation';

import TemplateBuilderPage from '@/app/builder/template/[templateId]/page';
import {
  buildTemplateBuilderHref,
  createSearchParamsFromRecord,
  parseTemplateNavigationContext,
  resolveTemplateNavigationContext,
  type RouteSearchParams,
  type TemplateNavigationWorkspace,
} from '@/lib/template-navigation';

interface Props {
  params: Promise<{ templateId: string }>;
  searchParams?: Promise<RouteSearchParams>;
}

const resolveWorkspace = (value: string | null): TemplateNavigationWorkspace => {
  if (value === 'readiness') return 'review';
  if (value === 'content' || value === 'fields' || value === 'review' || value === 'settings') {
    return value;
  }
  return 'content';
};

export default async function DashboardTemplateBuilderPage(props: Props) {
  const query = createSearchParamsFromRecord(props.searchParams ? await props.searchParams : undefined);
  if (!parseTemplateNavigationContext(query)) {
    const { templateId } = await props.params;
    const view = query.get('view') === 'system' ? 'system' : 'my';
    const context = resolveTemplateNavigationContext(null, { origin: 'dashboard', view });
    redirect(buildTemplateBuilderHref(templateId, resolveWorkspace(query.get('workspace')), context));
  }

  return TemplateBuilderPage(props);
}
