import { getLocalIsoDate, normalizeDateFormat } from '@/lib/date-formats';
import { describe, it, expect } from 'vitest';

describe('normalizeDateFormat', () => {
    it('returns default when undefined', () => {
        expect(normalizeDateFormat()).toBe('DD/MM/YYYY');
    });

    it('strips parenthetical notes', () => {
        expect(normalizeDateFormat('MM/DD/YYYY (US)')).toBe('MM/DD/YYYY');
        expect(normalizeDateFormat('YYYY-MM-DD (ISO)')).toBe('YYYY-MM-DD');
    });

    it('converts two-digit year tokens to four-digit', () => {
        expect(normalizeDateFormat('MM/DD/YY')).toBe('MM/DD/YYYY');
        expect(normalizeDateFormat('YY-MM-DD')).toBe('YYYY-MM-DD');
        // mixed tokens
        expect(normalizeDateFormat('DD/MM/YY (EU)')).toBe('DD/MM/YYYY');
    });

    it('leaves already-correct formats intact', () => {
        expect(normalizeDateFormat('DD/MM/YYYY (EU)')).toBe('DD/MM/YYYY');
    });

    it('builds local ISO dates without shifting through UTC', () => {
        expect(getLocalIsoDate(new Date(2026, 2, 22, 1, 30, 0))).toBe('2026-03-22');
    });
});
