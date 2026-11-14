export type AuditVerificationResult = {
  ok: boolean;
  complete: boolean;
  checked: number;
  partialChains: number;
  unverifiable: number;
  mismatchCount: number;
  mismatches: Array<{ id: string; reason: string; expected?: string; actual?: string }>;
  hasMore?: boolean;
  nextCursor?: string | null;
  message?: string;
};

// A page can pass its integrity checks while the overall verification is still
// incomplete. Accumulate every page before allowing the UI to say Verified.
export async function verifyAuditChains(
  query: string,
  onProgress: (result: AuditVerificationResult) => void
): Promise<AuditVerificationResult> {
  let result: AuditVerificationResult = {
    ok: true, complete: false, checked: 0, partialChains: 0,
    unverifiable: 0, mismatchCount: 0, mismatches: [],
  };
  const params = new URLSearchParams(query);
  params.delete('cursor');
  const seenCursors = new Set<string>();
  try {
    for (let page = 0; page < 1000; page += 1) {
      const response = await fetch(`/api/admin/audit/verify?${params}`, { credentials: 'include' });
      const payload = await response.json() as AuditVerificationResult;
      if (!response.ok) throw new Error(payload.message || 'Verification failed');
      if (typeof payload.ok !== 'boolean' || !Number.isInteger(payload.checked) || payload.checked < 0 ||
        typeof payload.hasMore !== 'boolean' || !Number.isInteger(payload.partialChains)) {
        throw new Error('The server returned an incomplete verification result.');
      }
      result = {
        ok: result.ok && payload.ok,
        complete: false,
        checked: result.checked + payload.checked,
        partialChains: result.partialChains + payload.partialChains,
        unverifiable: result.unverifiable + (payload.unverifiable || 0),
        mismatchCount: result.mismatchCount + (payload.mismatchCount ?? payload.mismatches?.length ?? 0),
        mismatches: [...result.mismatches, ...(payload.mismatches || [])].slice(0, 50),
        hasMore: payload.hasMore,
      };
      if (!payload.hasMore) {
        result.complete = result.partialChains === 0 && result.unverifiable === 0;
        return result;
      }
      onProgress(result);
      if (!payload.nextCursor || seenCursors.has(payload.nextCursor)) {
        throw new Error('Verification stopped because the next page is unavailable.');
      }
      seenCursors.add(payload.nextCursor);
      params.set('cursor', payload.nextCursor);
    }
    throw new Error('Verification reached the page limit. Narrow the filters and try again.');
  } catch (error) {
    return {
      ...result,
      complete: false,
      message: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}
