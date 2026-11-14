export default function TemplatesLibraryHero() {
  return (
    <section className="relative overflow-hidden bg-[#f2f7ff] px-4 pb-8 pt-28 sm:px-6 lg:px-8 lg:pb-10 lg:pt-28">
      <div className="pointer-events-none absolute -right-24 top-20 h-72 w-72 rounded-full bg-brand-200/50 blur-3xl" />
      <div className="pointer-events-none absolute -left-28 bottom-0 h-60 w-60 rounded-full bg-sky-100 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-0 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="max-w-2xl text-center lg:text-left">
          <span className="mb-5 inline-flex rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold uppercase text-brand-700 shadow-xs">
            Free template library
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
            Free document templates for faster agreements
          </h1>
          <p className="mt-6 text-slate-600">
            Browse and preview professional business templates without an account. Sign in to create
            your own fully editable copy, then revise every clause, variable, and signer role.
          </p>
          <a
            href="#professional-document-templates"
            className="mt-8 inline-flex items-center justify-center rounded-md bg-brand-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
          >
            Browse templates
            <span className="ml-2" aria-hidden="true">↓</span>
          </a>
        </div>

        <div className="relative mx-auto hidden h-80 w-full max-w-lg lg:block" aria-hidden="true">
          <div className="absolute left-8 top-10 h-64 w-48 -rotate-6 rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="h-3 w-20 rounded-full bg-brand-700" />
            <div className="mt-7 space-y-3">
              <div className="h-2 rounded-full bg-slate-200" />
              <div className="h-2 w-4/5 rounded-full bg-slate-200" />
              <div className="h-2 rounded-full bg-slate-200" />
              <div className="mt-8 h-16 rounded-md bg-brand-50" />
            </div>
          </div>
          <div className="absolute right-8 top-2 h-72 w-52 rotate-6 rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 rounded-full bg-slate-900" />
              <div className="h-7 w-7 rounded-full bg-brand-100" />
            </div>
            <div className="mt-8 space-y-3">
              <div className="h-2 rounded-full bg-slate-200" />
              <div className="h-2 rounded-full bg-slate-200" />
              <div className="h-2 w-3/4 rounded-full bg-slate-200" />
            </div>
            <div className="mt-9 rounded-md border border-dashed border-brand-300 bg-brand-50 p-4">
              <div className="h-2 w-20 rounded-full bg-brand-300" />
              <div className="mt-4 h-8 rounded-sm bg-white" />
            </div>
            <div className="mt-3 h-9 rounded-md bg-brand-700" />
          </div>
        </div>
      </div>
    </section>
  );
}
