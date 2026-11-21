export type Appearance = { installName: string; iconUrl: string; illustrationUrl: string; hideIllustration: boolean; shareTitle?: string; shareDescription?: string };

export const defaultAppearance: Appearance = { installName: '', iconUrl: '', illustrationUrl: '', hideIllustration: false };
export const appearanceKey = 'board:appearance';
export const builtInIcons = { tab: '/party-icon-48.png', touch: '/party-icon-192.png', install: '/party-icon-512.png' } as const;
export const defaultSharePreview = { title: '스쿨라운지', description: '승인된 회원끼리 익명으로 대화하는 학교 게시판' };
export const shareLimits = { title: 30, description: 60 } as const;

function shareLine(value: unknown, max: number) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : null;
}

export function publicImageUrl(value: string, pngOnly = false): string | null {
  const text = value.trim();
  if (!text) return '';
  if (text.length > 2048 || !/^https:\/\//i.test(text) || /[\s\\]/u.test(text)) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !/\.[a-z][a-z0-9-]*$/i.test(url.hostname) || /\.(?:local|localhost|internal|lan|home)$/i.test(url.hostname)) return null;
    if (pngOnly && !/\.png$/i.test(url.pathname)) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export function normalizeAppearance(value: unknown): Appearance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.installName !== 'string' || typeof data.iconUrl !== 'string' || typeof data.illustrationUrl !== 'string' || typeof data.hideIllustration !== 'boolean') return null;
  const installName = data.installName.trim();
  if ([...installName].length > 48 || /[\u0000-\u001f\u007f]/u.test(installName)) return null;
  const iconUrl = publicImageUrl(data.iconUrl, true), illustrationUrl = publicImageUrl(data.illustrationUrl);
  if (iconUrl === null || illustrationUrl === null) return null;
  const shareTitle = shareLine(data.shareTitle, shareLimits.title), shareDescription = shareLine(data.shareDescription, shareLimits.description);
  if (shareTitle === null || shareDescription === null) return null;
  return { installName, iconUrl, illustrationUrl, hideIllustration: data.hideIllustration, ...(shareTitle && { shareTitle }), ...(shareDescription && { shareDescription }) };
}
