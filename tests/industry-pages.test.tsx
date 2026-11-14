// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IndustryDetails } from '@/components/solutions/IndustryDetails';
import { INDUSTRIES } from '@/config/solutions.config';

describe('Industry detail pages', () => {
  it('renders richer industry detail sections and exposes a broad industry catalog', () => {
    expect(INDUSTRIES.length).toBeGreaterThanOrEqual(15);

    const healthcare = INDUSTRIES.find((industry) => industry.slug === 'healthcare');
    expect(healthcare).toBeDefined();

    render(<IndustryDetails industry={healthcare!} />);

    expect(screen.getByText(/Typical documents/i)).toBeInTheDocument();
    expect(screen.getByText(/Compliance & security/i)).toBeInTheDocument();
    expect(screen.getByText(/What teams automate/i)).toBeInTheDocument();
    expect(screen.getByText(/Frequently asked questions/i)).toBeInTheDocument();
    expect(screen.getByText(/Can healthcare & medical teams use electronic signatures/i)).toBeInTheDocument();
  });
});
