import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { faqs } from '@/components/common/FAQ';

describe('domain business context content', () => {
  it('keeps buyer-specific FAQ coverage for trust and implementation depth', () => {
    expect(faqs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          q: 'Which teams are the best fit for SignWorkflow?',
          a: expect.stringContaining('Legal teams'),
        }),
        expect.objectContaining({
          q: 'How does SignWorkflow support audits and retention?',
          a: expect.stringContaining('legal holds'),
        }),
        expect.objectContaining({
          q: 'Can completed documents be exported outside SignWorkflow?',
          a: expect.stringContaining('Google Drive or Dropbox'),
        }),
      ])
    );
  });

  it('states the B2B niche and target audiences on the About page', () => {
    const aboutPage = readFileSync(join(process.cwd(), 'app/about/page.tsx'), 'utf8');

    expect(aboutPage).toContain('B2B e-signature workflow software');
    expect(aboutPage).toContain('Legal');
    expect(aboutPage).toContain('HR');
    expect(aboutPage).toContain('Finance');
    expect(aboutPage).toContain('Compliance');
  });

  it('keeps concrete security implementation details on the Security page', () => {
    const securityPage = readFileSync(join(process.cwd(), 'app/security/page.tsx'), 'utf8');

    expect(securityPage).toContain('Workspace roles and plan gates');
    expect(securityPage).toContain('Retention and legal-hold workflows');
    expect(securityPage).toContain('Google Drive and Dropbox exports');
    expect(securityPage).toContain('Responsible disclosure');
    expect(securityPage).toContain('does not claim SOC 2');
  });

  it('keeps consent-management details on the Cookie Policy page', () => {
    const cookiesPage = readFileSync(join(process.cwd(), 'app/cookies/page.tsx'), 'utf8');

    expect(cookiesPage).toContain('sw_cookie_consent');
    expect(cookiesPage).toContain('sw_consent_region');
    expect(cookiesPage).toContain('Google Consent Mode');
    expect(cookiesPage).toContain('Open Cookie Settings');
    expect(cookiesPage).toContain('Necessary cookies cannot be disabled');
  });
});
