import { describe, expect, it } from 'vitest';

import { getPendingTemplateUseId } from '@/lib/template-use-guard';

describe('getPendingTemplateUseId', () => {
    it('returns the template id when a new use parameter is present', () => {
        const params = new URLSearchParams({ use: 'template-123' });

        expect(getPendingTemplateUseId({ searchParams: params, pendingUseTemplateId: null, lastConsumedUseId: null })).toBe('template-123');
    });

    it('does not re-trigger when the same use parameter is already being processed', () => {
        const params = new URLSearchParams({ use: 'template-123' });

        expect(getPendingTemplateUseId({ searchParams: params, pendingUseTemplateId: 'template-123', lastConsumedUseId: null })).toBeNull();
        expect(getPendingTemplateUseId({ searchParams: params, pendingUseTemplateId: null, lastConsumedUseId: 'template-123' })).toBeNull();
    });

    it('returns null when no use parameter is present', () => {
        const params = new URLSearchParams();

        expect(getPendingTemplateUseId({ searchParams: params, pendingUseTemplateId: null, lastConsumedUseId: null })).toBeNull();
    });
});
