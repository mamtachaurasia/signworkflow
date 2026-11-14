export const USER_AVATAR = {
  fallback: '/images/user-icon.svg',
} as const;

export function resolveUserAvatar(picture?: string | null): string {
  const normalizedPicture = picture?.trim();
  return normalizedPicture || USER_AVATAR.fallback;
}
