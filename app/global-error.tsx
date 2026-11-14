'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'sans-serif', padding: 24 }}>
        <h2>Something went wrong.</h2>
        <p>{error?.message || 'An unexpected error occurred.'}</p>
        <button
          type="button"
          onClick={() => reset()}
          style={{ marginTop: 12, padding: '8px 12px', cursor: 'pointer' }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
