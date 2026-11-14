export const shouldKeepFieldPropertyPanelOpen = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return true;
  }

  return Boolean(
    target.closest('.react-draggable') ||
      target.closest('[data-field-property-panel="true"]') ||
      target.closest('[data-dropdown-portal="true"]') ||
      target.closest('[role="dialog"]')
  );
};
