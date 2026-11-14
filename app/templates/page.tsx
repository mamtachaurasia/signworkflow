'use client';

import TemplateSearch from "@/components/templates/TemplateSearch";
import TemplatesLibraryHero from "@/components/templates/TemplatesLibraryHero";
import { Templates  } from "@/components/templates/Templates";
import useContextStore from "@/hooks/useContextStore";
import { useTemplates } from "@/hooks/useTemplates";
import { usePathname } from 'next/navigation';
import { Suspense, useState } from 'react';
import { TEMPLATE_CATEGORIES } from '@/config/template-categories';
import type { TemplateJurisdiction } from '@/config/template-jurisdictions';

export default function TemplatesPage() {
    const pathname = usePathname();
    const {searchQuery, setSearchQuery, selectedCategory, setSelectedCategory} = useContextStore();
    const {
        templates,
        loading,
        error,
        fetchTemplates,
        duplicateTemplate,
        createDocumentFromTemplate,
        trashTemplate,
    } = useTemplates();
    const isPublicLibrary = pathname === '/templates';
    const [selectedJurisdiction, setSelectedJurisdiction] = useState<TemplateJurisdiction | null>(null);
    const availableSystemTemplates = templates.filter(
        (template) => template.isSystemTemplate && template.isActive !== false && !template.deletedAt
    ).length;

    return (
        <Suspense fallback={<div>Loading templates...</div>}>
            <div className={isPublicLibrary ? 'pb-24' : ''}>
              {isPublicLibrary && (
                <>
                  <TemplatesLibraryHero />

                  <section id="professional-document-templates" className="scroll-mt-20 px-4 pt-10 sm:px-6 lg:px-8">
                    <div className="mx-auto max-w-7xl">
                      <div className="mx-auto max-w-3xl text-center">
                        <h2 className="text-3xl font-bold tracking-tight text-slate-950">Professional document templates</h2>
                        <p className="mt-2 text-slate-600">
                          Find a practical starting point for HR, legal, sales, finance, and everyday business workflows.
                        </p>
                        {!loading && availableSystemTemplates > 0 && (
                          <p className="mt-2 text-sm font-medium text-brand-700">
                            {availableSystemTemplates} templates available
                          </p>
                        )}
                      </div>

                      <div className="mx-auto mt-8 max-w-3xl">
                        <TemplateSearch
                          searchQuery={searchQuery}
                          setSearchQuery={setSearchQuery}
                          selectedCategory={selectedCategory}
                          setSelectedCategory={setSelectedCategory}
                          selectedJurisdiction={selectedJurisdiction}
                          setSelectedJurisdiction={setSelectedJurisdiction}
                          className="w-full!"
                        />
                      </div>

                      <div className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Template categories">
                        <button
                          type="button"
                          onClick={() => setSelectedCategory(null)}
                          className={`rounded-full border px-4 py-2 text-sm font-medium transition ${selectedCategory === null ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700'}`}
                        >
                          All templates
                        </button>
                        {TEMPLATE_CATEGORIES.map((category) => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => setSelectedCategory(category)}
                            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${selectedCategory === category ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700'}`}
                          >
                            {category}
                          </button>
                        ))}
                      </div>

                      <div className="mt-12">
                        <Templates
                          initialViewMode="system"
                          templates={templates}
                          loading={loading}
                          error={error}
                          fetchTemplates={fetchTemplates}
                          duplicateTemplate={duplicateTemplate}
                          searchQuery={searchQuery}
                          selectedCategory={selectedCategory}
                          selectedJurisdiction={selectedJurisdiction}
                          trashTemplate={trashTemplate}
                          createDocumentFromTemplate={createDocumentFromTemplate}
                        />
                      </div>
                    </div>
                  </section>
                </>
              )}

              {!isPublicLibrary && <Templates
                initialViewMode="all"
                templates={templates}
                loading={loading}
                error={error}
                fetchTemplates={fetchTemplates}
                duplicateTemplate={duplicateTemplate}
                searchQuery={searchQuery}
                selectedCategory={selectedCategory}
                trashTemplate={trashTemplate}
                createDocumentFromTemplate={createDocumentFromTemplate}
              />}
          </div>
        </Suspense>
    );
}
