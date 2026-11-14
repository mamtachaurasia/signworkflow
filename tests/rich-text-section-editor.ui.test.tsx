// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import RichTextSectionEditor from '@/components/templates/RichTextSectionEditor';

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const editorRect = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  top: 0,
  right: 1,
  bottom: 1,
  left: 0,
  toJSON: () => ({}),
};

// ProseMirror reads layout APIs when an explicit apply action focuses the editor.
// JSDOM does not implement these APIs on text nodes.
Object.defineProperty(Text.prototype, 'getClientRects', {
  configurable: true,
  value: () => [editorRect],
});
Object.defineProperty(Text.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: () => editorRect,
});
Object.defineProperty(Range.prototype, 'getClientRects', {
  configurable: true,
  value: () => [editorRect],
});
Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: () => editorRect,
});
Object.defineProperty(window, 'scrollBy', {
  configurable: true,
  value: () => undefined,
});

describe('RichTextSectionEditor AI writing UI', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers document-aware questions and waits for explicit approval before applying an AI result', async () => {
    const onChange = vi.fn();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ suggestion: '<script>alert("x")</script> Payment is due within 30 days.' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    render(
      <RichTextSectionEditor
        templateId="507f1f77bcf86cd799439011"
        documentName="Services Agreement"
        documentText="The Client must pay each invoice within thirty days."
        html="<p>Payment is due within 30 days of each invoice.</p>"
        placeholder="Write contract text…"
        onChange={onChange}
      />
    );

    const aiButton = await screen.findByRole('button', { name: 'Write with AI' });
    expect(screen.getByRole('button', { name: 'Bold (Ctrl/⌘ B)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add or edit link (Ctrl/⌘ K)' })).toBeInTheDocument();
    onChange.mockClear();

    fireEvent.click(aiButton);

    expect(await screen.findByText('Suggested questions')).toBeInTheDocument();
    const paymentPrompt = screen.getByRole('button', { name: /Use suggested question: Can you clarify the payment/i });
    fireEvent.click(paymentPrompt);

    const instruction = screen.getByLabelText(/Additional instructions/) as HTMLTextAreaElement;
    expect(instruction.value).toMatch(/clarify the payment, invoicing, and timing terms/i);
    expect(screen.getByRole('button', { name: 'Plain language' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Generate suggestion' }));

    expect(await screen.findByText(/<script>alert\("x"\)<\/script> Payment is due/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replace section' }));
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    expect(onChange.mock.calls.at(-1)?.[0]).toContain('&lt;script&gt;alert("x")&lt;/script&gt;');
    expect(fetchSpy).toHaveBeenCalledWith('/api/ai/template-writing-assistant', expect.objectContaining({ method: 'POST' }));
  });

  it('makes AI available for a blank document and identifies that document in the request', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ suggestion: 'The parties will keep confidential information private.' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    render(
      <RichTextSectionEditor
        documentId="507f1f77bcf86cd799439012"
        documentName="Untitled document"
        documentText=""
        html="<p></p>"
        placeholder="Write contract text…"
        onChange={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Write with AI' }));

    expect(screen.getByRole('button', { name: 'Draft' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText('What should the clause say?'), {
      target: { value: 'Draft a confidentiality clause.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate suggestion' }));

    await screen.findByText('The parties will keep confidential information private.');
    const request = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(request).toMatchObject({ documentId: '507f1f77bcf86cd799439012', mode: 'draft' });
    expect(request).not.toHaveProperty('templateId');
  });

  it('makes Smart variables editable for a blank AI draft and adds them only after Apply', async () => {
    const onSmartVariablesDetected = vi.fn();
    const newVariables = [
      { key: 'seller_name', label: 'Seller Name', defaultValue: '', required: true },
      { key: 'sale_price', label: 'Sale Price', defaultValue: '', required: true },
    ];
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestion: '{{seller_name}} agrees to sell the house for {{sale_price}}.',
        newVariables,
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    render(
      <RichTextSectionEditor
        documentId="507f1f77bcf86cd799439012"
        documentName="Untitled document"
        documentText=""
        html="<p></p>"
        placeholder="Write contract text…"
        onChange={vi.fn()}
        onSmartVariablesDetected={onSmartVariablesDetected}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Write with AI' }));

    const makeEditable = screen.getByRole('checkbox', { name: /make changeable details editable/i });
    expect(makeEditable).toBeChecked();

    fireEvent.change(screen.getByLabelText('What should the clause say?'), {
      target: { value: 'Draft an agreement to sell a 2 BHK house in Greater Noida.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate suggestion' }));

    expect(await screen.findByText('{{seller_name}} agrees to sell the house for {{sale_price}}.')).toBeInTheDocument();
    expect(screen.getByText('2 Smart variables will be added when you apply this draft.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply draft & add 2 variables' })).toBeEnabled();
    expect(onSmartVariablesDetected).not.toHaveBeenCalled();

    const request = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(request).toMatchObject({
      documentId: '507f1f77bcf86cd799439012',
      mode: 'draft',
      allowNewVariables: true,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply draft & add 2 variables' }));
    });

    await waitFor(() => {
      expect(onSmartVariablesDetected).toHaveBeenCalledWith(newVariables);
    });
  });

  it('keeps editable-details drafting available from the default nonblank document title', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestion: '{{seller_name}} agrees to sell the house to {{buyer_name}} for {{sale_price}}.',
        newVariables: [
          { key: 'seller_name', label: 'Seller Name', defaultValue: '', required: true },
          { key: 'buyer_name', label: 'Buyer Name', defaultValue: '', required: true },
          { key: 'sale_price', label: 'Sale Price', defaultValue: '', required: true },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    render(
      <RichTextSectionEditor
        documentId="507f1f77bcf86cd799439012"
        documentName="Untitled document"
        documentText="Untitled Agreement"
        html="<p>Untitled Agreement</p>"
        placeholder="Agreement title"
        onChange={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Write with AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));

    expect(screen.getByRole('checkbox', { name: /make changeable details editable/i })).toBeChecked();
    fireEvent.change(screen.getByLabelText('What should the clause say?'), {
      target: { value: 'Draft an agreement to sell a 2 BHK house in Greater Noida.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate suggestion' }));

    await screen.findByText('{{seller_name}} agrees to sell the house to {{buyer_name}} for {{sale_price}}.');
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toMatchObject({
      documentId: '507f1f77bcf86cd799439012',
      mode: 'draft',
      allowNewVariables: true,
    });
  });

  it('explains Smart-variable protection and retries without requiring a changed request', async () => {
    const onChange = vi.fn();
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          code: 'WRITING_PLACEHOLDER_INTEGRITY_FAILED',
          message: 'The AI suggestion changed one or more template variables. Please try again.',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ suggestion: '{{company_name}} will pay each invoice within 30 days.' }),
      });
    vi.stubGlobal('fetch', fetchSpy);

    render(
      <RichTextSectionEditor
        templateId="507f1f77bcf86cd799439011"
        documentName="Services Agreement"
        documentText="{{company_name}} must pay each invoice within 30 days."
        html="<p>{{company_name}} must pay each invoice within 30 days.</p>"
        placeholder="Write contract text…"
        onChange={onChange}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Write with AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate suggestion' }));

    expect(await screen.findByText(/altered an existing Smart variable/i)).toBeInTheDocument();
    expect(screen.getByText(/document is unchanged/i)).toBeInTheDocument();
    expect(screen.getByText(/your request is fine/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('{{company_name}} will pay each invoice within 30 days.')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body))).toEqual(
      JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
