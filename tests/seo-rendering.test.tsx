import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('SEO route pages are server-rendered by default', () => {
  const seoPages = [
    'app/blog/page.tsx',
    'app/contact/page.tsx',
    'app/request-demo/page.tsx',
    'app/why-signWorkflow/page.tsx',
  ];

  it.each(seoPages)('%s should not declare a client boundary', (page) => {
    const filePath = path.join(process.cwd(), page);
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).not.toContain("'use client'");
    expect(content).not.toContain('"use client"');
  });
});
