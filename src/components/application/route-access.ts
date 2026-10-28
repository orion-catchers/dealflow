import type {Role} from '../../contracts/application';

export function isPortalPath(path:string){return path==='/portal'||path.startsWith('/portal/');}

export function canAccessRoute(role: Role, path: string): boolean {
  if (role === 'CUSTOMER') {
    return isPortalPath(path);
  }
  if (role === 'ADMIN') {
    return !isPortalPath(path);
  }
  const cleanPath = path.split('?')[0].split('#')[0];
  const parts = cleanPath.split('/').filter(Boolean);
  const first = parts[0];
  const second = parts[1];

  if (cleanPath === '/home') return true;

  if (role === 'SALES_REP') {
    if (first === 'quotes' || cleanPath === '/pipeline') {
      return true;
    }
    if (first === 'health') return true;
    if (first === 'reports') return true;
    if (first === 'products') {
      return second !== 'new';
    }
    return false;
  }

  if (role === 'SALES_MANAGER') {
    if (first === 'quotes' || cleanPath === '/pipeline') {
      return second !== 'new';
    }
    if (first === 'approvals') return true;
    if (first === 'health') return true;
    if (first === 'reports') return true;
    if (first === 'products') {
      return second !== 'new';
    }
    if (cleanPath === '/policies') return true;
    if (cleanPath === '/settings/recommendations' || cleanPath === '/settings/health') return true;
    return false;
  }

  if (role === 'FINANCE_OPS') {
    if (first === 'quotes') {
      return Boolean(second && second !== 'new');
    }
    if (first === 'approvals') return true;
    if (first === 'fulfillment') return true;
    if (first === 'subscriptions') return true;
    if (first === 'invoices') return true;
    if (cleanPath === '/billing') return true;
    if (first === 'reports') return true;
    if (first === 'products') {
      return second !== 'new';
    }
    if (first === 'warehouses' || cleanPath === '/settings/warehouses') return true;
    if (cleanPath === '/settings/plans') return true;
    return false;
  }

  return false;
}

/**
 * Post-login ?next= target. Used only when it is an in-app path (leading "/",
 * not "//", no backslash or control characters, so no scheme or host) that the
 * signed-in role may open. Otherwise the caller falls back to the role's home.
 */
export function allowedNextPath(next: string | null, role: Role): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  if (Array.from(next).some((char) => char === '\\' || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;
  return canAccessRoute(role, next) ? next : null;
}
