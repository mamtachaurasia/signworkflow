type AccountContact = {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

export function resolveAccountContactName(
  ...accounts: Array<AccountContact | null | undefined>
): string | null {
  for (const account of accounts) {
    const name = (account?.name || '').trim();
    if (name) {
      return name;
    }

    const combined = [account?.firstName || '', account?.lastName || '']
      .map((value) => value.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    if (combined) {
      return combined;
    }
  }

  return null;
}

export function resolveAccountContactEmail(
  ...accounts: Array<AccountContact | null | undefined>
): string | null {
  for (const account of accounts) {
    const email = (account?.email || '').trim();
    if (email) {
      return email;
    }
  }

  return null;
}
