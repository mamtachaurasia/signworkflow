
import { Search } from 'lucide-react';
import React from 'react';
import { Select } from '@ui';
import { Input } from '@ui';
import { TEMPLATE_CATEGORIES } from '@/config/template-categories';
import { TEMPLATE_JURISDICTIONS, type TemplateJurisdiction } from '@/config/template-jurisdictions';

interface TemplateSearchProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  className?:string;
  selectedJurisdiction?: TemplateJurisdiction | null;
  setSelectedJurisdiction?: (jurisdiction: TemplateJurisdiction | null) => void;
}

const TemplateSearch: React.FC<TemplateSearchProps> = ({
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  className,
  selectedJurisdiction,
  setSelectedJurisdiction,
}) => {
  return (
      <div className={`relative w-1/2 flex gap-2 ${className}`}>
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
         <Search className="h-5 w-5 text-gray-400" />
        </div>
        <Input
          type="text"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-hidden focus:placeholder-gray-400 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 sm:text-sm"
        />
      <Select
        value={selectedCategory || ''}
        onChange={(e) => setSelectedCategory(e.target.value || null)}
        className="px-4 border border-gray-300 rounded-md focus:outline-hidden focus:ring-1 focus:ring-brand-500 focus:border-brand-500 sm:text-sm whitespace-nowrap"
      >
        <option value="">All Categories</option>
        {TEMPLATE_CATEGORIES.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
      </Select>
      {setSelectedJurisdiction && (
        <Select
          value={selectedJurisdiction || ''}
          onChange={(e) => setSelectedJurisdiction((e.target.value || null) as TemplateJurisdiction | null)}
          className="px-4 border border-gray-300 rounded-md focus:outline-hidden focus:ring-1 focus:ring-brand-500 focus:border-brand-500 sm:text-sm whitespace-nowrap"
          aria-label="Filter by jurisdiction"
        >
          <option value="">All jurisdictions</option>
          {TEMPLATE_JURISDICTIONS.map((jurisdiction) => (
            <option key={jurisdiction} value={jurisdiction}>{jurisdiction}</option>
          ))}
        </Select>
      )}
    </div>
  );
};

export default TemplateSearch;
