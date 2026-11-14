import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  Download,
  FileText,
  KeyRound,
  Webhook,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Developer API Reference',
  description: 'Build document-signing workflows with SignWorkflow API keys, document endpoints, and signed webhooks.',
  alternates: {
    canonical: '/developers/api',
  },
  openGraph: {
    title: 'SignWorkflow Developer API Reference',
    description: 'Build document-signing workflows with scoped API keys and signed webhooks.',
    url: '/developers/api',
    type: 'website',
  },
  twitter: {
    title: 'SignWorkflow Developer API Reference',
    description: 'Build document-signing workflows with scoped API keys and signed webhooks.',
  },
};

const workflow = [
  'Create a workspace API key with only the scopes your service needs.',
  'Upload a PDF, then prepare recipient fields before sending.',
  'Inspect document status and download the completed PDF.',
  'Receive signed lifecycle events at a configured webhook endpoint.',
];

const endpoints = [
  { method: 'GET', path: '/api/v1/documents', description: 'List documents in the API key’s workspace.' },
  { method: 'POST', path: '/api/v1/documents', description: 'Upload a Base64-encoded PDF and create a document draft.' },
  { method: 'GET', path: '/api/v1/documents/{documentId}', description: 'Retrieve document status and recipient-safe details.' },
  { method: 'PUT', path: '/api/v1/documents/{documentId}/prepare', description: 'Set the recipient fields for a draft PDF.' },
  { method: 'POST', path: '/api/v1/documents/{documentId}/send', description: 'Send a prepared document for signing.' },
  { method: 'POST', path: '/api/v1/documents/{documentId}/send/retry', description: 'Retry failed signing-request delivery.' },
  { method: 'GET', path: '/api/v1/documents/{documentId}/download', description: 'Download a completed document PDF.' },
];

const curlExample = `curl --request GET "https://signworkflow.com/api/v1/documents?page=1&limit=25" \\
  --header "X-API-Key: sw_live_your_secret"`;

export default function DeveloperApiReferencePage() {
  return (
    <main className="bg-slate-50 pb-20 pt-28 sm:pt-32">
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-3xl bg-slate-950 px-6 py-12 text-white shadow-xl sm:px-10 sm:py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-300">Developer platform</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Build signing workflows with the SignWorkflow API
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            Create documents, prepare fields, send signing requests, monitor status, download completed PDFs,
            and receive signed lifecycle events using workspace-scoped credentials.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/account/integrations"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
            >
              Manage API keys <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="/api/v1/openapi"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/25 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <Download className="h-4 w-4" /> Download OpenAPI JSON
            </a>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm leading-6 text-sky-950">
          <div className="flex gap-3">
            <Code2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
            <p>
              This page is the human-readable reference. The <a className="font-semibold underline underline-offset-2" href="/api/v1/openapi" target="_blank" rel="noreferrer">OpenAPI JSON</a>{' '}
              is the machine-readable contract for API tools, generated clients, and import into Postman or Swagger UI.
            </p>
          </div>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
          <div className="space-y-12">
            <section aria-labelledby="quick-start">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-700">Quick start</p>
              <h2 id="quick-start" className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">From API key to completed PDF</h2>
              <ol className="mt-6 space-y-4">
                {workflow.map((step, index) => (
                  <li key={step} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">{index + 1}</span>
                    <p className="pt-0.5 text-sm leading-6 text-slate-700">{step}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby="authentication">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-700">Authentication</p>
              <h2 id="authentication" className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Use a scoped workspace API key</h2>
              <p className="mt-4 text-sm leading-7 text-slate-700">
                Workspace administrators create API keys in <Link className="font-semibold text-brand-700 hover:underline" href="/account/integrations">Developer integrations</Link>.
                {' '}Use <code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-900">documents:read</code> for reading documents and downloads; add{' '}
                <code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-900">documents:write</code> only to create, prepare, send, or retry documents.
              </p>
              <pre className="mt-5 overflow-x-auto rounded-xl bg-slate-950 p-5 text-sm leading-6 text-slate-100"><code>{curlExample}</code></pre>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                You can also send the same key as a Bearer token. Keep it in a server-side secrets manager—never in browser code, mobile apps, logs, or source control.
              </p>
            </section>

            <section aria-labelledby="endpoints">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-700">API reference</p>
              <h2 id="endpoints" className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Supported document endpoints</h2>
              <div className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {endpoints.map((endpoint) => (
                  <article key={`${endpoint.method}-${endpoint.path}`} className="p-5 sm:flex sm:items-start sm:gap-5">
                    <span className="inline-flex min-w-14 justify-center rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-slate-700">{endpoint.method}</span>
                    <div className="mt-3 sm:mt-0">
                      <code className="break-all text-sm font-semibold text-slate-900">{endpoint.path}</code>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{endpoint.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <KeyRound className="h-6 w-6 text-brand-700" />
              <h2 className="mt-4 text-lg font-semibold text-slate-950">Credential controls</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Configure expiry, IP/CIDR allowlists, per-key rate limits, rotation reminders, and a bounded overlap during key rotation.
              </p>
              <Link href="/account/integrations" className="mt-4 inline-flex text-sm font-semibold text-brand-700 hover:underline">Manage credentials</Link>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <Webhook className="h-6 w-6 text-brand-700" />
              <h2 className="mt-4 text-lg font-semibold text-slate-950">Signed webhooks</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Configure HTTPS endpoints for document lifecycle events. Verify each delivery with the endpoint secret and keep receivers idempotent.
              </p>
              <Link href="/account/integrations" className="mt-4 inline-flex text-sm font-semibold text-brand-700 hover:underline">Configure webhooks</Link>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <FileText className="h-6 w-6 text-brand-700" />
              <h2 className="mt-4 text-lg font-semibold text-slate-950">Responses and errors</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />401: invalid or expired key</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />403: missing scope or write access</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />429: rate limited; honor <code>Retry-After</code></li>
              </ul>
              <a href="/api/v1/openapi" target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm font-semibold text-brand-700 hover:underline">View every response schema</a>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
