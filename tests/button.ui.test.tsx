// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@ui';

describe('Button', () => {
  it('uses visible child text as the accessible name when no label prop is provided', () => {
    render(<Button>Replace Page</Button>);

    expect(screen.getByRole('button', { name: 'Replace Page' })).toBeInTheDocument();
  });

  it('keeps a fallback label for icon-only buttons without text', () => {
    render(<Button icon={<span aria-hidden="true">+</span>} />);

    expect(screen.getByRole('button', { name: 'Button' })).toBeInTheDocument();
  });

  it('does not wrap complex children in a span wrapper', () => {
    render(
      <Button>
        <>
          <div data-testid="loader">Loading</div>
          Continue
        </>
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Loading Continue' });
    const loader = screen.getByTestId('loader');

    expect(loader.parentElement).toBe(button);
  });
});
