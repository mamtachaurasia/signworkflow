export function isLocalE2EEnabled(): boolean {
  return process.env.E2E_LOCAL_ENABLED === '1';
}

export function allowInternalE2ERoutes(): boolean {
  return process.env.NODE_ENV !== 'production' || isLocalE2EEnabled();
}
