export const DATE_FORMAT_OPTIONS = ['MM/DD/YYYY (US)', 'DD/MM/YYYY (EU)', 'YYYY-MM-DD (ISO)'] as const;
export type DateFormatOption = (typeof DATE_FORMAT_OPTIONS)[number];

/**
 * Ensure year tokens always use four digits, preserving any parenthetical notes.
 */
export function ensureFourDigitYearFormat(raw?: string): string {
    if (!raw) return '';
    return raw.replace(/(^|[^Yy])([Yy]{2})($|[^Yy])/g, (_match, p1, _yy, p2) => `${p1}YYYY${p2}`);
}

/**
 * Convert a raw setting string into the format string used by the picker.
 * Strips any parenthetical note and ensures a four-digit year specifier.
 */
export function normalizeDateFormat(raw?: string): string {
    if (!raw) return 'DD/MM/YYYY';
    let fmt = raw.replace(/\s*\(.*?\)/, '').trim();
    fmt = ensureFourDigitYearFormat(fmt);
    fmt = fmt
        .replace(/yyyy/gi, 'YYYY')
        .replace(/mm/gi, 'MM')
        .replace(/dd/gi, 'DD');
    return fmt;
}

/**
 * Return a local-calendar ISO date string (YYYY-MM-DD) without converting through UTC.
 */
export function getLocalIsoDate(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Given an arbitrary date string (ISO, EU, US, mm-dd-yy shorthand), format it
 * according to the provided picker format (e.g. "DD/MM/YYYY"). Returns an
 * empty string if the input is unparseable/invalid.
 */
export function formatForPicker(val: string, fmt?: string): string {
    if (!fmt) return val;
    fmt = normalizeDateFormat(fmt);

    // borrow the logic used previously in FieldPropertyPanel
    let y: string | undefined;
    let m: string | undefined;
    let dd: string | undefined;

    const isoMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        y = isoMatch[1];
        m = isoMatch[2];
        dd = isoMatch[3];
    } else if (val.includes('/')) {
        const parts = val.split('/');
        if (parts.length === 3) {
            const [a, b, c] = parts;
            // When the target format is ISO (YYYY-MM-DD) we prefer to interpret
            // ambiguous slash-based dates as EU-style DD/MM/YYYY so that a
            // value like "10/12/2007" (commonly written as 10 December 2007 in
            // many locales) is preserved when normalizing to ISO.
            const treatAsEU = fmt.includes('DD/MM/YYYY') || fmt.includes('YYYY-MM-DD');
            if (treatAsEU) {
                dd = a;
                m = b;
                y = c.length === 2 ? `20${c}` : c;
            } else {
                m = a;
                dd = b;
                y = c.length === 2 ? `20${c}` : c;
            }
        } else {
            return '';
        }
    } else {
        const mdy = val.match(/^(\d{2})-(\d{2})-(\d{2})$/);
        if (mdy) {
            const mm = Number(mdy[1]);
            const ddn = Number(mdy[2]);
            const yy = mdy[3];
            const year = 2000 + Number(yy);
            const dtest = new Date(Date.UTC(year, mm - 1, ddn));
            if (dtest.getUTCMonth() + 1 !== mm || dtest.getUTCDate() !== ddn) {
                return '';
            }
            y = String(year);
            m = String(mm).padStart(2, '0');
            dd = String(ddn).padStart(2, '0');
        } else {
            return '';
        }
    }

    if (y === undefined || m === undefined || dd === undefined) {
        return '';
    }

    const yNum = Number(y);
    const mNum = Number(m);
    const ddNum = Number(dd);
    const dtest2 = new Date(Date.UTC(yNum, mNum - 1, ddNum));
    if (
        dtest2.getUTCFullYear() !== yNum ||
        dtest2.getUTCMonth() + 1 !== mNum ||
        dtest2.getUTCDate() !== ddNum
    ) {
        return '';
    }

    if (fmt.includes('DD/MM/YYYY')) return `${dd}/${m}/${y}`;
    if (fmt.includes('MM/DD/YYYY')) return `${m}/${dd}/${y}`;
    if (fmt.includes('YYYY-MM-DD')) return `${y}-${m}-${dd}`;
    return val;
}
