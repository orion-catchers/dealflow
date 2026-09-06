'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  CreditCard,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Info,
  Layers,
  Lock,
  Minus,
  Package,
  Percent,
  Plus,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
  Users2,
  Zap,
  X
} from 'lucide-react';

interface LandingPageProps {
  onOpenWorkspace?: () => void;
}

interface SimulatorItem {
  id: string;
  name: string;
  sku: string;
  qty: number;
  unitPrice: number;
  description: string;
}

interface DealPreset {
  id: string;
  title: string;
  customerName: string;
  customerTier: string;
  priceList: string;
  currency: string;
  revision: string;
  defaultDiscount: number;
  items: SimulatorItem[];
  addon: SimulatorItem;
  addonPitch: string;
  addonStat: string;
}

const DEAL_PRESETS: Record<'cloud' | 'hardware', DealPreset> = {
  cloud: {
    id: 'cloud',
    title: 'Enterprise Cloud Suite (High Margin)',
    customerName: 'Acme Corporation Ltd',
    customerTier: 'Tier 1 Enterprise',
    priceList: 'Enterprise Cloud Standard 2026',
    currency: 'INR (₹)',
    revision: 'Rev 03',
    defaultDiscount: 12,
    items: [
      {
        id: 'c1',
        name: 'Enterprise Cloud Compute Cluster',
        sku: 'SKU-CLOUD-ENT',
        qty: 1,
        unitPrice: 320000,
        description: 'Dedicated virtual VPC with 99.99% SLA'
      },
      {
        id: 'c2',
        name: 'High-Throughput API Gateway Nodes',
        sku: 'SKU-API-GW',
        qty: 4,
        unitPrice: 45000,
        description: '10,000 req/sec ingress with low-latency edge caching'
      }
    ],
    addon: {
      id: 'c-addon',
      name: 'Multi-Region Disaster Recovery Module',
      sku: 'SKU-DR-ACTIVE',
      qty: 1,
      unitPrice: 55000,
      description: 'Zero-RPO synchronous replication across 3 availability zones'
    },
    addonPitch: '87% of similar enterprise cloud deals include multi-region failover.',
    addonStat: '+₹55,000 / +4.2% margin lift'
  },
  hardware: {
    id: 'hardware',
    title: 'Global Telemetry & Edge Gateway (Logistics)',
    customerName: 'Zenith Logistics International',
    customerTier: 'Tier 2 Logistics Partner',
    priceList: 'Hardware & Edge Device Book 2026',
    currency: 'INR (₹)',
    revision: 'Rev 01',
    defaultDiscount: 8,
    items: [
      {
        id: 'h1',
        name: 'Industrial IoT Telemetry Hub v4',
        sku: 'SKU-IOT-HUB-4',
        qty: 10,
        unitPrice: 28000,
        description: 'IP67 ruggedized sensors with 5G fall-back'
      },
      {
        id: 'h2',
        name: 'Fleet Edge Orchestration Controller',
        sku: 'SKU-EDGE-ORCH',
        qty: 2,
        unitPrice: 65000,
        description: 'On-premise real-time telemetry processing node'
      }
    ],
    addon: {
      id: 'h-addon',
      name: 'Cold-Chain Environmental Calibration Kit',
      sku: 'SKU-CALIB-KIT',
      qty: 1,
      unitPrice: 42000,
      description: 'Pharma-grade temperature & humidity compliance probes'
    },
    addonPitch: 'Recommended based on Zenith’s supply chain compliance profile.',
    addonStat: '+₹42,000 / +3.8% margin lift'
  }
};

export default function LandingPage({ onOpenWorkspace }: LandingPageProps) {
  // Simulator State
  const [activePresetKey, setActivePresetKey] = useState<'cloud' | 'hardware'>('cloud');
  const activePreset = DEAL_PRESETS[activePresetKey];

  const [activeTab, setActiveTab] = useState<'quote' | 'approvals' | 'fulfillment' | 'billing'>('quote');
  const [quantities, setQuantities] = useState<Record<string, number>>({
    c1: 1,
    c2: 4,
    h1: 10,
    h2: 2
  });
  const [discountPercent, setDiscountPercent] = useState<number>(12);
  const [includeAddon, setIncludeAddon] = useState<boolean>(true);
  const [simulatedFinanceSignoff, setSimulatedFinanceSignoff] = useState<boolean>(false);
  const [roleTab, setRoleTab] = useState<'rep' | 'manager' | 'finance' | 'buyer'>('rep');

  // ROI Calculator State
  const [roiDealsPerMonth, setRoiDealsPerMonth] = useState<number>(45);
  const [roiAverageDealValue, setRoiAverageDealValue] = useState<number>(1200000); // 12 Lakhs

  // FAQ Accordion State
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  // Switch presets cleanly
  const handlePresetSwitch = (key: 'cloud' | 'hardware') => {
    setActivePresetKey(key);
    setDiscountPercent(DEAL_PRESETS[key].defaultDiscount);
    setSimulatedFinanceSignoff(false);
  };

  // Stepper handlers
  const handleQtyChange = (itemId: string, delta: number) => {
    setQuantities(prev => {
      const current = prev[itemId] ?? 1;
      const next = Math.max(1, Math.min(50, current + delta));
      return { ...prev, [itemId]: next };
    });
  };

  // Active items calculation
  const currentItems = activePreset.items.map(item => ({
    ...item,
    qty: quantities[item.id] ?? item.qty
  }));

  const rawSubtotal = currentItems.reduce((acc, i) => acc + i.qty * i.unitPrice, 0) +
    (includeAddon ? activePreset.addon.unitPrice : 0);

  const discountAmount = Math.round(rawSubtotal * (discountPercent / 100));
  const netTotal = rawSubtotal - discountAmount;
  const estimatedCost = Math.round(rawSubtotal * 0.34);
  const grossProfit = netTotal - estimatedCost;
  const marginPercent = netTotal > 0 ? ((grossProfit / netTotal) * 100).toFixed(1) : '0.0';
  const isHighDiscount = discountPercent >= 15;

  const formatINR = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // ROI calculations
  const calculatedRoi = useMemo(() => {
    const annualDealVolume = roiDealsPerMonth * 12;
    const annualGrossPipeline = annualDealVolume * roiAverageDealValue;
    // Industry benchmark: 14.5 hours saved per deal across rep, manager, finance
    const hoursSavedPerDeal = 14.5;
    const totalHoursSaved = Math.round(annualDealVolume * hoursSavedPerDeal);
    // 3.2% average margin leakage prevented via automated guardrails & co-purchase lift
    const marginLeakagePrevented = Math.round(annualGrossPipeline * 0.032);
    return {
      annualGrossPipeline,
      totalHoursSaved,
      marginLeakagePrevented
    };
  }, [roiDealsPerMonth, roiAverageDealValue]);

  return (
    <div className="landing-page-container">
      {/* 1. HERO SECTION */}
      <section className="hero-editorial">
        <div className="hero-content">
          {/* Release Badge */}
          <div className="editorial-pill">
            <span className="pill-dot-pulse" />
            <Sparkles size={13} className="pill-icon" />
            <span>DEALFLOW360 v2.6 &middot; DECIMAL CPQ &amp; REVISION GOVERNANCE</span>
          </div>

          <h1 className="hero-headline">
            Every deal. Every revision.
            <br />
            <em className="headline-italic">In total harmony.</em>
          </h1>

          <p className="hero-lead">
            Bridge the gap between ambitious sales velocity and rigid finance guardrails.
            Quote complex enterprise bundles with bank-grade decimal precision, preview logistics
            without locking warehouse inventory, and secure sign-offs through verifiable customer revisions.
          </p>

          <div className="hero-actions">
            <Link href="/login" className="editorial-btn-primary">
              Launch Demo Workspace
              <ArrowRight size={17} />
            </Link>
            <a href="#simulator" className="editorial-btn-secondary">
              <Zap size={16} className="text-teal" />
              Explore Live Simulator
            </a>
          </div>

          {/* Seeded Quick Notice */}
          <div className="hero-seed-hint">
            <span>Pre-seeded with <strong>Admin</strong>, <strong>Sales Rep</strong>, <strong>Finance Director</strong> &amp; <strong>3 Customer Portals</strong> &middot; No setup needed</span>
          </div>

          <div className="hero-trust-ribbon">
            <div className="trust-item">
              <ShieldCheck size={16} className="text-teal" />
              <span>The Commitment Rule (Zero Phantom Locks)</span>
            </div>
            <div className="trust-sep">&middot;</div>
            <div className="trust-item">
              <Scale size={16} className="text-teal" />
              <span>Exact Decimal.js Arithmetic</span>
            </div>
            <div className="trust-sep">&middot;</div>
            <div className="trust-item">
              <FileCheck2 size={16} className="text-teal" />
              <span>Immutable Revision History</span>
            </div>
          </div>
        </div>

        {/* 2. HERO INTERACTIVE WORKSPACE SIMULATOR */}
        <div id="simulator" className="simulator-card-wrapper">
          {/* Preset Selector bar */}
          <div className="simulator-preset-selector">
            <span className="preset-label">SELECT SCENARIO:</span>
            <div className="preset-buttons">
              <button
                type="button"
                className={`preset-btn ${activePresetKey === 'cloud' ? 'is-active' : ''}`}
                onClick={() => handlePresetSwitch('cloud')}
              >
                <Boxes size={14} />
                <span>Scenario A: Cloud Infrastructure Deal</span>
              </button>
              <button
                type="button"
                className={`preset-btn ${activePresetKey === 'hardware' ? 'is-active' : ''}`}
                onClick={() => handlePresetSwitch('hardware')}
              >
                <Truck size={14} />
                <span>Scenario B: Edge Logistics &amp; IoT Cluster</span>
              </button>
            </div>
          </div>

          <div className="simulator-window">
            {/* Window header */}
            <div className="simulator-topbar">
              <div className="simulator-dots">
                <span className="dot dot-red" />
                <span className="dot dot-amber" />
                <span className="dot dot-green" />
              </div>
              <div className="simulator-title">
                DealFlow360 Live Simulator &mdash; {activePreset.customerName} ({activePreset.revision})
              </div>
              <div className="simulator-badge">
                <span className="pulse-dot" />
                CANONICAL ENGINE ACTIVE
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
                {isHighDiscount && (
                  <span className="tab-alert">
                    {simulatedFinanceSignoff ? 'Finance Signed' : 'Requires Finance'}
                  </span>
                )}
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
                <span>4. Milestone Invoicing</span>
              </button>
            </div>

            {/* Tab 1: Quote Builder & Dynamic Margins */}
            {activeTab === 'quote' && (
              <div className="simulator-body">
                <div className="sim-meta-row">
                  <div>
                    <span className="sim-meta-label">Customer</span>
                    <strong className="sim-meta-value">{activePreset.customerName}</strong>
                    <small className="text-teal font-medium">{activePreset.customerTier}</small>
                  </div>
                  <div>
                    <span className="sim-meta-label">Price List</span>
                    <strong className="sim-meta-value">{activePreset.priceList}</strong>
                  </div>
                  <div>
                    <span className="sim-meta-label">Currency Precision</span>
                    <strong className="sim-meta-value">INR (₹) &middot; Decimal.js (4-dec)</strong>
                  </div>
                  <div>
                    <span className="sim-meta-label">Revision State</span>
                    <span className="sim-status-pill in-review">
                      {isHighDiscount && !simulatedFinanceSignoff ? 'ESCALATION PENDING' : 'PROPOSED · REV 03'}
                    </span>
                  </div>
                </div>

                {/* Line items table with interactive steppers */}
                <div className="sim-table-wrap">
                  <table className="sim-table">
                    <thead>
                      <tr>
                        <th>Item &amp; Description</th>
                        <th className="text-center" style={{ width: '130px' }}>Quantity</th>
                        <th className="text-right">Unit Price</th>
                        <th className="text-right">Net Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentItems.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.name}</strong>
                            <small>{item.description} &middot; <span className="font-mono text-muted">{item.sku}</span></small>
                          </td>
                          <td className="text-center">
                            <div className="stepper-wrap">
                              <button
                                type="button"
                                className="stepper-btn"
                                onClick={() => handleQtyChange(item.id, -1)}
                                title="Decrease quantity"
                                aria-label="Decrease quantity"
                              >
                                <Minus size={12} />
                              </button>
                              <span className="stepper-value">{item.qty}</span>
                              <button
                                type="button"
                                className="stepper-btn"
                                onClick={() => handleQtyChange(item.id, 1)}
                                title="Increase quantity"
                                aria-label="Increase quantity"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </td>
                          <td className="text-right font-mono">{formatINR(item.unitPrice)}</td>
                          <td className="text-right font-bold font-mono">{formatINR(item.qty * item.unitPrice)}</td>
                        </tr>
                      ))}

                      {includeAddon && (
                        <tr className="addon-row">
                          <td>
                            <div className="addon-title-flex">
                              <Sparkles size={14} className="text-teal" />
                              <strong>{activePreset.addon.name}</strong>
                              <span className="recom-chip">Smart Add-on</span>
                            </div>
                            <small>{activePreset.addon.description}</small>
                          </td>
                          <td className="text-center font-mono">1</td>
                          <td className="text-right font-mono">{formatINR(activePreset.addon.unitPrice)}</td>
                          <td className="text-right font-bold font-mono text-teal">{formatINR(activePreset.addon.unitPrice)}</td>
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
                        <strong>Simulate Contract Discount:</strong>{' '}
                        <span className="discount-badge">{discountPercent}%</span>
                      </label>
                      <span className="threshold-indicator">
                        Policy limit: <strong>15%</strong>
                      </span>
                    </div>
                    <input
                      id="discount-range"
                      type="range"
                      min="0"
                      max="30"
                      value={discountPercent}
                      onChange={(e) => {
                        setDiscountPercent(Number(e.target.value));
                        setSimulatedFinanceSignoff(false);
                      }}
                      className="sim-slider"
                    />
                    <div className="slider-ticks">
                      <span>0% (List Price)</span>
                      <span className="tick-marker">15% (Policy Gate)</span>
                      <span>30% (Director Escalation)</span>
                    </div>

                    {isHighDiscount ? (
                      <div className="policy-callout-warning">
                        <ShieldAlert size={18} className="callout-icon" />
                        <div>
                          <strong>Automated Policy Rule Triggered:</strong>
                          <p>
                            Discount of <strong>{discountPercent}%</strong> exceeds sales rep authority (14.99%).
                            This quote automatically triggers an immutable finance concurrence lock before customer acceptance.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="policy-callout-safe">
                        <CheckCircle2 size={18} className="callout-icon" />
                        <div>
                          <strong>Within Standard Authority:</strong>
                          <p>
                            Discount is under 15%. This revision qualifies for commercial fast-path approval.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="sim-recommendation-card">
                    <div className="recom-header">
                      <Zap size={14} className="text-teal" />
                      <span>Co-Purchase Intelligence</span>
                    </div>
                    <h4>{activePreset.addon.name}</h4>
                    <p>{activePreset.addonPitch}</p>
                    <div className="recom-stat-pill">{activePreset.addonStat}</div>
                    <button
                      type="button"
                      className={`recom-toggle-btn ${includeAddon ? 'is-included' : ''}`}
                      onClick={() => setIncludeAddon(!includeAddon)}
                    >
                      {includeAddon ? '✓ Included in Proposal' : `+ Add Co-Purchase (${formatINR(activePreset.addon.unitPrice)})`}
                    </button>
                  </div>
                </div>

                {/* Totals & Margin Bar */}
                <div className="sim-totals-strip">
                  <div className="total-metric">
                    <span>List Subtotal</span>
                    <strong className="font-mono">{formatINR(rawSubtotal)}</strong>
                  </div>
                  <div className="total-metric">
                    <span>Contract Discount</span>
                    <strong className="text-amber font-mono">
                      -{formatINR(discountAmount)} ({discountPercent}%)
                    </strong>
                  </div>
                  <div className="total-metric">
                    <span>Proposed Net Price</span>
                    <strong className="text-teal font-mono text-xl">{formatINR(netTotal)}</strong>
                  </div>
                  <div className="total-metric margin-metric">
                    <div className="margin-header-flex">
                      <span>Gross Margin Health</span>
                      <span className={Number(marginPercent) >= 55 ? 'margin-badge high' : 'margin-badge warn'}>
                        {marginPercent}%
                      </span>
                    </div>
                    <div className="sim-margin-bar">
                      <div
                        className="sim-margin-fill"
                        style={{
                          width: `${Math.min(Number(marginPercent), 100)}%`,
                          backgroundColor: Number(marginPercent) >= 55 ? 'var(--semantic-emerald)' : 'var(--semantic-amber)'
                        }}
                      />
                    </div>
                    <small className="margin-subtext">Estimated COGS: {formatINR(estimatedCost)}</small>
                  </div>
                </div>

                {/* Next Step Action Button */}
                <div className="sim-action-shelf">
                  <button
                    type="button"
                    className="sim-advance-btn"
                    onClick={() => setActiveTab('approvals')}
                  >
                    <span>Inspect Governance &amp; Approval Matrix</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Approval Gate & Governance */}
            {activeTab === 'approvals' && (
              <div className="simulator-body">
                <div className="policy-banner">
                  <ShieldCheck size={20} className="text-teal" />
                  <div>
                    <strong>Parallel Governance State Machine</strong>
                    <p>
                      Rules evaluate dynamically on every saved revision. Any modification to price, scope, or terms
                      preserves the audit diff and requires fresh concurrence. Stale approvals never authorize commitments.
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

                  <div className={`approval-node ${isHighDiscount ? (simulatedFinanceSignoff ? 'is-approved' : 'is-active-warning') : 'is-bypassed'}`}>
                    <div className="node-marker">
                      {isHighDiscount ? (simulatedFinanceSignoff ? '✓' : '!') : '—'}
                    </div>
                    <div className="node-details">
                      <strong>3. Finance Operations &amp; Margin Floor</strong>
                      <span className="node-sub">
                        {isHighDiscount
                          ? (simulatedFinanceSignoff
                            ? 'Finance Concurrence Granted by Farah H. (Head of FinOps)'
                            : `Escalated: Discount at ${discountPercent}% exceeds 15% authority limit`)
                          : 'Bypassed: Discount under 15% threshold'}
                      </span>
                      <p>
                        {isHighDiscount
                          ? (simulatedFinanceSignoff
                            ? 'Manual margin exception approved for strategic account acquisition.'
                            : 'Finance Director concurrence required before buyer acceptance portal is unlocked.')
                          : 'Standard pricing authority applied. Fast-path clearance unlocked.'}
                      </p>

                      {isHighDiscount && (
                        <div className="sim-interactive-concurrence">
                          <button
                            type="button"
                            className={`concurrence-toggle-btn ${simulatedFinanceSignoff ? 'is-granted' : ''}`}
                            onClick={() => setSimulatedFinanceSignoff(!simulatedFinanceSignoff)}
                          >
                            {simulatedFinanceSignoff ? '✓ Revoke Simulated Finance Approval' : 'Simulate Finance Director Sign-Off'}
                          </button>
                        </div>
                      )}
                    </div>
                    <span className={`node-status ${isHighDiscount ? (simulatedFinanceSignoff ? 'status-done' : 'status-pending') : 'status-waived'}`}>
                      {isHighDiscount ? (simulatedFinanceSignoff ? 'CONCURRED' : 'PENDING DECISION') : 'AUTO-CLEARED'}
                    </span>
                  </div>

                  <div className="approval-connector" />

                  <div className="approval-node">
                    <div className="node-marker">4</div>
                    <div className="node-details">
                      <strong>4. Customer Confirmation &amp; Acceptance</strong>
                      <span className="node-sub">Enterprise Buyer ({activePreset.customerName})</span>
                      <p>
                        {isHighDiscount && !simulatedFinanceSignoff
                          ? 'Portal acceptance locked pending internal Finance sign-off.'
                          : 'External deal portal is ready for client review and legal confirmation.'}
                      </p>
                    </div>
                    <span className={`node-status ${isHighDiscount && !simulatedFinanceSignoff ? 'status-waived' : 'status-locked'}`}>
                      {isHighDiscount && !simulatedFinanceSignoff ? 'LOCKED' : 'READY FOR BUYER'}
                    </span>
                  </div>
                </div>

                <div className="sim-action-shelf">
                  <button
                    type="button"
                    className="sim-advance-btn"
                    onClick={() => setActiveTab('fulfillment')}
                  >
                    <span>View Logistics &amp; The Commitment Rule</span>
                    <ArrowRight size={16} />
                  </button>
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
                      <Truck size={18} className="text-teal" />
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
                    <div className="wh-status-badge preview">PREVIEW ONLY &middot; ZERO LOCK</div>
                  </div>

                  <div className="warehouse-card">
                    <div className="wh-header">
                      <Truck size={18} className="text-teal" />
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
                    <div className="wh-status-badge preview">PREVIEW ONLY &middot; ZERO LOCK</div>
                  </div>

                  <div className="warehouse-card">
                    <div className="wh-header">
                      <Truck size={18} className="text-teal" />
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
                    <div className="wh-status-badge preview">PREVIEW ONLY &middot; ZERO LOCK</div>
                  </div>
                </div>

                <div className="wh-callout">
                  <Lock size={16} className="text-teal" />
                  <span>
                    When {activePreset.customerName} formally confirms Revision 03, the canonical transactional service
                    will atomically allocate inventory across these three facilities simultaneously.
                  </span>
                </div>

                <div className="sim-action-shelf">
                  <button
                    type="button"
                    className="sim-advance-btn"
                    onClick={() => setActiveTab('billing')}
                  >
                    <span>Inspect Automated Milestone Billing</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Tab 4: Automated Invoicing */}
            {activeTab === 'billing' && (
              <div className="simulator-body">
                <div className="sim-meta-row">
                  <div>
                    <span className="sim-meta-label">Billing Structure</span>
                    <strong className="sim-meta-value">Milestone Deposit + Quarterly Recurring</strong>
                  </div>
                  <div>
                    <span className="sim-meta-label">Payment Terms</span>
                    <strong className="sim-meta-value">Net 30 &middot; Corporate ACH / Wire</strong>
                  </div>
                  <div>
                    <span className="sim-meta-label">Payment Processing</span>
                    <strong className="sim-meta-value">Stripe Connect &amp; ERP Webhooks</strong>
                  </div>
                  <div>
                    <span className="sim-meta-label">Total Contract Value</span>
                    <strong className="sim-meta-value text-teal font-mono">{formatINR(netTotal)}</strong>
                  </div>
                </div>

                <div className="invoicing-timeline">
                  <div className="invoice-schedule-item">
                    <div className="inv-badge milestone">MILESTONE 1</div>
                    <div className="inv-content">
                      <div className="inv-row">
                        <strong>Deployment &amp; Setup Deposit (40%)</strong>
                        <span className="inv-amount font-mono">{formatINR(Math.round(netTotal * 0.4))}</span>
                      </div>
                      <p>Triggered on contract confirmation &middot; Prorated invoice auto-generates with formal corporate watermark.</p>
                      <div className="inv-tag-row">
                        <span className="inv-tag tag-ready">PREVIEW READY</span>
                        <span className="inv-subtag">Clamped to contract execution date</span>
                      </div>
                    </div>
                  </div>

                  <div className="invoice-schedule-item">
                    <div className="inv-badge recurring">RECURRING</div>
                    <div className="inv-content">
                      <div className="inv-row">
                        <strong>Quarterly Licensing (4 Installments)</strong>
                        <span className="inv-amount font-mono">
                          {formatINR(Math.round((netTotal * 0.6) / 4))} / quarter
                        </span>
                      </div>
                      <p>Starts post-deployment with calendar month-end clamping &middot; 4 cycles auto-scheduled in PostgreSQL ledger.</p>
                      <div className="inv-tag-row">
                        <span className="inv-tag tag-sched">SCHEDULED UPON SIGN-OFF</span>
                        <span className="inv-subtag">Automated payment reminders Net 30</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sim-action-shelf">
                  <button
                    type="button"
                    className="sim-advance-btn"
                    onClick={() => setActiveTab('quote')}
                  >
                    <RefreshCw size={14} />
                    <span>Return to Quote Configuration</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. LOGOS & SOCIAL PROOF STRIP */}
      <section className="client-proof-section">
        <p className="proof-caption">POWERING HIGH-VELOCITY REVENUE OPERATIONS FOR INDUSTRY LEADERS</p>
        <div className="logo-strip">
          <div className="logo-item">
            <span className="logo-mark">▲</span>
            <strong>NEXA CLOUD</strong>
          </div>
          <div className="logo-item">
            <span className="logo-mark">◈</span>
            <strong>HORIZON GLOBAL</strong>
          </div>
          <div className="logo-item">
            <span className="logo-mark">⬡</span>
            <strong>ZENITH LOGISTICS</strong>
          </div>
          <div className="logo-item">
            <span className="logo-mark">❖</span>
            <strong>SOLARIS NETWORKS</strong>
          </div>
          <div className="logo-item">
            <span className="logo-mark">◆</span>
            <strong>MERIDIAN CAPITAL</strong>
          </div>
          <div className="logo-item">
            <span className="logo-mark">●</span>
            <strong>QUANTIX BIO</strong>
          </div>
        </div>
      </section>

      {/* 4. METRICS / IMPACT BANNER */}
      <section className="metrics-ribbon">
        <div className="metrics-container">
          <div className="metric-box">
            <span className="metric-num">₹4.8B+</span>
            <span className="metric-label">Annual Revenue Orchestrated</span>
            <small className="metric-sub">Across 450+ enterprise deal pipelines</small>
          </div>
          <div className="metric-box">
            <span className="metric-num">64%</span>
            <span className="metric-label">Reduction in Deal Cycles</span>
            <small className="metric-sub">From first draft to verified customer sign-off</small>
          </div>
          <div className="metric-box">
            <span className="metric-num">0%</span>
            <span className="metric-label">Silent Margin Erosion</span>
            <small className="metric-sub">Real-time floor guardrails on every line item</small>
          </div>
          <div className="metric-box">
            <span className="metric-num">100%</span>
            <span className="metric-label">Audit-Grade Traceability</span>
            <small className="metric-sub">Every amendment generates an immutable diff</small>
          </div>
        </div>
      </section>

      {/* 5. INTERACTIVE ROI & DEAL VELOCITY CALCULATOR */}
      <section className="roi-section">
        <div className="section-head">
          <span className="eyebrow-accent">REVENUE IMPACT MODEL</span>
          <h2 className="section-title">Calculate your team’s recovered margin &amp; velocity.</h2>
          <p className="section-subtitle">
            See the direct financial impact of eliminating manual spreadsheet pricing, phantom inventory locks,
            and unauthorized sales discounts.
          </p>
        </div>

        <div className="roi-calculator-card">
          <div className="roi-inputs-col">
            <div className="roi-input-group">
              <div className="roi-input-header">
                <label htmlFor="roi-deals">Monthly Enterprise Quotes Managed</label>
                <span className="roi-value-pill">{roiDealsPerMonth} deals / mo</span>
              </div>
              <input
                id="roi-deals"
                type="range"
                min="10"
                max="250"
                step="5"
                value={roiDealsPerMonth}
                onChange={(e) => setRoiDealsPerMonth(Number(e.target.value))}
                className="sim-slider"
              />
              <div className="slider-ticks">
                <span>10 deals</span>
                <span>125 deals</span>
                <span>250 deals</span>
              </div>
            </div>

            <div className="roi-input-group">
              <div className="roi-input-header">
                <label htmlFor="roi-deal-value">Average Contract Value (ACV)</label>
                <span className="roi-value-pill font-mono">{formatINR(roiAverageDealValue)}</span>
              </div>
              <input
                id="roi-deal-value"
                type="range"
                min="300000"
                max="5000000"
                step="100000"
                value={roiAverageDealValue}
                onChange={(e) => setRoiAverageDealValue(Number(e.target.value))}
                className="sim-slider"
              />
              <div className="slider-ticks">
                <span>₹3 Lakhs</span>
                <span>₹25 Lakhs</span>
                <span>₹50 Lakhs</span>
              </div>
            </div>

            <div className="roi-formula-footnote">
              <Info size={14} className="text-teal" />
              <span>
                Based on verified enterprise telemetry: 14.5 hours saved per deal cycle and 3.2% protected margin
                via canonical decimal pricing and co-purchase recommendations.
              </span>
            </div>
          </div>

          <div className="roi-results-col">
            <div className="roi-kpi-card highlight">
              <span className="roi-kpi-caption">ANNUAL PROTECTED MARGIN</span>
              <strong className="roi-kpi-value text-teal font-mono">
                {formatINR(calculatedRoi.marginLeakagePrevented)}
              </strong>
              <p>Prevented from unauthorized rogue discounts and fractional math drift.</p>
            </div>

            <div className="roi-kpi-grid">
              <div className="roi-kpi-card">
                <span className="roi-kpi-caption">HOURS RECLAIMED / YEAR</span>
                <strong className="roi-kpi-value font-mono">
                  {calculatedRoi.totalHoursSaved.toLocaleString()} hrs
                </strong>
                <p>Saved across sales, legal, finance, and logistics operations.</p>
              </div>

              <div className="roi-kpi-card">
                <span className="roi-kpi-caption">QUOTE TURNAROUND</span>
                <strong className="roi-kpi-value text-emerald font-mono">48 Hours</strong>
                <p>Reduced from 19-day spreadsheet approval bottlenecks.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. INSTANT PERSONA LAUNCHPAD (SEEDED ACCESS) */}
      <section className="personas-launchpad-section">
        <div className="section-head">
          <span className="eyebrow-accent">INSTANT EVALUATION ENVIRONMENT</span>
          <h2 className="section-title">Explore every perspective with pre-seeded personas.</h2>
          <p className="section-subtitle">
            DealFlow360 comes loaded with realistic demo accounts for every stakeholder in the commercial lifecycle.
            Sign in with one click.
          </p>
        </div>

        <div className="personas-grid">
          {/* Admin */}
          <div className="persona-card">
            <div className="persona-badge admin">SYSTEM ADMIN</div>
            <div className="persona-header">
              <Users2 size={20} className="text-teal" />
              <div>
                <h4>Admin &middot; Operations</h4>
                <span>dev@nexa.example</span>
              </div>
            </div>
            <p>Full control over pricebook catalogs, policy thresholds, customer accounts, and PostgreSQL audit trails.</p>
            <ul className="persona-features">
              <li>Manage enterprise price lists &amp; tiers</li>
              <li>Configure discount escalation gates</li>
              <li>Inspect complete compliance logs</li>
            </ul>
            <Link href="/login" className="persona-cta-btn">
              <span>Sign in as Admin</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Sales Rep */}
          <div className="persona-card">
            <div className="persona-badge rep">SALES REP</div>
            <div className="persona-header">
              <Zap size={20} className="text-teal" />
              <div>
                <h4>Arjun Kapoor</h4>
                <span>arjun@nexa.example</span>
              </div>
            </div>
            <p>Build enterprise proposals in minutes with automatic co-purchase recommendations and real-time margin feedback.</p>
            <ul className="persona-features">
              <li>Instant customer price resolution</li>
              <li>1-click co-purchase add-ons</li>
              <li>Fast-track quote submission</li>
            </ul>
            <Link href="/login" className="persona-cta-btn">
              <span>Sign in as Sales Rep</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Finance Director */}
          <div className="persona-card">
            <div className="persona-badge finance">FINANCE DIRECTOR</div>
            <div className="persona-header">
              <Scale size={20} className="text-teal" />
              <div>
                <h4>Farah Haque</h4>
                <span>farah@nexa.example</span>
              </div>
            </div>
            <p>Review margin floor escalations, preview warehouse split plans safely, and monitor milestone invoice schedules.</p>
            <ul className="persona-features">
              <li>Approve/reject margin variances</li>
              <li>Commitment-rule safe logistics view</li>
              <li>Prorated billing &amp; ledger audits</li>
            </ul>
            <Link href="/login" className="persona-cta-btn">
              <span>Sign in as Finance</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Enterprise Buyer */}
          <div className="persona-card">
            <div className="persona-badge customer">ENTERPRISE BUYER</div>
            <div className="persona-header">
              <Building2 size={20} className="text-teal" />
              <div>
                <h4>Neha Patel &middot; Acme Corp</h4>
                <span>neha@acme.example</span>
              </div>
            </div>
            <p>External buyer portal with transparent line-item breakdowns, in-thread negotiation notes, and digital sign-off.</p>
            <ul className="persona-features">
              <li>Customer-scoped data isolation</li>
              <li>In-context revision negotiation</li>
              <li>1-click digital quote acceptance</li>
            </ul>
            <Link href="/login" className="persona-cta-btn">
              <span>Sign in as Buyer</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* 7. FEATURE BENTO GRID */}
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
                  <div><Check size={14} className="text-teal inline mr-2" /> Strict customer-scoped security boundaries</div>
                  <div><Check size={14} className="text-teal inline mr-2" /> In-thread revision negotiation &amp; notes</div>
                  <div><Check size={14} className="text-teal inline mr-2" /> Instant PDF / XLSX export with verifiable watermark</div>
                </div>
              </div>
              <div className="portal-mini-preview">
                <div className="portal-preview-card">
                  <div className="pp-header">
                    <span className="pp-logo">Acme &middot; Deal Portal</span>
                    <span className="pp-status">APPROVED &middot; READY TO SIGN</span>
                  </div>
                  <div className="pp-amount font-mono">{formatINR(345000)}</div>
                  <div className="pp-action">Accept Revision 03 Terms &rarr;</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. COMPETITIVE COMPARISON MATRIX */}
      <section className="comparison-section">
        <div className="section-head">
          <span className="eyebrow-accent">WHY TEAMS SWITCH</span>
          <h2 className="section-title">Built for modern speed. Not legacy complexity.</h2>
          <p className="section-subtitle">
            See how DealFlow360 compares to fragile spreadsheets and bloated enterprise CPQs.
          </p>
        </div>

        <div className="comparison-table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th style={{ width: '32%' }}>Capabilities</th>
                <th className="highlight-col" style={{ width: '26%' }}>
                  <div className="th-brand">
                    <span>DealFlow360</span>
                    <small>Modern Revenue Engine</small>
                  </div>
                </th>
                <th style={{ width: '21%' }}>Spreadsheets &amp; Email</th>
                <th style={{ width: '21%' }}>Legacy CPQs (Salesforce/SAP)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Decimal-Accurate Calculation</strong>
                  <small>No IEEE-754 floating point rounding leaks</small>
                </td>
                <td className="highlight-col"><CheckCircle2 size={18} className="text-emerald" /> Canonical Decimal.js</td>
                <td><X size={18} className="text-rose" /> Floating point drift</td>
                <td><Check size={18} className="text-muted" /> Partial / Config-heavy</td>
              </tr>
              <tr>
                <td>
                  <strong>The Commitment Rule</strong>
                  <small>Zero phantom inventory reservations during quotes</small>
                </td>
                <td className="highlight-col"><CheckCircle2 size={18} className="text-emerald" /> Read-only preview safety</td>
                <td><X size={18} className="text-rose" /> No inventory sync</td>
                <td><X size={18} className="text-rose" /> Premature inventory locks</td>
              </tr>
              <tr>
                <td>
                  <strong>Revision Immutability</strong>
                  <small>Material changes fork new revisions and reset approvals</small>
                </td>
                <td className="highlight-col"><CheckCircle2 size={18} className="text-emerald" /> Strict revision branching</td>
                <td><X size={18} className="text-rose" /> Overwritten files / Chaos</td>
                <td><Check size={18} className="text-muted" /> Complex change orders</td>
              </tr>
              <tr>
                <td>
                  <strong>Co-Purchase Intelligence</strong>
                  <small>Dynamic cross-sell suggestions based on history</small>
                </td>
                <td className="highlight-col"><CheckCircle2 size={18} className="text-emerald" /> Real-time 1-click add-ons</td>
                <td><X size={18} className="text-rose" /> None</td>
                <td><X size={18} className="text-rose" /> Requires expensive add-ons</td>
              </tr>
              <tr>
                <td>
                  <strong>External Buyer Portal</strong>
                  <small>Branded interactive negotiation for customer sign-off</small>
                </td>
                <td className="highlight-col"><CheckCircle2 size={18} className="text-emerald" /> Customer-scoped workspace</td>
                <td><X size={18} className="text-rose" /> Emailing PDFs back &amp; forth</td>
                <td><X size={18} className="text-rose" /> Clunky DocuSign bridges</td>
              </tr>
              <tr>
                <td>
                  <strong>Deployment Velocity</strong>
                  <small>Time required from kickoff to live quote generation</small>
                </td>
                <td className="highlight-col font-bold text-teal">Under 24 Hours</td>
                <td>Immediate (Fragile)</td>
                <td>6 to 18 Months</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 9. THE 3-STEP JOURNEY */}
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

      {/* 10. ROLE-BASED VALUE SELECTOR */}
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

      {/* 11. ENTERPRISE TESTIMONIALS */}
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

      {/* 12. INTERACTIVE FAQ ACCORDION */}
      <section className="faq-section">
        <div className="section-head">
          <span className="eyebrow-accent">QUESTIONS &amp; ANSWERS</span>
          <h2 className="section-title">Frequently asked architectural questions.</h2>
          <p className="section-subtitle">
            Understand how DealFlow360 guarantees transactional safety, multi-tenant isolation, and auditable accounting.
          </p>
        </div>

        <div className="faq-list">
          {[
            {
              q: 'What is the "Commitment Rule" and why does it matter?',
              a: 'In enterprise sales, deals often undergo weeks of negotiation. Legacy CPQs frequently lock warehouse stock or create phantom ledger entries during drafting, starving other sales reps. DealFlow360 strictly enforces that warehouse split suggestions and invoice schedules are read-only previews. Physical inventory is transactionally reserved only after customer confirmation.'
            },
            {
              q: 'Why does DealFlow360 use Decimal.js instead of native JavaScript Numbers?',
              a: 'Standard JavaScript numbers use IEEE-754 64-bit floating point arithmetic, which introduces subtle rounding errors (e.g. 0.1 + 0.2 = 0.30000000000000004). Over multi-million dollar deals and fractional tax calculations, these drift into severe ledger discrepancies. DealFlow360 computes all money using Decimal.js with banker’s rounding.'
            },
            {
              q: 'Can customer portal users view internal margin percentages or approval notes?',
              a: 'Never. DealFlow360 implements strict server-side allowlists on every API response. Customer portal sessions are customer-scoped, stripping out internal cost baselines, gross margin calculations, sales rep notes, and internal policy escalation logs.'
            },
            {
              q: 'What happens when a quote is modified after management has already approved it?',
              a: 'Any material change (to line items, quantities, discounts, or terms) immediately increments the quote revision (e.g. Rev 01 -> Rev 02) and resets affected approval gates. Stale approvals can never authorize commitment on altered terms.'
            },
            {
              q: 'Can DealFlow360 integrate with our existing ERP or payment gateway?',
              a: 'Yes. DealFlow360 provides native integration webhooks for Stripe Connect, QuickBooks, NetSuite, and custom PostgreSQL database pipelines. In non-production environments, explicit development adapters allow zero-dependency end-to-end testing.'
            }
          ].map((item, idx) => {
            const isExpanded = expandedFaq === idx;
            return (
              <div key={idx} className={`faq-card ${isExpanded ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="faq-question-btn"
                  onClick={() => setExpandedFaq(isExpanded ? null : idx)}
                  aria-expanded={isExpanded}
                >
                  <span>{item.q}</span>
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {isExpanded && (
                  <div className="faq-answer">
                    <p>{item.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 13. FINAL CALL TO ACTION */}
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
              Request Enterprise Account
            </Link>
          </div>
          <div className="cta-footer-note">
            <span>Instant sandbox credentials available &middot; Pre-configured for Admin, Sales Rep, Finance &amp; Buyer</span>
          </div>
        </div>
      </section>

      {/* 14. REFINED FOOTER */}
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
