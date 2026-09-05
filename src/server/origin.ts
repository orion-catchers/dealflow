export interface HeaderReader { get(name:string): string | null }

/** Compare against the host that served the request, not Next's inferred URL origin. */
export function sameOrigin(requestUrl:string,headers:HeaderReader,origin:string){
  try {
    const supplied=new URL(origin),request=new URL(requestUrl);
    const proto=(headers.get('x-forwarded-proto')??request.protocol.slice(0,-1)).split(',')[0].trim();
    const host=(headers.get('x-forwarded-host')??headers.get('host')??request.host).split(',')[0].trim();
    const expected=new URL(`${proto}://${host}`), aliases=new Set(['localhost','127.0.0.1','::1']);
    const defaultPort=(scheme:string)=>scheme==='https:'?'443':'80';
    const portsMatch=(supplied.port||defaultPort(supplied.protocol))===(expected.port||defaultPort(expected.protocol));
    const localDevelopment=process.env.NODE_ENV!=='production'&&aliases.has(supplied.hostname)&&aliases.has(expected.hostname);
    return supplied.protocol===expected.protocol&&portsMatch&&(supplied.hostname===expected.hostname||localDevelopment);
  } catch { return false; }
}
