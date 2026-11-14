import type { ReactElement } from 'react';
import { act, render, type RenderOptions } from '@testing-library/react';

export async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export async function renderWithAsyncEffects(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'queries'>
) {
  let rendered: ReturnType<typeof render> | null = null;
  await act(async () => {
    rendered = render(ui, options);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  if (!rendered) {
    throw new Error('renderWithAsyncEffects failed to render the provided UI');
  }
  return rendered;
}
