const documentRefreshTimes = new Map<string, number>();

export function getDashboardDocumentsUpdatedAt(scopeKey: string): number | undefined {
  return documentRefreshTimes.get(scopeKey);
}

export function markDashboardDocumentsUpdated(scopeKey: string, updatedAt = Date.now()): void {
  documentRefreshTimes.set(scopeKey, updatedAt);
}

export function clearDashboardDocumentCache(): void {
  documentRefreshTimes.clear();
}
