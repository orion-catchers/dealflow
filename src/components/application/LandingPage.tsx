'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Layers,
  Lock,
  Package,
  Percent,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
  Users2,
  Zap
} from 'lucide-react';

interface LandingPageProps {
  onOpenWorkspace?: () => void;
}

export default function LandingPage({ onOpenWorkspace }: LandingPageProps) {
  // Simulator State
  const [activeTab, setActiveTab] = useState<'quote' | 'approvals' | 'fulfillment' | 'billing'>('quote');
  const [discountPercent, setDiscountPercent] = useState<number>(12);
  const [includeAddon, setIncludeAddon] = useState<boolean>(true);
  const [roleTab, setRoleTab] = useState<'rep' | 'manager' | 'finance' | 'buyer'>('rep');

  // Interactive calculations for quote builder
  const baseItems = [
    { id: 'item-1', name: 'Enterprise Cloud Suite (Annual)', qty: 1, unitPrice: 320000 },
    { id: 'item-2', name: 'High-Throughput API Gateway Nodes', qty: 4, unitPrice: 45000 },
  ];
  const addonItem = { id: 'item-addon', name: 'Multi-Region Disaster Recovery Module', qty: 1, unitPrice: 55000 };

  const rawSubtotal = baseItems.reduce((acc, i) => acc + i.qty * i.unitPrice, 0) + (includeAddon ? addonItem.unitPrice : 0);
  const discountAmount = Math.round(rawSubtotal * (discountPercent / 100));
  const netTotal = rawSubtotal - discountAmount;
  // Estimated baseline cost to illustrate margin
  const estimatedCost = Math.round(rawSubtotal * 0.32);
  const grossProfit = netTotal - estimatedCost;
  const marginPercent = ((grossProfit / netTotal) * 100).toFixed(1);
  const isHighDiscount = discountPercent >= 15;

  const formatINR = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="landing-page-container">
      {/* 1. HERO SECTION */}
      <section className="hero-editorial">
        <div className="hero-content">
          <div className="editorial-pill">
            <Sparkles size={14} className="pill-icon" />
            <span>REVENUE ENGINE & REVISION GOVERNANCE</span>
          </div>

          <h1 className="hero-headline">
            Every deal. Every revision.
            <br />
            <em className="headline-italic">In total harmony.</em>
          </h1>

          <p className="hero-lead">
            Unify high-velocity quote configuration, dynamic multi-tier approval policies,
            zero-stock-lock warehouse previews, and recurring milestone billing into one
            immutable, audit-grade revenue stream.
          </p>

          <div className="hero-actions">
            <Link href="/login" className="editorial-btn-primary">
              Open Workspace
              <ArrowRight size={17} />
            </Link>
            <a href="#simulator" className="editorial-btn-secondary">
              Explore Live Simulator
            </a>
          </div>

          <div className="hero-trust-ribbon">
            <div className="trust-item">
              <ShieldCheck size={16} className="text-teal" />
              <span>Zero-lock allocation safety</span>
            </div>
            <div className="trust-sep">·</div>
            <div className="trust-item">
              <Scale size={16} className="text-teal" />
              <span>Exact decimal pricing</span>
            </div>
            <div className="trust-sep">·</div>
            <div className="trust-item">
              <FileCheck2 size={16} className="text-teal" />
              <span>Customer-verified revisions</span>
            </div>
          </div>
        </div>

        {/* 2. HERO INTERACTIVE WORKSPACE SIMULATOR */}
        <div id="simulator" className="simulator-card-wrapper">
          <div className="simulator-window">
            {/* Window header */}
            <div className="simulator-topbar">
              <div className="simulator-dots">
                <span className="dot dot-red" />
                <span className="dot dot-amber" />
                <span className="dot dot-green" />
              </div>
              <div className="simulator-title">
                DealFlow360 Interactive Simulation &mdash; Nexa Systems &times; Acme Corp (Rev 03)
              </div>
              <div className="simulator-badge">
                <span className="pulse-dot" />
                ACTIVE ENGINE
              </div>
            </div>

            {/* Simulator Navigation Tabs */}
            <div className="simulator-tabs">
              <button
                type="button"
                className={`simulator-tab ${activeTab === 'quote' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('quote')}
              >
                <FileSpreadsheet size={15} />
                <span>1. Quotation &amp; Margins</span>
              </button>
              <button
                type="button"
                className={`simulator-tab ${activeTab === 'approvals' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('approvals')}
              >
                <ShieldCheck size={15} />
                <span>2. Approval Gate</span>
                {isHighDiscount && <span className="tab-alert">Requires Finance</span>}
              </button>
              <button
                type="button"
                className={`simulator-tab ${activeTab === 'fulfillment' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('fulfillment')}
              >
                <Package size={15} />
                <span>3. Split Preview (Safe)</span>
              </button>
              <button
                type="button"
                className={`simulator-tab ${activeTab === 'billing' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('billing')}
              >
                <CreditCard size={15} />
                <span>4. Automated Invoicing</span>
              </button>
            </div>

            {/* Tab 1: Quote Builder & Dynamic Margins */}
            {activeTab === 'quote' && (
              <div className="simulator-body">
                <div className="sim-meta-row">
                  <div>
                    <span className="sim-meta-label">Customer</span>
                    <strong className="sim-meta-value">Acme Corporation Ltd (Tier 1)</strong>
                  </div>
                  <div>
                    <span className="sim-meta-label">Price List</span>
                    <strong className="sim-meta-value">Enterprise Standard 2026</strong>
                  </div>
                  <div>
                    <span className="sim-meta-label">Currency</span>
                    <strong className="sim-meta-value">INR (₹) Canonical Decimal</strong>
                  </div>
                  <div>
                    <span className="sim-meta-label">Status</span>
                    <span className="sim-status-pill in-review">IN NEGOTIATION</span>
                  </div>
                </div>

                {/* Line items table */}
                <div className="sim-table-wrap">
                  <table className="sim-table">
                    <thead>
                      <tr>
                        <th>Item &amp; Description</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Unit Price</th>
                        <th className="text-right">Net Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {baseItems.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.name}</strong>
                            <small>Canonical SKU · Production deployment</small>
                          </td>
                          <td className="text-right">{item.qty}</td>
                          <td className="text-right">{formatINR(item.unitPrice)}</td>
                          <td className="text-right font-bold">{formatINR(item.qty * item.unitPrice)}</td>
                        </tr>
                      ))}
                      {includeAddon && (
                        <tr className="addon-row">
                          <td>
                            <div className="addon-title-flex">
                              <Sparkles size={14} className="text-teal" />
                              <strong>{addonItem.name}</strong>
                              <span className="recom-chip">Smart Add-on</span>
                            </div>
                            <small>Auto-recommended from co-purchase pattern</small>
                          </td>
                          <td className="text-right">{addonItem.qty}</td>
                          <td className="text-right">{formatINR(addonItem.unitPrice)}</td>
                          <td className="text-right font-bold">{formatINR(addonItem.unitPrice)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Interactive Controls & Co-purchase Suggestion */}
                <div className="sim-interactive-shelf">
                  <div className="interactive-control-box">
                    <div className="control-header">
                      <label htmlFor="discount-range">
                        <strong>Simulate Custom Discount:</strong>{' '}
                        <span className="discount-badge">{discountPercent}%</span>
                      </label>
                      <span className="text-muted text-xs">Threshold alert at 15%</span>
                    </div>
                    <input
                      id="discount-range"
                      type="range"
                      min="0"
                      max="30"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(Number(e.target.value))}
                      className="sim-slider"
                    />
                    <div className="slider-ticks">
                      <span>0% (Standard)</span>
                      <span>15% (Policy Gate)</span>
                      <span>30% (Max)</span>
                    </div>

                    {isHighDiscount ? (
                      <div className="policy-callout-warning">
                        <ShieldCheck size={16} />
                        <div>
                          <strong>Automated Policy Rule Triggered:</strong>
                          <p>
                            Discount exceeds 15%. This revision will automatically branch for Finance Ops
                            concurrence before customer acceptance is unlocked.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="policy-callout-safe">
                        <CheckCircle2 size={16} />
                        <div>
                          <strong>Within Standard Authority:</strong>
                          <p>Sales Rep authority allows fast-path approval up to 14.99% discount.</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="sim-recommendation-card">
                    <div className="recom-header">
                      <Zap size={15} className="text-teal" />
                      <span>Co-Purchase Intelligence</span>
                    </div>
                    <h4>Disaster Recovery Module</h4>
                    <p>87% of similar enterprise customers add multi-region failover.</p>
                    <button
                      type="button"
                      className={`recom-toggle-btn ${includeAddon ? 'is-included' : ''}`}
                      onClick={() => setIncludeAddon(!includeAddon)}
                    >
                      {includeAddon ? '✓ Included in Revision' : '+ Add Suggested Module (+₹55,000)'}
                    </button>
                  </div>
                </div>

                {/* Totals & Margin Bar */}
                <div className="sim-totals-strip">
                  <div className="total-metric">
                    <span>List Subtotal</span>
                    <strong>{formatINR(rawSubtotal)}</strong>
                  </div>
                  <div className="total-metric">
                    <span>Applied Discount</span>
                    <strong className="text-amber">-{formatINR(discountAmount)} ({discountPercent}%)</strong>
                  </div>
                  <div className="total-metric">
                    <span>Proposed Net Price</span>
                    <strong className="text-teal">{formatINR(netTotal)}</strong>
                  </div>
                  <div className="total-metric margin-metric">
                    <span>Gross Margin Health</span>
                    <strong className={Number(marginPercent) > 60 ? 'text-emerald' : 'text-amber'}>
                      {marginPercent}%
                    </strong>
                    <div className="sim-margin-bar">
                      <div
                        className="sim-margin-fill"
                        style={{ width: `${Math.min(Number(marginPercent), 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Approval Gate & Governance */}
            {activeTab === 'approvals' && (
              <div className="simulator-body">
                <div className="policy-banner">
                  <ShieldCheck size={18} className="text-teal" />
                  <div>
                    <strong>Parallel Governance State Machine</strong>
                    <p>
                      Rules evaluate dynamically on every saved revision. Changes to pricing, quantities, or terms
                      invalidate previous sign-offs to preserve immutable audit compliance.
                    </p>
                  </div>
                </div>

                <div className="approval-tree">
                  <div className="approval-node is-approved">
                    <div className="node-marker">✓</div>
                    <div className="node-details">
                      <strong>1. Commercial Deal Structure</strong>
                      <span className="node-sub">Sales Rep (Arjun K.) &middot; Submitted at 10:14 IST</span>
                      <p>Configured initial Revision 03 proposal within customer price tier.</p>
                    </div>
                    <span className="node-status status-done">PASSED</span>
                  </div>

                  <div className="approval-connector is-approved" />

                  <div className="approval-node is-approved">
                    <div className="node-marker">✓</div>
                    <div className="node-details">
                      <strong>2. Sales Management Review</strong>
                      <span className="node-sub">Sales Manager (Sana M.) &middot; Approved at 10:42 IST</span>
                      <p>Territory alignment verified. Account credit rating verified (Score: AA).</p>
                    </div>
                    <span className="node-status status-done">APPROVED</span>
                  </div>

                  <div className="approval-connector" />

                  <div className={`approval-node ${isHighDiscount ? 'is-active-warning' : 'is-bypassed'}`}>
                    <div className="node-marker">{isHighDiscount ? '!' : '—'}</div>
                    <div className="node-details">
                      <strong>3. Finance Operations &amp; Margin Guardrail</strong>
                      <span className="node-sub">
                        {isHighDiscount
                          ? 'Escalated: Discount at ' + discountPercent + '% (Policy threshold: 15%)'
                          : 'Bypassed: Discount under 15% threshold'}
                      </span>
                      <p>
                        {isHighDiscount
                          ? 'Finance Director (Farah H.) has been notified for margin variance concurrence.'
                          : 'Standard pricing authority applied. No manual finance escalation required.'}
                      </p>
                    </div>
                    <span className={`node-status ${isHighDiscount ? 'status-pending' : 'status-waived'}`}>
                      {isHighDiscount ? 'PENDING DECISION' : 'AUTO-CLEARED'}
                    </span>
                  </div>

                  <div className="approval-connector" />

                  <div className="approval-node">
                    <div className="node-marker">4</div>
                    <div className="node-details">
                      <strong>4. Customer Confirmation &amp; Acceptance</strong>
                      <span className="node-sub">Enterprise Buyer (Neha P. &middot; Acme Corp)</span>
                      <p>External deal portal is ready for client review and legal acceptance.</p>
                    </div>
                    <span className="node-status status-locked">READY FOR BUYER</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Split Preview (Safe) */}
            {activeTab === 'fulfillment' && (
              <div className="simulator-body">
                <div className="rule-box">
                  <div className="rule-badge">THE ARCHITECTURAL COMMITMENT RULE</div>
                  <p>
                    <strong>Read-only warehouse split suggestions are displayed for logistics planning.</strong>{' '}
                    Per DealFlow360 governance, suggestions <em>never</em> reserve physical stock, create warehouse
                    pick-lists, or generate invoices until the exact revision is accepted by the customer.
                  </p>
                </div>

                <div className="warehouse-grid">
                  <div className="warehouse-card">
                    <div className="wh-header">
                      <Truck size={17} className="text-teal" />
                      <div>
                        <strong>Hub 01: Mumbai Central DC</strong>
                        <span className="wh-sub">Primary Regional Distribution</span>
                      </div>
                    </div>
                    <div className="wh-stats">
                      <div>
                        <span>Preview Allocation</span>
                        <strong>180 Units (60%)</strong>
                      </div>
                      <div>
                        <span>Available On-Hand</span>
                        <strong className="text-emerald">420 Units</strong>
                      </div>
                    </div>
                    <div className="wh-status-badge preview">PREVIEW ONLY &middot; NOT RESERVED</div>
                  </div>

                  <div className="warehouse-card">
                    <div className="wh-header">
                      <Truck size={17} className="text-teal" />
                      <div>
                        <strong>Hub 02: Frankfurt West DC</strong>
                        <span className="wh-sub">European Redundancy Point</span>
                      </div>
                    </div>
                    <div className="wh-stats">
                      <div>
                        <span>Preview Allocation</span>
                        <strong>90 Units (30%)</strong>
                      </div>
                      <div>
                        <span>Available On-Hand</span>
                        <strong className="text-emerald">210 Units</strong>
                      </div>
                    </div>
                    <div className="wh-status-badge preview">PREVIEW ONLY &middot; NOT RESERVED</div>
                  </div>

                  <div className="warehouse-card">
                    <div className="wh-header">
                      <Truck size={17} className="text-teal" />
                      <div>
                        <strong>Hub 03: Singapore East DC</strong>
                        <span className="wh-sub">APAC Edge Fulfillment</span>
                      </div>
                    </div>
                    <div className="wh-stats">
                      <div>
                        <span>Preview Allocation</span>
                        <strong>30 Units (10%)</strong>
                      </div>
                      <div>
                        <span>Available On-Hand</span>
                        <strong className="text-emerald">95 Units</strong>
                      </div>
                    </div>
                    <div className="wh-status-badge preview">PREVIEW ONLY &middot; NOT RESERVED</div>
                  </div>
                </div>

                <div className="wh-callout">
                  <Lock size={15} />
                  <span>
                    When Acme confirms Revision 03, the canonical fulfillment service will execute transactional stock
                    reservation across these three hubs simultaneously.
                  </span>
                </div>
              </div>
            )}

            {/* Tab 4: Automated Invoicing */}
            {activeTab === 'billing' && (
              <div className="simulator-body">
                <div className="sim-meta-row">
                  <div>
                    <span className="sim-meta-label">Billing Model</span>
                    <strong className="sim-meta-value">Milestone + Annual Recurring</strong>
                  </div>
                  <div>
                    <span className="sim-meta-label">Payment Terms</span>
                    <strong className="sim-meta-value">Net 30 &middot; Direct Debit / Wire</strong>
                  </div>
                  <div>
                    <span className="sim-meta-label">Payment Gateway</span>
                    <strong className="sim-meta-value">Stripe Connected Webhooks</strong>
                  </div>
                </div>

                <div className="invoicing-timeline">
                  <div className="invoice-schedule-item">
                    <div className="inv-badge milestone">MILESTONE 1</div>
                    <div className="inv-content">
                      <div className="inv-row">
                        <strong>Deployment &amp; Cloud Setup Deposit</strong>
                        <span className="inv-amount">{formatINR(Math.round(netTotal * 0.4))}</span>
                      </div>
                      <p>Triggered on contract execution &middot; Prorated invoice auto-generates in PDF &amp; XLSX.</p>
                      <span className="inv-tag tag-ready">PREVIEW READY</span>
                    </div>
                  </div>

                  <div className="invoice-schedule-item">
                    <div className="inv-badge recurring">RECURRING</div>
                    <div className="inv-content">
                      <div className="inv-row">
                        <strong>Quarterly Platform Licensing</strong>
                        <span className="inv-amount">{formatINR(Math.round((netTotal * 0.6) / 4))} / quarter</span>
                      </div>
                      <p>Starts post-acceptance with calendar month-end clamping &middot; 4 cycles auto-scheduled.</p>
                      <span className="inv-tag tag-sched">SCHEDULED UPON SIGN-OFF</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. METRICS / IMPACT BANNER */}
      <section className="metrics-ribbon">
        <div className="metrics-container">
          <div className="metric-box">
            <span className="metric-num">₹4.8B+</span>
            <span className="metric-label">Annual Revenue Orchestrated</span>
            <small className="metric-sub">Across 350+ enterprise deal cycles</small>
          </div>
          <div className="metric-divider" />
          <div className="metric-box">
            <span className="metric-num">64%</span>
            <span className="metric-label">Reduction in Deal Cycles</span>
            <small className="metric-sub">From first draft to verified sign-off</small>
          </div>
          <div className="metric-divider" />
          <div className="metric-box">
            <span className="metric-num">0%</span>
            <span className="metric-label">Silent Margin Erosion</span>
            <small className="metric-sub">Real-time guardrails on every line item</small>
          </div>
          <div className="metric-divider" />
          <div className="metric-box">
            <span className="metric-num">100%</span>
            <span className="metric-label">Audit-Grade Traceability</span>
            <small className="metric-sub">Every amendment generates a versioned diff</small>
          </div>
        </div>
      </section>

      {/* 4. FEATURE BENTO GRID */}
      <section className="bento-section" id="product">
        <div className="section-head">
          <span className="eyebrow-accent">PRECISION ARCHITECTURE</span>
          <h2 className="section-title">Engineered for high-stakes revenue operations.</h2>
          <p className="section-subtitle">
            Every feature is designed around transactional integrity: canonical math, explicit state machines, and zero
            unintended side-effects.
          </p>
        </div>

        <div className="bento-grid">
          {/* Card 1: Large Feature */}
          <div className="bento-card bento-hero-card">
            <div className="bento-badge">
              <Zap size={14} />
              <span>CANONICAL ENGINE</span>
            </div>
            <h3>Decimal-Accurate CPQ &amp; Co-Purchase Intelligence</h3>
            <p>
              Traditional CPQs drift on fractional currency and tiered discounts. DealFlow360 executes high-precision
              calculations via Decimal.js, pairing customer-specific pricebooks with real-time co-purchase suggestions
              that lift gross margins by an average of 14%.
            </p>
            <div className="bento-visual">
              <div className="mini-calc-demo">
                <div className="calc-row">
                  <span>Customer Tier Multiplier</span>
                  <span className="font-mono text-teal">0.88000 &times;</span>
                </div>
                <div className="calc-row">
                  <span>Incremental Co-purchase Margin</span>
                  <span className="font-mono text-emerald">+4.2%</span>
                </div>
                <div className="calc-row">
                  <span>Rounding Precision</span>
                  <span className="font-mono">Bankers Rounding &middot; 4 Decimals</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Revision State Machine */}
          <div className="bento-card">
            <div className="bento-badge">
              <Layers size={14} />
              <span>REVISION IMMUTABILITY</span>
            </div>
            <h3>No Silent Overwrites. Every Edit Is a Revision.</h3>
            <p>
              When a buyer requests a date change or discount adjustment, the system preserves the previous proposal and
              forks an explicit revision. Stale approvals never authorize commitments.
            </p>
            <div className="revision-diff-chip">
              <span className="diff-pill old">Rev 02: ₹3,80,000 (Archived)</span>
              <ChevronRight size={14} />
              <span className="diff-pill new">Rev 03: ₹3,45,000 (Active)</span>
            </div>
          </div>

          {/* Card 3: Preview-Safe Logistics */}
          <div className="bento-card">
            <div className="bento-badge">
              <Truck size={14} />
              <span>STOCK SAFETY RULE</span>
            </div>
            <h3>Two-Stage Inventory Allocation</h3>
            <p>
              Warehouse managers see split previews across global facilities without locking physical inventory during
              prolonged deal negotiations. Stock is transactionally bound only after customer acceptance.
            </p>
            <div className="safety-rule-tag">
              <Lock size={13} />
              <span>Strict Rule: Read-only previews never commit inventory</span>
            </div>
          </div>

          {/* Card 4: Customer Portal */}
          <div className="bento-card bento-wide-card">
            <div className="bento-badge">
              <Users2 size={14} />
              <span>CUSTOMER EXPERIENCE</span>
            </div>
            <div className="bento-wide-flex">
              <div>
                <h3>Restricted, Self-Contained Buyer Portal</h3>
                <p>
                  Give enterprise buyers a frictionless, branded workspace. Customers review current revision terms, line
                  breakdowns, and milestone dates, and can propose changes or digitally confirm in seconds.
                </p>
                <div className="portal-points">
                  <div>✓ Strict customer-scoped security boundaries</div>
                  <div>✓ In-thread revision negotiation &amp; notes</div>
                  <div>✓ Instant PDF / XLSX export with verifiable watermark</div>
                </div>
              </div>
              <div className="portal-mini-preview">
                <div className="portal-preview-card">
                  <div className="pp-header">
                    <span className="pp-logo">Acme &middot; Deal Portal</span>
                    <span className="pp-status">APPROVED &middot; READY TO SIGN</span>
                  </div>
                  <div className="pp-amount">{formatINR(345000)}</div>
                  <div className="pp-action">Accept Revision 03 Terms &rarr;</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. THE 3-STEP JOURNEY */}
      <section className="journey-section" id="process">
        <div className="section-head">
          <span className="eyebrow-accent">REVENUE LIFECYCLE</span>
          <h2 className="section-title">From initial configuration to accepted revenue.</h2>
          <p className="section-subtitle">
            Three disciplined stages that replace weeks of spreadsheet chaos with clarity and speed.
          </p>
        </div>

        <div className="journey-steps-grid">
          <div className="journey-card">
            <div className="journey-num">01</div>
            <h3>Configure</h3>
            <p>
              Sales reps select customer pricebooks, bundle complex products, and test discounts with real-time margin
              feedback and intelligent add-on recommendations.
            </p>
            <ul className="journey-list">
              <li>Customer-specific price tiers</li>
              <li>Automated co-purchase suggestions</li>
              <li>Real-time gross profit guardrails</li>
            </ul>
          </div>

          <div className="journey-card">
            <div className="journey-num">02</div>
            <h3>Concur</h3>
            <p>
              Policy engines automatically route the quote through required internal approvals based on discount
              thresholds and payment terms before opening client negotiation.
            </p>
            <ul className="journey-list">
              <li>Parallel manager &amp; finance reviews</li>
              <li>Immutable revision version history</li>
              <li>Client-side negotiation thread</li>
            </ul>
          </div>

          <div className="journey-card">
            <div className="journey-num">03</div>
            <h3>Commit</h3>
            <p>
              Upon customer confirmation of the approved terms, the transactional engine allocates physical warehouse
              stock, activates recurring schedules, and issues invoices.
            </p>
            <ul className="journey-list">
              <li>Atomic stock reservation across hubs</li>
              <li>Prorated milestone invoice creation</li>
              <li>Direct payment via integrated gateways</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 6. ROLE-BASED VALUE SELECTOR */}
      <section className="roles-section">
        <div className="section-head">
          <span className="eyebrow-accent">DESIGNED FOR REVENUE TEAMS</span>
          <h2 className="section-title">Tailored workflows for every decision maker.</h2>
        </div>

        <div className="roles-tabs-nav">
          <button
            type="button"
            className={`role-tab-btn ${roleTab === 'rep' ? 'is-active' : ''}`}
            onClick={() => setRoleTab('rep')}
          >
            Sales Representatives
          </button>
          <button
            type="button"
            className={`role-tab-btn ${roleTab === 'manager' ? 'is-active' : ''}`}
            onClick={() => setRoleTab('manager')}
          >
            Sales Leadership
          </button>
          <button
            type="button"
            className={`role-tab-btn ${roleTab === 'finance' ? 'is-active' : ''}`}
            onClick={() => setRoleTab('finance')}
          >
            Finance &amp; Operations
          </button>
          <button
            type="button"
            className={`role-tab-btn ${roleTab === 'buyer' ? 'is-active' : ''}`}
            onClick={() => setRoleTab('buyer')}
          >
            Enterprise Buyers
          </button>
        </div>

        <div className="role-content-box">
          {roleTab === 'rep' && (
            <div className="role-grid">
              <div>
                <span className="role-pill">ACCELERATE QUOTE-TO-CLOSE</span>
                <h3>Build winning enterprise quotes in under five minutes.</h3>
                <p>
                  Stop second-guessing discount rules and waiting on email threads. DealFlow360 gives reps immediate
                  margin clarity, automatic co-purchase suggestions that increase deal size, and real-time status on
                  customer portal activity.
                </p>
                <div className="role-checkmarks">
                  <div>✓ Instant customer pricebook resolution</div>
                  <div>✓ Automated one-click co-purchase add-ons</div>
                  <div>✓ Instant notification when customer views or confirms quote</div>
                </div>
              </div>
              <div className="role-quote-callout">
                <blockquote>
                  &ldquo;I used to spend 3 hours a day reconciling custom pricing and waiting on approvals. With
                  DealFlow360, I send compliant quotes in minutes and close faster.&rdquo;
                </blockquote>
                <div className="role-author">
                  <strong>Arjun Kapoor</strong>
                  <span>Senior Enterprise Account Executive</span>
                </div>
              </div>
            </div>
          )}

          {roleTab === 'manager' && (
            <div className="role-grid">
              <div>
                <span className="role-pill">GOVERNANCE &amp; VISIBILITY</span>
                <h3>Protect gross margins without slowing down reps.</h3>
                <p>
                  Maintain absolute visibility into pipeline stages, discount distributions, and deal health flags.
                  Review and sign off on escalated proposals from desktop or mobile with one tap.
                </p>
                <div className="role-checkmarks">
                  <div>✓ Real-time deal health alerts and stagnation tracking</div>
                  <div>✓ Single-click multi-tier approval decisions</div>
                  <div>✓ Comprehensive revision audit trails</div>
                </div>
              </div>
              <div className="role-quote-callout">
                <blockquote>
                  &ldquo;DealFlow360 gives me immediate visibility into margin erosion before quotes leave the building.
                  Our team increased average deal profitability by 11%.&rdquo;
                </blockquote>
                <div className="role-author">
                  <strong>Sana Merchant</strong>
                  <span>VP of Global Commercial Sales</span>
                </div>
              </div>
            </div>
          )}

          {roleTab === 'finance' && (
            <div className="role-grid">
              <div>
                <span className="role-pill">CONTROL &amp; AUTOMATION</span>
                <h3>Eliminate billing reconciliation and phantom inventory locks.</h3>
                <p>
                  Enforce strict margin floors and payment terms automatically. Preview warehouse splits and recurring
                  invoice schedules without risking stock reservations or ledger inconsistencies.
                </p>
                <div className="role-checkmarks">
                  <div>✓ Zero-phantom stock reservation architecture</div>
                  <div>✓ Prorated milestone and recurring billing schedules</div>
                  <div>✓ Export-ready PDF/Excel audit reports</div>
                </div>
              </div>
              <div className="role-quote-callout">
                <blockquote>
                  &ldquo;The separation of preview splits from transactional stock allocation eliminated our inventory
                  discrepancies completely. Finance and sales are finally in sync.&rdquo;
                </blockquote>
                <div className="role-author">
                  <strong>Farah Haque</strong>
                  <span>Head of Revenue Operations &amp; Finance</span>
                </div>
              </div>
            </div>
          )}

          {roleTab === 'buyer' && (
            <div className="role-grid">
              <div>
                <span className="role-pill">TRANSPARENCY &amp; TRUST</span>
                <h3>A polished, frictionless portal for enterprise procurement.</h3>
                <p>
                  Enterprise buyers get an ad-free, secure portal to inspect exact bill-of-materials, review milestone
                  schedules, request specific item adjustments, and sign off digitally.
                </p>
                <div className="role-checkmarks">
                  <div>✓ Clean, distraction-free commercial portal</div>
                  <div>✓ Transparent line-item pricing and discounts</div>
                  <div>✓ Instant digital acceptance with downloadable formal agreement</div>
                </div>
              </div>
              <div className="role-quote-callout">
                <blockquote>
                  &ldquo;Reviewing and accepting vendor contracts is usually a nightmare of PDF redlines. DealFlow360 made
                  procurement verification completely painless.&rdquo;
                </blockquote>
                <div className="role-author">
                  <strong>Neha Patel</strong>
                  <span>Procurement Director, Acme Industries</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 7. EDITORIAL TESTIMONIAL BANNER */}
      <section className="testimonial-section">
        <div className="testimonial-card">
          <div className="testimonial-stars">★ ★ ★ ★ ★</div>
          <blockquote className="testimonial-quote">
            &ldquo;DealFlow360 replaced four disconnected spreadsheets and eliminated weeks of email back-and-forth
            between our sales and finance teams. Our average proposal-to-cash turnaround went from 19 days down to 48
            hours, with 100% audit compliance.&rdquo;
          </blockquote>
          <div className="testimonial-meta">
            <strong>Karan Singhania</strong>
            <span>Chief Operating Officer, Horizon Infrastructure Group</span>
          </div>
        </div>
      </section>

      {/* 8. FINAL CALL TO ACTION */}
      <section className="cta-section">
        <div className="cta-box">
          <span className="eyebrow-accent text-teal">READY TO ACCELERATE YOUR REVENUE ENGINE?</span>
          <h2 className="cta-headline">Bring discipline and velocity to every deal.</h2>
          <p className="cta-lead">
            Explore DealFlow360 with live seeded demo personas or sign in with your enterprise workspace credentials.
          </p>
          <div className="cta-buttons">
            <Link href="/login" className="editorial-btn-primary cta-btn-large">
              Enter Workspace
              <ArrowRight size={18} />
            </Link>
            <Link href="/signup" className="editorial-btn-secondary cta-btn-large">
              Request Access
            </Link>
          </div>
          <div className="cta-footer-note">
            <span>Instant sandbox credentials available &middot; No credit card required</span>
          </div>
        </div>
      </section>

      {/* 9. REFINED FOOTER */}
      <footer className="editorial-footer">
        <div className="footer-top">
          <div className="footer-brand">
            <span className="footer-logo">DealFlow360</span>
            <p>The enterprise revenue governance engine for high-velocity commercial operations.</p>
            <div className="footer-status">
              <span className="status-dot online" />
              <span>System Operational &middot; Decimal Engine Verified</span>
            </div>
          </div>
          <div className="footer-links-grid">
            <div className="footer-col">
              <strong>Platform</strong>
              <Link href="/login">Workspace Login</Link>
              <Link href="/signup">Request Access</Link>
              <a href="#simulator">Deal Simulator</a>
              <a href="#product">Architecture</a>
            </div>
            <div className="footer-col">
              <strong>Governance</strong>
              <a href="#process">Revision Control</a>
              <a href="#simulator">Approval Matrix</a>
              <a href="#simulator">Fulfillment Rules</a>
              <Link href="/portal">Customer Portal</Link>
            </div>
            <div className="footer-col">
              <strong>Compliance</strong>
              <span>SOC2 Type II Ready</span>
              <span>Exact Decimal Grouping</span>
              <span>Immutable Audit Logs</span>
              <span>PostgreSQL Scoped</span>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>&copy; {new Date().getFullYear()} DealFlow360 Enterprise Revenue Operations. All rights reserved.</span>
          <div className="footer-bottom-links">
            <Link href="/login">Sign in</Link>
            <Link href="/portal">Customer Access</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
