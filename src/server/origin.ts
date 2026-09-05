import { AppError } from './errors';

export interface HeaderReader { get(name:string): string | null; entries?: () => IterableIterator<[string, string]> }

function headerValue(headers: HeaderReader, name: string): string | null {
  const wanted = name.toLowerCase();
  const direct = headers.get(name) ?? headers.get(wanted) ?? headers.get(name.toUpperCase());
  if (direct && direct.trim()) return direct.trim();
  if (typeof headers.entries === 'function') {
    for (const [key, value] of headers.entries()) {
      if (key.toLowerCase() === wanted && value?.trim()) return value.trim();
    }
  }
  return null;
}

/** Browser Origin, or the origin of Referer when Origin was stripped. */
export function postedOrigin(headers: HeaderReader): string | null {
  const origin = headerValue(headers, 'origin');
  if (origin) return origin;
  const referer = headerValue(headers, 'referer') ?? headerValue(headers, 'referrer');
  if (!referer) return null;
  try { return new URL(referer).origin; } catch { return null; }
}

/** Compare against the host that served the request, not Next's inferred URL origin. */
export function sameOrigin(requestUrl:string,headers:HeaderReader,origin:string){
  try {
    const supplied=new URL(origin),request=new URL(requestUrl);
    const proto=(headerValue(headers,'x-forwarded-proto')??request.protocol.slice(0,-1)).split(',')[0].trim();
    const host=(headerValue(headers,'x-forwarded-host')??headerValue(headers,'host')??request.host).split(',')[0].trim();
    const expected=new URL(`${proto}://${host}`), aliases=new Set(['localhost','127.0.0.1','::1']);
    const defaultPort=(scheme:string)=>scheme==='https:'?'443':'80';
    const portsMatch=(supplied.port||defaultPort(supplied.protocol))===(expected.port||defaultPort(expected.protocol));
    const localDevelopment=process.env.NODE_ENV!=='production'&&aliases.has(supplied.hostname)&&aliases.has(expected.hostname);
    return supplied.protocol===expected.protocol&&portsMatch&&(supplied.hostname===expected.hostname||localDevelopment);
  } catch { return false; }
}

export function originDeniedResponse() {
  return { error: { code: 'ORIGIN', message: 'Request origin does not match' } };
}

/** Reject cross-site POSTs. Missing Origin is allowed only in non-production (scripts/tests). */
export function assertPostOrigin(requestUrl: string, headers: HeaderReader, method: string) {
  const verb = method.toUpperCase();
  if (verb !== 'POST' && verb !== 'PUT' && verb !== 'PATCH' && verb !== 'DELETE') return;
  const fetchSite = (headerValue(headers, 'sec-fetch-site') ?? '').toLowerCase();
  if (fetchSite === 'cross-site' || fetchSite === 'cross-origin') {
    throw new AppError(403, 'ORIGIN', 'Request origin does not match');
  }
  const origin = postedOrigin(headers);
  if (!origin) {
    if (process.env.NODE_ENV === 'production') throw new AppError(403, 'ORIGIN', 'Request origin does not match');
    return;
  }
  if (!sameOrigin(requestUrl, headers, origin)) throw new AppError(403, 'ORIGIN', 'Request origin does not match');
}
