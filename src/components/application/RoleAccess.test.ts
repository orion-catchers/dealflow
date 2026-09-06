import { describe, expect, it } from 'vitest';
import { canAccessRoute, navigationFor } from './Application';
import type { Role } from '@/contracts/application';

describe('Role-based navigation visibility (navigationFor)', () => {
  it('gives ADMIN all 10 navigation workflows including setup', () => {
    const nav = navigationFor('ADMIN');
    const hrefs = nav.map((item) => item.href);
    expect(hrefs).toEqual([
      '/home',
      '/quotes',
      '/approvals',
      '/fulfillment',
      '/subscriptions',
      '/invoices',
      '/health',
      '/reports',
      '/products',
      '/settings/customers',
    ]);
  });

  it('restricts SALES_REP to sales-relevant workflows (no approvals, fulfillment, subscriptions, invoices, or setup)', () => {
    const nav = navigationFor('SALES_REP');
    const hrefs = nav.map((item) => item.href);
    expect(hrefs).toEqual([
      '/home',
      '/quotes',
      '/health',
      '/reports',
      '/products',
    ]);
    expect(hrefs).not.toContain('/approvals');
    expect(hrefs).not.toContain('/fulfillment');
    expect(hrefs).not.toContain('/subscriptions');
    expect(hrefs).not.toContain('/invoices');
    expect(hrefs).not.toContain('/settings/customers');
    expect(hrefs).not.toContain('/policies');
  });

  it('restricts SALES_MANAGER to sales & governance workflows (no fulfillment, subscriptions, or invoices)', () => {
    const nav = navigationFor('SALES_MANAGER');
    const hrefs = nav.map((item) => item.href);
    expect(hrefs).toEqual([
      '/home',
      '/quotes',
      '/approvals',
      '/health',
      '/reports',
      '/products',
      '/policies',
    ]);
    expect(hrefs).not.toContain('/fulfillment');
    expect(hrefs).not.toContain('/subscriptions');
    expect(hrefs).not.toContain('/invoices');
    expect(hrefs).not.toContain('/settings/customers');
  });

  it('restricts FINANCE_OPS to finance & operations workflows (no quotations, no deal health)', () => {
    const nav = navigationFor('FINANCE_OPS');
    const hrefs = nav.map((item) => item.href);
    expect(hrefs).toEqual([
      '/home',
      '/approvals',
      '/fulfillment',
      '/subscriptions',
      '/invoices',
      '/reports',
      '/products',
      '/settings/warehouses',
    ]);
    expect(hrefs).not.toContain('/quotes');
    expect(hrefs).not.toContain('/health');
    expect(hrefs).not.toContain('/settings/customers');
    expect(hrefs).not.toContain('/policies');
  });

  it('gives CUSTOMER no internal workspace navigation items', () => {
    const nav = navigationFor('CUSTOMER');
    expect(nav).toHaveLength(0);
  });
});

describe('Role-based route authorization guard (canAccessRoute)', () => {
  describe('CUSTOMER role', () => {
    it('can only access customer portal routes', () => {
      expect(canAccessRoute('CUSTOMER', '/portal')).toBe(true);
      expect(canAccessRoute('CUSTOMER', '/portal/quotes/Q-1042')).toBe(true);
      expect(canAccessRoute('CUSTOMER', '/home')).toBe(false);
      expect(canAccessRoute('CUSTOMER', '/quotes')).toBe(false);
      expect(canAccessRoute('CUSTOMER', '/approvals')).toBe(false);
      expect(canAccessRoute('CUSTOMER', '/fulfillment')).toBe(false);
      expect(canAccessRoute('CUSTOMER', '/subscriptions')).toBe(false);
      expect(canAccessRoute('CUSTOMER', '/invoices')).toBe(false);
      expect(canAccessRoute('CUSTOMER', '/health')).toBe(false);
      expect(canAccessRoute('CUSTOMER', '/reports')).toBe(false);
      expect(canAccessRoute('CUSTOMER', '/products')).toBe(false);
      expect(canAccessRoute('CUSTOMER', '/settings/customers')).toBe(false);
    });
  });

  describe('ADMIN role', () => {
    it('can access all internal routes and cannot access customer portal', () => {
      expect(canAccessRoute('ADMIN', '/home')).toBe(true);
      expect(canAccessRoute('ADMIN', '/quotes')).toBe(true);
      expect(canAccessRoute('ADMIN', '/quotes/new')).toBe(true);
      expect(canAccessRoute('ADMIN', '/quotes/Q-1042')).toBe(true);
      expect(canAccessRoute('ADMIN', '/approvals')).toBe(true);
      expect(canAccessRoute('ADMIN', '/fulfillment')).toBe(true);
      expect(canAccessRoute('ADMIN', '/subscriptions')).toBe(true);
      expect(canAccessRoute('ADMIN', '/invoices')).toBe(true);
      expect(canAccessRoute('ADMIN', '/health')).toBe(true);
      expect(canAccessRoute('ADMIN', '/reports')).toBe(true);
      expect(canAccessRoute('ADMIN', '/products')).toBe(true);
      expect(canAccessRoute('ADMIN', '/products/new')).toBe(true);
      expect(canAccessRoute('ADMIN', '/price-lists')).toBe(true);
      expect(canAccessRoute('ADMIN', '/settings/customers')).toBe(true);
      expect(canAccessRoute('ADMIN', '/settings/users')).toBe(true);
      expect(canAccessRoute('ADMIN', '/settings/warehouses')).toBe(true);
      expect(canAccessRoute('ADMIN', '/policies')).toBe(true);
      expect(canAccessRoute('ADMIN', '/portal')).toBe(false);
    });
  });

  describe('SALES_REP role', () => {
    it('allows quoting, pipeline, health, reports, and viewing catalog', () => {
      expect(canAccessRoute('SALES_REP', '/home')).toBe(true);
      expect(canAccessRoute('SALES_REP', '/quotes')).toBe(true);
      expect(canAccessRoute('SALES_REP', '/quotes/new')).toBe(true);
      expect(canAccessRoute('SALES_REP', '/quotes/Q-1042')).toBe(true);
      expect(canAccessRoute('SALES_REP', '/pipeline')).toBe(true);
      expect(canAccessRoute('SALES_REP', '/health')).toBe(true);
      expect(canAccessRoute('SALES_REP', '/reports')).toBe(true);
      expect(canAccessRoute('SALES_REP', '/products')).toBe(true);
      expect(canAccessRoute('SALES_REP', '/products/laptop')).toBe(true);
    });

    it('forbids creating products and price list management', () => {
      expect(canAccessRoute('SALES_REP', '/products/new')).toBe(false);
      expect(canAccessRoute('SALES_REP', '/price-lists')).toBe(false);
    });

    it('forbids approvals, fulfillment, subscriptions, invoices, setup, and portal', () => {
      expect(canAccessRoute('SALES_REP', '/approvals')).toBe(false);
      expect(canAccessRoute('SALES_REP', '/approvals/Q-1042')).toBe(false);
      expect(canAccessRoute('SALES_REP', '/fulfillment')).toBe(false);
      expect(canAccessRoute('SALES_REP', '/fulfillment/O-1001')).toBe(false);
      expect(canAccessRoute('SALES_REP', '/subscriptions')).toBe(false);
      expect(canAccessRoute('SALES_REP', '/invoices')).toBe(false);
      expect(canAccessRoute('SALES_REP', '/settings/customers')).toBe(false);
      expect(canAccessRoute('SALES_REP', '/settings/users')).toBe(false);
      expect(canAccessRoute('SALES_REP', '/settings/warehouses')).toBe(false);
      expect(canAccessRoute('SALES_REP', '/policies')).toBe(false);
      expect(canAccessRoute('SALES_REP', '/portal')).toBe(false);
    });
  });

  describe('SALES_MANAGER role', () => {
    it('allows quotes review, approvals, health, reports, catalog view, and policy/recommendation settings', () => {
      expect(canAccessRoute('SALES_MANAGER', '/home')).toBe(true);
      expect(canAccessRoute('SALES_MANAGER', '/quotes')).toBe(true);
      expect(canAccessRoute('SALES_MANAGER', '/quotes/Q-1042')).toBe(true);
      expect(canAccessRoute('SALES_MANAGER', '/pipeline')).toBe(true);
      expect(canAccessRoute('SALES_MANAGER', '/approvals')).toBe(true);
      expect(canAccessRoute('SALES_MANAGER', '/approvals/Q-1042')).toBe(true);
      expect(canAccessRoute('SALES_MANAGER', '/health')).toBe(true);
      expect(canAccessRoute('SALES_MANAGER', '/reports')).toBe(true);
      expect(canAccessRoute('SALES_MANAGER', '/products')).toBe(true);
      expect(canAccessRoute('SALES_MANAGER', '/products/laptop')).toBe(true);
      expect(canAccessRoute('SALES_MANAGER', '/policies')).toBe(true);
      expect(canAccessRoute('SALES_MANAGER', '/settings/recommendations')).toBe(true);
      expect(canAccessRoute('SALES_MANAGER', '/settings/health')).toBe(true);
    });

    it('forbids quote creation, product creation, fulfillment, billing, and admin setup', () => {
      expect(canAccessRoute('SALES_MANAGER', '/quotes/new')).toBe(false);
      expect(canAccessRoute('SALES_MANAGER', '/products/new')).toBe(false);
      expect(canAccessRoute('SALES_MANAGER', '/fulfillment')).toBe(false);
      expect(canAccessRoute('SALES_MANAGER', '/subscriptions')).toBe(false);
      expect(canAccessRoute('SALES_MANAGER', '/invoices')).toBe(false);
      expect(canAccessRoute('SALES_MANAGER', '/settings/customers')).toBe(false);
      expect(canAccessRoute('SALES_MANAGER', '/settings/users')).toBe(false);
      expect(canAccessRoute('SALES_MANAGER', '/settings/warehouses')).toBe(false);
      expect(canAccessRoute('SALES_MANAGER', '/settings/plans')).toBe(false);
      expect(canAccessRoute('SALES_MANAGER', '/portal')).toBe(false);
    });
  });

  describe('FINANCE_OPS role', () => {
    it('allows approvals, fulfillment, subscriptions, invoices, reports, catalog view, warehouses, and plan settings', () => {
      expect(canAccessRoute('FINANCE_OPS', '/home')).toBe(true);
      expect(canAccessRoute('FINANCE_OPS', '/approvals')).toBe(true);
      expect(canAccessRoute('FINANCE_OPS', '/approvals/Q-1042')).toBe(true);
      expect(canAccessRoute('FINANCE_OPS', '/quotes/Q-1042')).toBe(true);
      expect(canAccessRoute('FINANCE_OPS', '/fulfillment')).toBe(true);
      expect(canAccessRoute('FINANCE_OPS', '/fulfillment/O-1001')).toBe(true);
      expect(canAccessRoute('FINANCE_OPS', '/subscriptions')).toBe(true);
      expect(canAccessRoute('FINANCE_OPS', '/subscriptions/SUB-1001')).toBe(true);
      expect(canAccessRoute('FINANCE_OPS', '/invoices')).toBe(true);
      expect(canAccessRoute('FINANCE_OPS', '/invoices/INV-1001')).toBe(true);
      expect(canAccessRoute('FINANCE_OPS', '/reports')).toBe(true);
      expect(canAccessRoute('FINANCE_OPS', '/products')).toBe(true);
      expect(canAccessRoute('FINANCE_OPS', '/products/laptop')).toBe(true);
      expect(canAccessRoute('FINANCE_OPS', '/warehouses')).toBe(true);
      expect(canAccessRoute('FINANCE_OPS', '/settings/warehouses')).toBe(true);
      expect(canAccessRoute('FINANCE_OPS', '/settings/plans')).toBe(true);
    });

    it('forbids quotes, pipeline, deal health, product creation, policies, and admin setup', () => {
      expect(canAccessRoute('FINANCE_OPS', '/quotes')).toBe(false);
      expect(canAccessRoute('FINANCE_OPS', '/quotes/new')).toBe(false);
      expect(canAccessRoute('FINANCE_OPS', '/pipeline')).toBe(false);
      expect(canAccessRoute('FINANCE_OPS', '/health')).toBe(false);
      expect(canAccessRoute('FINANCE_OPS', '/products/new')).toBe(false);
      expect(canAccessRoute('FINANCE_OPS', '/policies')).toBe(false);
      expect(canAccessRoute('FINANCE_OPS', '/settings/customers')).toBe(false);
      expect(canAccessRoute('FINANCE_OPS', '/settings/users')).toBe(false);
      expect(canAccessRoute('FINANCE_OPS', '/settings/recommendations')).toBe(false);
      expect(canAccessRoute('FINANCE_OPS', '/settings/health')).toBe(false);
      expect(canAccessRoute('FINANCE_OPS', '/portal')).toBe(false);
    });
  });
});
