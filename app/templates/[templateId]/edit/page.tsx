import { redirect } from 'next/navigation';

import {
  buildTemplateBuilderHref,
  createSearchParamsFromRecord,
  resolveTemplateNavigationContext,
  type RouteSearchParams,
} from '@/lib/template-navigation';

interface Props {
  params: Promise<{ templateId: string }>;
  searchParams?: Promise<RouteSearchParams>;
}

export default async function EditableTemplatePage({ params, searchParams }: Props) {
  const { templateId } = await params;
  const query = createSearchParamsFromRecord(searchParams ? await searchParams : undefined);
  const rawView = query.get('view');
  const navigationContext = resolveTemplateNavigationContext(query, {
    origin: 'templates',
    view: rawView === 'system' || rawView === 'all' ? rawView : 'my',
  });
  redirect(buildTemplateBuilderHref(templateId, 'content', navigationContext));
}
