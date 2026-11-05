/** Compare the browser Origin with the public Host, including reverse-proxy previews. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // Non-browser clients and same-origin fetch without Origin.
  let originUrl: URL;
  try { originUrl = new URL(origin); } catch { return false; }
  const forwarded = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const publicHost = forwarded || req.headers.get('host') || new URL(req.url).host;
  return originUrl.host === publicHost;
}
