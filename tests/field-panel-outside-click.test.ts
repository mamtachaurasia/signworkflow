// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { shouldKeepFieldPropertyPanelOpen } from '../utils/builder/fieldPanelOutsideClick';

describe('field property panel outside click guard', () => {
  it('keeps the panel open for clicks inside dialog content', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.appendChild(button);

    expect(shouldKeepFieldPropertyPanelOpen(button)).toBe(true);
  });

  it('keeps the panel open for clicks inside portaled dropdowns', () => {
    const dropdown = document.createElement('div');
    dropdown.setAttribute('data-dropdown-portal', 'true');
    const option = document.createElement('button');
    dropdown.appendChild(option);

    expect(shouldKeepFieldPropertyPanelOpen(option)).toBe(true);
  });

  it('keeps the panel open for clicks inside the property panel or field handles', () => {
    const panel = document.createElement('aside');
    panel.setAttribute('data-field-property-panel', 'true');
    const panelInput = document.createElement('input');
    panel.appendChild(panelInput);

    const draggable = document.createElement('div');
    draggable.className = 'react-draggable';
    const fieldButton = document.createElement('button');
    draggable.appendChild(fieldButton);

    expect(shouldKeepFieldPropertyPanelOpen(panelInput)).toBe(true);
    expect(shouldKeepFieldPropertyPanelOpen(fieldButton)).toBe(true);
  });

  it('allows ordinary outside clicks to close the panel', () => {
    const outside = document.createElement('button');

    expect(shouldKeepFieldPropertyPanelOpen(outside)).toBe(false);
  });
});
