// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import RecipientsList from '@/components/builder/RecipientsList';
import type { Recipient } from '@/types/types';

const templateRoles: Recipient[] = [
  {
    id: 'buyer-role',
    name: 'Buyer',
    email: '',
    role: 'signer',
    color: '#3B82F6',
    order: 1,
    status: 'pending',
  },
  {
    id: 'legal-role',
    name: 'Legal reviewer',
    email: '',
    role: 'approver',
    color: '#F59E0B',
    order: 2,
    status: 'pending',
  },
];

describe('RecipientsList template roles', () => {
  it('shows preconfigured role names and order numbers when template emails are intentionally blank', () => {
    render(
      <RecipientsList
        recipients={templateRoles}
        fieldStats={{
          'buyer-role': { total: 2, required: 1 },
          'legal-role': { total: 1, required: 1 },
        }}
      />
    );

    expect(screen.getByText('Buyer')).toBeInTheDocument();
    expect(screen.getByText('Legal reviewer')).toBeInTheDocument();
    expect(screen.getByLabelText('Buyer, order 1')).toHaveTextContent('1');
    expect(screen.getByLabelText('Legal reviewer, order 2')).toHaveTextContent('2');
    expect(screen.getByText('2 fields')).toBeInTheDocument();
    expect(screen.getByText('1 field')).toBeInTheDocument();
  });
});
