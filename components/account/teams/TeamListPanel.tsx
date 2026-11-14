'use client';

import { TeamEntry } from './types';

type TeamListPanelProps = {
  teams: TeamEntry[];
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string) => void;
};

export default function TeamListPanel({
  teams,
  selectedTeamId,
  onSelectTeam,
}: TeamListPanelProps) {
  return (
    <div className="bg-white border rounded-lg shadow-xs p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Teams</h3>
        <span className="text-xs text-slate-500">{teams.length}</span>
      </div>
      {teams.length === 0 ? (
        <p className="text-sm text-slate-500">No teams yet.</p>
      ) : (
        <div className="space-y-2">
          {teams.map((team) => (
            <button
              key={team.id}
              className={`w-full text-left rounded-md border px-3 py-2 transition ${
                selectedTeamId === team.id
                  ? 'border-brand-500 bg-brand-50 text-brand-900'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
              onClick={() => onSelectTeam(team.id)}
            >
              <div className="text-sm font-semibold">{team.name}</div>
              <div className="text-xs text-slate-500 truncate">
                {team.description || 'No description'}
              </div>
              <div className="text-xs text-slate-400 mt-1">Members: {team.memberCount}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
