import { useMemo } from "react";
import { Doc } from "@/types/types";

type DocumentFilterInput = {
    selectedStatus: string | null;
    searchQuery: string;
    selectedTeamId?: string;
};

export function filterDocs(
    documents: Doc[],
    {
        selectedStatus,
        searchQuery,
        selectedTeamId = 'all',
    }: DocumentFilterInput
) {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return documents.filter((doc) => {
        const matchesStatus =
            selectedStatus === "all" ||
            !selectedStatus ||
            doc.status === selectedStatus;
        const matchesSearch =
            !normalizedSearch ||
            doc.name?.toLowerCase().includes(normalizedSearch);
        const matchesTeam =
            selectedTeamId === 'all' ||
            (selectedTeamId === 'unassigned'
                ? !doc.teamId
                : doc.teamId === selectedTeamId);

        return matchesStatus && matchesSearch && matchesTeam;
    });
}

export function useFilteredDocs(
    documents: Doc[],
    selectedStatus: string | null,
    searchQuery: string,
    selectedTeamId = 'all'
) {
    return useMemo(() => {
        return filterDocs(documents, {
            selectedStatus,
            searchQuery,
            selectedTeamId,
        });
    }, [documents, selectedStatus, searchQuery, selectedTeamId]);
}
