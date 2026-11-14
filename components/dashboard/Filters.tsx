"use client";
import { RefreshCcw, ArrowUpDown, Download, Share2, Trash2 } from "lucide-react";
import StatusDropdown from "./StatusDropdown";
import { Button } from '@ui';
import { Select } from '@ui';

type FiltersProps = {
  selectedStatus: string | null;
  setSelectedStatus: (s: string | null) => void;
  selectedTeamId: string;
  setSelectedTeamId: (teamId: string) => void;
  teams: Array<{ id: string; name: string }>;
  selectedType: string;
  setSelectedType: (t: string) => void;
  selectedTime: string;
  setSelectedTime: (t: string) => void;
  selectedOwner: string;
  setSelectedOwner: (o: string) => void;
  sortBy: string;
  setSortBy: (s: string) => void
  toggleSelectAll:()=>void;
  selectedIds: string[];
  visibleDocumentIds: string[];
  bulkDelete:(s: boolean) => void
  onBulkDownload: () => void;
  onBulkShare: () => void;
  onRefresh: () => void;
  onToggleSortDirection: () => void;
  isSortAscending: boolean;
};

export default function Filters({
  selectedStatus,
  setSelectedStatus,
  selectedTeamId,
  setSelectedTeamId,
  teams,
  selectedType,
  setSelectedType,
  selectedTime,
  setSelectedTime,
  selectedOwner,
  setSelectedOwner,
  sortBy,
  setSortBy,
  toggleSelectAll,
  selectedIds,
  visibleDocumentIds,
  bulkDelete,
  onBulkDownload,
  onBulkShare,
  onRefresh,
  onToggleSortDirection,
  isSortAscending,
}: FiltersProps) {
  const isAllSelected =
    visibleDocumentIds.length > 0 &&
    visibleDocumentIds.every((id) => selectedIds.includes(id));
  return (
    <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2">
        <input
          type="checkbox"
          className="w-4 h-4 border-gray-300 rounded-sm"
          aria-label="Select all"
          checked={isAllSelected}
          onChange={toggleSelectAll}
        />
        {/* Toolbar - appears when something is selected */}
           {selectedIds.length > 0 && (
           <>
               <span className="font-medium">{selectedIds.length} selected</span>
               <Button size="sm" icon={<Download size={16} />} label="Download" inverted onClick={onBulkDownload} />
               <Button size="sm" icon={<Share2 size={16} />} label="Share" inverted onClick={onBulkShare}/>
               <Button size="sm" icon={<Trash2 size={16} />} label="Delete" inverted  onClick={() => bulkDelete(true)} className="text-red-600 hover:bg-red-50"/>
            </>
           )} 
      {!selectedIds.length && (
       <>
        <StatusDropdown
          selectedStatus={selectedStatus}
          setSelectedStatus={setSelectedStatus}
        />

        <Select
          className="border border-gray-300 rounded-md px-2 py-1 text-sm"
          value={selectedTeamId}
          onChange={(e) => setSelectedTeamId(e.target.value)}
        >
          <option value="all">All Teams</option>
          <option value="unassigned">Unassigned</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </Select>

        <Select
          className="border border-gray-300 rounded-md px-2 py-1 text-sm"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
        >
          <option value="all">All Types</option>
          <option value="docs">Docs</option>        
        </Select>

        <Select
          className="border border-gray-300 rounded-md px-2 py-1 text-sm"
          value={selectedTime}
          onChange={(e) => setSelectedTime(e.target.value)}
        >
          <option value="all">All Time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </Select>

        <Select
          className="border border-gray-300 rounded-md px-2 py-1 text-sm"
          value={selectedOwner}
          onChange={(e) => setSelectedOwner(e.target.value)}
        >
          <option value="all">All Owners</option>
          <option value="me">Me</option>
          <option value="team">Team</option>
        </Select>

      {/* Right: Actions */}
      <div className="ml-auto flex items-center gap-2">
        <button className="p-2 rounded-sm hover:bg-gray-100" onClick={onRefresh} title="Refresh list">
          <RefreshCcw className="w-4 h-4 text-gray-600" />
        </button>

        <button className="p-2 rounded-sm hover:bg-gray-100" onClick={onToggleSortDirection} title={isSortAscending ? 'Sort descending' : 'Sort ascending'}>
          <ArrowUpDown className="w-4 h-4 text-gray-600" />
        </button>

        <Select
          className="border border-gray-300 rounded-md px-2 py-1 text-sm"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="recent">Recent</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name</option>
        </Select>
      </div>
        </>
      )}
    </div>
  );
}
