'use client';

import React, { useMemo, useState } from 'react';
import { Check, Copy, Search, X } from 'lucide-react';

import DropdownPortal from '@/components/DropdownPortal';
import { Modal } from '@ui';
import type { DroppedComponent } from '@/types/types';

type RepeatMode = 'all' | 'odd' | 'even' | 'custom';

interface RepeatFieldDialogProps {
  open: boolean;
  field: DroppedComponent;
  pageCount: number;
  coveredPageNumbers: number[];
  onClose: () => void;
  onConfirm: (pageNumbers: number[]) => void;
}

const toPageNumbers = (pageCount: number): number[] =>
  Array.from({ length: Math.max(0, Math.floor(pageCount)) }, (_, index) => index + 1);

const modeOptions: Array<{ value: RepeatMode; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'odd', label: 'Odd' },
  { value: 'even', label: 'Even' },
  { value: 'custom', label: 'Custom' },
];

const RepeatFieldDialog: React.FC<RepeatFieldDialogProps> = ({
  open,
  field,
  pageCount,
  coveredPageNumbers,
  onClose,
  onConfirm,
}) => {
  const sourcePageNumber = field.pageNumber ?? 1;
  const allPageNumbers = useMemo(() => toPageNumbers(pageCount), [pageCount]);
  const coveredPageSet = useMemo(() => new Set(coveredPageNumbers), [coveredPageNumbers]);
  const repeatablePageNumbers = useMemo(
    () =>
      allPageNumbers.filter(
        (pageNumber) => pageNumber !== sourcePageNumber && !coveredPageSet.has(pageNumber)
      ),
    [allPageNumbers, coveredPageSet, sourcePageNumber]
  );
  const repeatablePageSet = useMemo(() => new Set(repeatablePageNumbers), [repeatablePageNumbers]);
  const [mode, setMode] = useState<RepeatMode>('all');
  const [customPageNumbers, setCustomPageNumbers] = useState<number[]>([]);
  const [pageSearchQuery, setPageSearchQuery] = useState('');
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const customPageSet = useMemo(() => new Set(customPageNumbers), [customPageNumbers]);
  const filteredPageNumbers = useMemo(() => {
    const query = pageSearchQuery.trim().toLowerCase();
    if (!query) return repeatablePageNumbers;

    return repeatablePageNumbers.filter((pageNumber) => {
      const pageLabel = `page ${pageNumber}`;
      return pageLabel.includes(query) || String(pageNumber).includes(query);
    });
  }, [pageSearchQuery, repeatablePageNumbers]);

  const targetPageNumbers = useMemo(() => {
    switch (mode) {
    case 'odd':
      return repeatablePageNumbers.filter((pageNumber) => pageNumber % 2 === 1);
    case 'even':
      return repeatablePageNumbers.filter((pageNumber) => pageNumber % 2 === 0);
    case 'custom':
      return customPageNumbers.filter((pageNumber) => repeatablePageSet.has(pageNumber));
    case 'all':
    default:
      return repeatablePageNumbers;
    }
  }, [customPageNumbers, mode, repeatablePageNumbers, repeatablePageSet]);
  const targetCount = targetPageNumbers.length;
  const confirmLabel = targetCount === 1 ? 'Repeat on 1 page' : `Repeat on ${targetCount} pages`;
  const coveredCount = allPageNumbers.filter(
    (pageNumber) => pageNumber !== sourcePageNumber && coveredPageSet.has(pageNumber)
  ).length;
  const customPickerDisabled = mode !== 'custom' || repeatablePageNumbers.length === 0;
  const customPickerPlaceholder =
    mode === 'custom'
      ? customPageNumbers.length > 0
        ? 'Add another page'
        : 'Search pages'
      : 'Custom pages disabled';

  const setRepeatMode = (nextMode: RepeatMode) => {
    setMode(nextMode);
    setCustomPickerOpen(nextMode === 'custom');
  };

  const toggleCustomPage = (pageNumber: number) => {
    if (!repeatablePageSet.has(pageNumber)) return;
    setCustomPageNumbers((current) =>
      current.includes(pageNumber)
        ? current.filter((candidate) => candidate !== pageNumber)
        : [...current, pageNumber].sort((left, right) => left - right)
    );
  };

  const handleConfirm = () => {
    if (targetCount === 0) return;
    onConfirm(targetPageNumbers);
    onClose();
  };

  const handleCustomSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setCustomPickerOpen(false);
      return;
    }

    if (event.key === 'Enter' && filteredPageNumbers.length === 1) {
      event.preventDefault();
      toggleCustomPage(filteredPageNumbers[0]);
      setPageSearchQuery('');
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      title="Repeat field"
      description={`${field.component} on page ${sourcePageNumber}`}
      className="w-[calc(100vw-2rem)] max-w-xl"
      confirmLabel={confirmLabel}
      confirmIcon={<Copy className="h-4 w-4" />}
      confirmDisabled={targetCount === 0}
      handleCancel={onClose}
      handleConfirm={handleConfirm}
      cancelLabel="Cancel"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-1 rounded-md bg-slate-100 p-1">
          {modeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRepeatMode(option.value)}
              className={`rounded-sm px-3 py-2 text-sm font-medium ${
                mode === option.value ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {repeatablePageNumbers.length > 0
            ? `${repeatablePageNumbers.length} ${repeatablePageNumbers.length === 1 ? 'page is' : 'pages are'} available.`
            : 'This field already covers every page.'}
          {coveredCount > 0 ? ` ${coveredCount} already ${coveredCount === 1 ? 'has' : 'have'} this field.` : ''}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-700" htmlFor="repeat-page-search">
            Custom pages
          </label>
          <div className="relative">
            <div
              id="repeat-page-search-trigger"
              className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md border px-3 py-2 ${
                customPickerDisabled
                  ? 'border-slate-200 bg-slate-100 text-slate-400'
                  : 'border-slate-300 bg-white focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-100'
              }`}
            >
              <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {customPageNumbers.map((pageNumber) => (
                  <span
                    key={pageNumber}
                    className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                      customPickerDisabled
                        ? 'border-slate-200 bg-slate-50 text-slate-400'
                        : 'border-brand-100 bg-brand-50 text-brand-700'
                    }`}
                  >
                    Page {pageNumber}
                    <button
                      type="button"
                      aria-label={`Remove page ${pageNumber}`}
                      disabled={customPickerDisabled}
                      onClick={() => toggleCustomPage(pageNumber)}
                      className="rounded-full text-current hover:bg-white/70 disabled:cursor-not-allowed"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </span>
                ))}
                <input
                  id="repeat-page-search"
                  role="combobox"
                  aria-expanded={customPickerOpen}
                  aria-controls="repeat-page-search-options"
                  aria-autocomplete="list"
                  aria-label="Search pages"
                  disabled={customPickerDisabled}
                  value={pageSearchQuery}
                  placeholder={customPickerPlaceholder}
                  onFocus={() => setCustomPickerOpen(true)}
                  onChange={(event) => {
                    setPageSearchQuery(event.target.value);
                    setCustomPickerOpen(true);
                  }}
                  onKeyDown={handleCustomSearchKeyDown}
                  className="min-w-30 flex-1 bg-transparent text-sm text-slate-900 outline-hidden placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
                />
              </div>
            </div>

            <DropdownPortal
              targetId="repeat-page-search-trigger"
              dropdown={mode === 'custom' && customPickerOpen && !customPickerDisabled ? 'repeat-page-search' : null}
              onClose={() => setCustomPickerOpen(false)}
            >
              <div
                id="repeat-page-search-options"
                role="listbox"
                aria-label="Repeat page options"
                className="mt-1 max-h-[var(--dropdown-portal-max-height)] overflow-y-auto overscroll-contain rounded-md border border-slate-200 bg-white p-1 shadow-lg"
              >
                {filteredPageNumbers.length > 0 ? (
                  filteredPageNumbers.map((pageNumber) => {
                    const isSelected = customPageSet.has(pageNumber);
                    return (
                      <button
                        key={pageNumber}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          toggleCustomPage(pageNumber);
                          setPageSearchQuery('');
                        }}
                        className={`flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm ${
                          isSelected
                            ? 'bg-brand-50 text-brand-700'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span>Page {pageNumber}</span>
                        {isSelected && <Check className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-2 text-sm text-slate-500">No matching pages</div>
                )}
              </div>
            </DropdownPortal>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default RepeatFieldDialog;
