"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useRef, useState } from "react";

interface PdfThumbnailProps {
  fileUrl: string;
  width?: number;
  height?: number;
  className?: string;
  cacheKey?: string;
}

type CachedThumbnail = {
  url: string;
};

const MAX_CACHED_THUMBNAILS = 80;
const FAILED_RENDER_RETRY_MS = 30_000;
const RENDER_FORMAT_VERSION = 2;
const thumbnailCache = new Map<string, CachedThumbnail>();
const thumbnailRequests = new Map<string, Promise<CachedThumbnail | null>>();
const failedRenderTimes = new Map<string, number>();
let reactPdfPromise: Promise<typeof import("react-pdf")> | null = null;

function getCachedThumbnail(key: string): CachedThumbnail | null {
  const cached = thumbnailCache.get(key);
  if (!cached) return null;

  // Refresh insertion order so the map behaves as a small LRU cache.
  thumbnailCache.delete(key);
  thumbnailCache.set(key, cached);
  return cached;
}

function cacheThumbnail(key: string, thumbnail: CachedThumbnail) {
  thumbnailCache.delete(key);
  thumbnailCache.set(key, thumbnail);

  while (thumbnailCache.size > MAX_CACHED_THUMBNAILS) {
    const oldestKey = thumbnailCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    thumbnailCache.delete(oldestKey);
  }
}

function canvasToThumbnail(canvas: HTMLCanvasElement): CachedThumbnail {
  // Data URLs remain valid for mounted images after an LRU eviction, unlike
  // revoked blob URLs. At thumbnail resolution they are also small enough for
  // a bounded session cache.
  return { url: canvas.toDataURL("image/webp", 0.82) };
}

async function renderThumbnail(fileUrl: string, width: number, height: number) {
  reactPdfPromise ??= import("react-pdf");
  const { pdfjs } = await reactPdfPromise;
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const absoluteUrl = new URL(fileUrl, window.location.origin).href;
  const loadingTask = pdfjs.getDocument({ url: absoluteUrl });
  const pdf = await loadingTask.promise;

  try {
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.max(
      0.1,
      (width * pixelRatio) / baseViewport.width,
      (height * pixelRatio) / baseViewport.height
    );
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return null;

    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));

    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return canvasToThumbnail(canvas);
  } finally {
    await pdf.destroy().catch(() => undefined);
  }
}

function loadThumbnail(key: string, fileUrl: string, width: number, height: number) {
  const cached = getCachedThumbnail(key);
  if (cached) return Promise.resolve(cached);

  const failedAt = failedRenderTimes.get(key) ?? 0;
  if (Date.now() - failedAt < FAILED_RENDER_RETRY_MS) {
    return Promise.resolve(null);
  }

  const existing = thumbnailRequests.get(key);
  if (existing) return existing;

  const request = renderThumbnail(fileUrl, width, height)
    .then((thumbnail) => {
      if (thumbnail) {
        cacheThumbnail(key, thumbnail);
        failedRenderTimes.delete(key);
      }
      return thumbnail;
    })
    .catch((error) => {
      failedRenderTimes.set(key, Date.now());
      console.error("Error rendering thumbnail:", error);
      return null;
    })
    .finally(() => {
      thumbnailRequests.delete(key);
    });

  thumbnailRequests.set(key, request);
  return request;
}

export function clearPdfThumbnailCache() {
  thumbnailCache.clear();
  thumbnailRequests.clear();
  failedRenderTimes.clear();
}

type PdfThumbnailContentProps = Required<Pick<PdfThumbnailProps, 'width' | 'height'>> &
  Pick<PdfThumbnailProps, 'fileUrl' | 'className'> & {
    resolvedCacheKey: string;
  };

const PdfThumbnailContent: React.FC<PdfThumbnailContentProps> = ({
  fileUrl,
  width,
  height,
  className,
  resolvedCacheKey,
}) => {
  const [cached] = useState(() => getCachedThumbnail(resolvedCacheKey));
  const [thumbUrl, setThumbUrl] = useState(cached?.url ?? null);
  const [shouldLoad, setShouldLoad] = useState(
    () => Boolean(cached) || typeof IntersectionObserver === "undefined"
  );
  const placeholderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = placeholderRef.current;
    if (shouldLoad || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "300px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    if (!fileUrl || !shouldLoad || thumbUrl) return;

    let active = true;
    void loadThumbnail(resolvedCacheKey, fileUrl, width, height).then((thumbnail) => {
      if (active && thumbnail) {
        setThumbUrl(thumbnail.url);
      }
    });
    return () => {
      active = false;
    };
  }, [fileUrl, height, resolvedCacheKey, shouldLoad, thumbUrl, width]);

  if (!thumbUrl) {
    return (
      <div
        ref={placeholderRef}
        className={`shrink-0 animate-pulse rounded-sm bg-gray-200 ${className ?? ""}`}
        style={{ width, height }}
        role="status"
        aria-label="Loading document thumbnail"
      />
    );
  }

  return (
    <Image
      src={thumbUrl}
      alt="PDF thumbnail"
      width={width}
      height={height}
      unoptimized
      className={`rounded-sm border object-cover ${className ?? ""}`}
    />
  );
};

const PdfThumbnail: React.FC<PdfThumbnailProps> = ({
  fileUrl,
  width = 120,
  height = 160,
  className,
  cacheKey,
}) => {
  const resolvedCacheKey = useMemo(
    () => `${cacheKey || fileUrl}|${width}x${height}|v${RENDER_FORMAT_VERSION}`,
    [cacheKey, fileUrl, height, width]
  );

  return (
    <PdfThumbnailContent
      key={resolvedCacheKey}
      resolvedCacheKey={resolvedCacheKey}
      fileUrl={fileUrl}
      width={width}
      height={height}
      className={className}
    />
  );
};

export default React.memo(PdfThumbnail);
