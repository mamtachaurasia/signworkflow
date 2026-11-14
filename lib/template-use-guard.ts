export function getPendingTemplateUseId(args: {
    searchParams: URLSearchParams | ReadonlyURLSearchParams | null | undefined;
    pendingUseTemplateId: string | null;
    lastConsumedUseId: string | null;
}): string | null {
    const useId = args.searchParams?.get?.('use');
    if (!useId) return null;
    if (args.pendingUseTemplateId === useId) return null;
    if (args.lastConsumedUseId === useId) return null;
    return useId;
}

export interface ReadonlyURLSearchParams {
    get(name: string): string | null;
}
