/**
 * Before pause/resume existed, revoking an endpoint set only `active: false`.
 * Those historical records have no `revokedAt`, so a plain `{ revokedAt: null
 * }` query would accidentally make a previously compromised credential
 * resumable. New pauses always carry a timestamp, which lets us safely retain
 * their behavior while treating the old shape as revoked.
 */
export function getUsableWebhookEndpointFilter(): Record<string, unknown> {
  return {
    revokedAt: null,
    $or: [
      { active: { $ne: false } },
      { active: false, pausedAt: { $type: 'date' } },
    ],
  };
}

