import { NextRequest, NextResponse } from "next/server";
import { indexNowConfig } from '@/lib/indexnow/config';
import { submitUrls } from "@/lib/indexnow/service";

const MAX_URLS_PER_REQUEST = 100;

function parseUrls(value: unknown): string[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_URLS_PER_REQUEST) {
        throw new Error(`urls must contain between 1 and ${MAX_URLS_PER_REQUEST} entries`);
    }

    const expectedHost = new URL(indexNowConfig.host).hostname;
    return value.map((entry) => {
        if (typeof entry !== 'string') {
            throw new Error('Every IndexNow URL must be a string');
        }
        const url = new URL(entry);
        if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== expectedHost) {
            throw new Error(`IndexNow URLs must belong to ${expectedHost}`);
        }
        return url.toString();
    });
}

export async function POST(req: NextRequest) {
    try {
        const body: unknown = await req.json();
        const urls = parseUrls(
            body && typeof body === 'object' ? (body as { urls?: unknown }).urls : undefined
        );
        await submitUrls(urls);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'IndexNow submission failed';
        const status = error instanceof SyntaxError || message.startsWith('urls must') || message.startsWith('Every ') || message.startsWith('IndexNow URLs')
            ? 400
            : 502;
        return NextResponse.json({ success: false, error: message }, { status });
    }
}
