import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import TemplateBuilderShell from '@/components/templates/builder/TemplateBuilderShell';
import type { TemplateBuilderTemplate } from '@/components/templates/builder/template-builder-types';
import {
  buildTemplateBuilderHref,
  buildTemplateLoginHref,
  createSearchParamsFromRecord,
  getTemplateReturnHref,
  resolveTemplateNavigationContext,
  type RouteSearchParams,
  type TemplateNavigationWorkspace,
} from '@/lib/template-navigation';

interface Props {
  params: Promise<{ templateId: string }>;
  searchParams?: Promise<RouteSearchParams>;
}

function isValidObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value);
}

async function fetchTemplateData(templateId: string): Promise<{
  data: TemplateBuilderTemplate | null;
  status: number | null;
}> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) return { data: null, status: null };

  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.getAll().map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
    const response = await fetch(
      `${baseUrl}/api/templates/load?id=${encodeURIComponent(templateId)}`,
      {
        headers: { Cookie: cookieHeader },
        cache: 'no-store',
      }
    );

    if (!response.ok) return { data: null, status: response.status };
    const body = await response.json();
    if (!body?.success || !body.template) return { data: null, status: response.status };

    return {
      data: {
        ...body.template,
        _id: String(body.template._id || body.template.templateId || templateId),
        templateId: String(body.template.templateId || body.template._id || templateId),
        fields: Array.isArray(body.template.fields) ? body.template.fields : [],
        defaultSigners: Array.isArray(body.template.defaultSigners) ? body.template.defaultSigners : [],
      } as TemplateBuilderTemplate,
      status: response.status,
    };
  } catch (error) {
    console.error('Unable to preload template Builder data:', error);
    return { data: null, status: null };
  }
}

const resolveWorkspace = (value: string | null): TemplateNavigationWorkspace => {
  if (value === 'readiness') return 'review';
  if (value === 'content' || value === 'fields' || value === 'review' || value === 'settings') {
    return value;
  }
  return 'content';
};

export default async function TemplateBuilderPage({ params, searchParams }: Props) {
  const { templateId } = await params;
  if (!isValidObjectId(templateId)) notFound();
  const query = createSearchParamsFromRecord(searchParams ? await searchParams : undefined);

  const { data, status } = await fetchTemplateData(templateId);
  if (!data && status === 404) notFound();
  const navigationContext = resolveTemplateNavigationContext(query, {
    origin: 'templates',
    view: data?.isSystemTemplate ? 'system' : 'my',
  });
  if (!data && status === 401) {
    const nextHref = buildTemplateBuilderHref(
      templateId,
      resolveWorkspace(query.get('workspace')),
      navigationContext
    );
    redirect(buildTemplateLoginHref(nextHref));
  }
  if (!data && status === 403) redirect(getTemplateReturnHref(navigationContext));

  return <TemplateBuilderShell templateId={templateId} initialTemplate={data} />;
}
