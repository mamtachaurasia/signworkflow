// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BuilderStoreProvider } from '../store/builderStore';
import { useBuilderStore } from '../hooks/useBuilderStore';

function BuilderStoreProbe({
  label,
  initialName,
}: {
  label: string;
  initialName: string;
}) {
  const { documentName, setDocumentName } = useBuilderStore();

  return (
    <section>
      <span data-testid={`${label}-name`}>{documentName}</span>
      <button type="button" onClick={() => setDocumentName(initialName)}>
        load-{label}
      </button>
      <button type="button" onClick={() => setDocumentName((current) => `${current}-updated`)}>
        update-{label}
      </button>
    </section>
  );
}

describe('builder store isolation', () => {
  it('keeps separate DocumentEditor instances from sharing builder state', () => {
    render(
      <>
        <BuilderStoreProvider>
          <BuilderStoreProbe label="main" initialName="Main Document" />
        </BuilderStoreProvider>
        <BuilderStoreProvider>
          <BuilderStoreProbe label="preview" initialName="Preview Document" />
        </BuilderStoreProvider>
      </>,
    );

    fireEvent.click(screen.getByText('load-main'));
    fireEvent.click(screen.getByText('load-preview'));

    expect(screen.getByTestId('main-name')).toHaveTextContent('Main Document');
    expect(screen.getByTestId('preview-name')).toHaveTextContent('Preview Document');

    fireEvent.click(screen.getByText('update-preview'));

    expect(screen.getByTestId('main-name')).toHaveTextContent('Main Document');
    expect(screen.getByTestId('preview-name')).toHaveTextContent('Preview Document-updated');
  });
});
