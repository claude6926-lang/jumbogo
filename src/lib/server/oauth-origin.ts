// OAuth cookies are host-only. Always start the handshake on the configured
// public origin before creating state, including when opened from a preview URL.
export function oauthOrigin(value = process.env.APP_URL): string {
  if (!value) throw new Error('OAUTH_NOT_CONFIGURED');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('OAUTH_NOT_CONFIGURED'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !['http:', 'https:'].includes(url.protocol) || (!loopback && url.protocol !== 'https:') ||
      (process.env.VERCEL === '1' && loopback)) {
    throw new Error('OAUTH_NOT_CONFIGURED');
  }
  return url.origin;
}

export function canonicalOAuthStart(requestUrl: string, provider: 'google' | 'facebook', role: 'user' | 'driver', requestHost?: string | null) {
  const origin = oauthOrigin();
  const request = new URL(requestUrl);
  const configured = new URL(origin);
  // NextRequest normalizes loopback hosts (127.0.0.1 -> localhost). The Host
  // header retains the browser's actual authority. It is used only to compare;
  // redirect destinations and OAuth callbacks always come from APP_URL.
  const sameHost = requestHost ? requestHost.toLowerCase() === configured.host.toLowerCase() : request.host === configured.host;
  if (sameHost && request.protocol === configured.protocol) return null;
  const target = new URL(`/api/auth/oauth/${provider}`, origin);
  target.searchParams.set('role', role);
  return target;
}
