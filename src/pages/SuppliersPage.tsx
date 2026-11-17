import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GitCompare, Plus, Search, X } from 'lucide-react';
import {
  ErrorBanner,
  formatUsd,
  LoadingState,
  MetricTile,
  PageHeader,
  Panel,
  RiskTag,
} from '../ui/CommonUi.tsx';

export function SuppliersPage({ initialSupplierId }: { initialSupplierId?: number | null }) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(initialSupplierId ?? null);
  const [detail, setDetail] = useState<{ supplier: any; trends: any[] } | null>(null);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<'profile' | 'compare'>('profile');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add supplier form state
  const [newSup, setNewSup] = useState({
    name: '',
    region: 'East Asia',
    country: '',
    category: 'Components',
    dependency_share_pct: 18,
    reliability_score: 76,
    avg_delay_days: 4.5,
    shipment_distance_km: 6200,
    inventory_level_units: 1200,
    safety_stock_units: 1000,
    order_quantity_units: 1500,
    historical_disruptions: 1,
    annual_spend_usd: 2200000,
    financial_health_score: 78,
    defect_rate_pct: 1.4,
  });

  async function fetchSuppliers(pickId?: number) {
    setLoading(true);
    try {
      const res = await fetch('/api/suppliers');
      const json = await res.json();
      setSuppliers(json.suppliers || []);
      const target = pickId || selectedId || json.suppliers?.[0]?.id;
      if (target) {
        setSelectedId(target);
        if (compareIds.length === 0 && json.suppliers?.length >= 2) {
          setCompareIds([json.suppliers[0].id, json.suppliers[1].id]);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSuppliers(initialSupplierId ?? undefined);
  }, [initialSupplierId]);

  useEffect(() => {
    if (!selectedId) return;
    fetch(`/api/suppliers/${selectedId}`)
      .then((r) => r.json())
      .then((d) => setDetail(d))
      .catch(() => {});
  }, [selectedId]);

  async function handleAddSupplier(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newSup,
          dependency_level:
            newSup.dependency_share_pct >= 28
              ? 'Critical'
              : newSup.dependency_share_pct >= 18
              ? 'High'
              : 'Moderate',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to add supplier.');
      setShowAddModal(false);
      await fetchSuppliers(json.supplier.id);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function toggleCompare(id: number) {
    setCompareIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 3
        ? [...prev.slice(1), id]
        : [...prev, id]
    );
  }

  const filtered = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.country.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase())
  );

  const comparedSuppliers = suppliers.filter((s) => compareIds.includes(s.id));
  const radarData =
    comparedSuppliers.length >= 2
      ? [
          {
            metric: 'Reliability',
            ...Object.fromEntries(comparedSuppliers.map((s) => [s.supplier_code, s.reliability_score])),
          },
          {
            metric: 'Financial Health',
            ...Object.fromEntries(comparedSuppliers.map((s) => [s.supplier_code, s.financial_health_score])),
          },
          {
            metric: 'Risk Score',
            ...Object.fromEntries(comparedSuppliers.map((s) => [s.supplier_code, s.risk_score])),
          },
          {
            metric: 'Dependency %',
            ...Object.fromEntries(comparedSuppliers.map((s) => [s.supplier_code, s.dependency_share_pct * 2])),
          },
          {
            metric: 'Buffer Coverage',
            ...Object.fromEntries(
              comparedSuppliers.map((s) => [
                s.supplier_code,
                Math.min(100, Math.round((s.inventory_level_units / Math.max(1, s.safety_stock_units)) * 55)),
              ])
            ),
          },
        ]
      : [];

  if (loading && suppliers.length === 0) return <LoadingState label="Loading supplier profiles..." />;

  const activeSup = detail?.supplier;

  return (
    <div className="space-y-6">
      <PageHeader
        meta={`Supplier Intelligence · ${suppliers.length} Active Vendors`}
        title="Supplier Intelligence & Comparative Profiles"
        subtitle="Inspect supplier-level delivery trajectories, financial health, inventory buffers, ML risk explanations, and side-by-side multi-vendor benchmarks."
        actions={
          <>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'profile' ? 'compare' : 'profile')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md border inline-flex items-center gap-1.5 whitespace-nowrap ${
                viewMode === 'compare'
                  ? 'bg-teal-700 border-teal-500 text-white'
                  : 'bg-[#111827] border-slate-700 text-slate-200 hover:bg-slate-800'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              {viewMode === 'compare'
                ? 'Back to Individual Profile'
                : `Compare Selected (${compareIds.length})`}
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Supplier
            </button>
          </>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid lg:grid-cols-12 gap-5">
        {/* Left Vendor List */}
        <Panel className="lg:col-span-4 flex flex-col max-h-[760px]">
          <div className="p-3.5 border-b border-slate-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vendor, country, category..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#090D16] border border-slate-700 rounded text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="text-[11px] text-slate-400 mt-2 flex justify-between">
              <span>Click row to inspect</span>
              <span>Check up to 3 to compare</span>
            </div>
          </div>

          <div className="overflow-y-auto divide-y divide-slate-800/70">
            {filtered.map((s) => {
              const isSelected = selectedId === s.id;
              const isChecked = compareIds.includes(s.id);
              return (
                <div
                  key={s.id}
                  onClick={() => {
                    setSelectedId(s.id);
                    if (viewMode === 'compare') setViewMode('profile');
                  }}
                  className={`p-3.5 cursor-pointer transition-colors flex items-start justify-between gap-3 ${
                    isSelected ? 'bg-slate-800/60' : 'hover:bg-slate-800/30'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleCompare(s.id)}
                        aria-label={`Compare ${s.name}`}
                        className="rounded border-slate-600 bg-slate-900 text-sky-500"
                      />
                      <span className="text-xs font-medium text-white truncate">{s.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 pl-5">
                      {s.country} · {s.category}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-semibold text-white tabular-nums">
                      {s.risk_score}/100
                    </div>
                    <div className="mt-0.5">
                      <RiskTag category={s.risk_category} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Right Detail or Multi-Supplier Comparison */}
        <div className="lg:col-span-8 space-y-5">
          {viewMode === 'compare' ? (
            <div className="space-y-5">
              <Panel className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-display font-semibold text-white">
                      Side-by-Side Supplier Comparison ({comparedSuppliers.length} Selected)
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Select 2–3 suppliers from the left panel checkboxes to benchmark risk & resilience
                    </p>
                  </div>
                </div>

                {comparedSuppliers.length < 2 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Check at least 2 suppliers in the vendor directory to view comparison charts.
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={radarData}>
                          <PolarGrid stroke="#334155" />
                          <PolarAngleAxis dataKey="metric" tick={{ fill: '#CBD5E1', fontSize: 10 }} />
                          {comparedSuppliers.map((s, idx) => (
                            <Radar
                              key={s.id}
                              name={s.name}
                              dataKey={s.supplier_code}
                              stroke={['#38BDF8', '#FB7185', '#2DD4BF'][idx % 3]}
                              fill={['#38BDF8', '#FB7185', '#2DD4BF'][idx % 3]}
                              fillOpacity={0.18}
                            />
                          ))}
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#090D16',
                              borderColor: '#334155',
                              fontSize: '12px',
                            }}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={comparedSuppliers}>
                          <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                          <XAxis dataKey="supplier_code" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                          <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#090D16',
                              borderColor: '#334155',
                              fontSize: '12px',
                            }}
                          />
                          <Bar dataKey="reliability_score" name="Reliability %" fill="#2DD4BF" />
                          <Bar dataKey="risk_score" name="Risk Score" fill="#FB7185" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </Panel>

              {comparedSuppliers.length >= 2 && (
                <Panel className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#0D1320] text-slate-400 text-[10px] uppercase border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Attribute</th>
                        {comparedSuppliers.map((s) => (
                          <th key={s.id} className="py-3 px-4 text-white">
                            {s.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 tabular-nums">
                      <tr>
                        <td className="py-2.5 px-4 text-slate-400">Location</td>
                        {comparedSuppliers.map((s) => (
                          <td key={s.id} className="py-2.5 px-4 text-slate-200">
                            {s.country} ({s.region})
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 text-slate-400">Risk Score & Severity</td>
                        {comparedSuppliers.map((s) => (
                          <td key={s.id} className="py-2.5 px-4">
                            <span className="font-semibold text-white mr-2">{s.risk_score}</span>
                            <RiskTag category={s.risk_category} />
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 text-slate-400">Reliability Score</td>
                        {comparedSuppliers.map((s) => (
                          <td key={s.id} className="py-2.5 px-4 text-slate-200">
                            {s.reliability_score}%
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 text-slate-400">Average Delay</td>
                        {comparedSuppliers.map((s) => (
                          <td key={s.id} className="py-2.5 px-4 text-slate-200">
                            {s.avg_delay_days} days
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 text-slate-400">Dependency Share</td>
                        {comparedSuppliers.map((s) => (
                          <td key={s.id} className="py-2.5 px-4 text-slate-200">
                            {s.dependency_share_pct}% ({s.dependency_level})
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 text-slate-400">Financial Health</td>
                        {comparedSuppliers.map((s) => (
                          <td key={s.id} className="py-2.5 px-4 text-slate-200">
                            {s.financial_health_score} / 100
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 text-slate-400">Annual Spend</td>
                        {comparedSuppliers.map((s) => (
                          <td key={s.id} className="py-2.5 px-4 text-amber-300">
                            {formatUsd(s.annual_spend_usd)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 text-slate-400">Disruption Probability (ML)</td>
                        {comparedSuppliers.map((s) => (
                          <td key={s.id} className="py-2.5 px-4 text-sky-300">
                            {(s.disruption_prob * 100).toFixed(1)}%
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </Panel>
              )}
            </div>
          ) : activeSup ? (
            <div className="space-y-5">
              <Panel className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <div className="text-[11px] font-mono text-sky-400 uppercase tracking-wider">
                      {activeSup.supplier_code} · {activeSup.category} · {activeSup.country} ({activeSup.region})
                    </div>
                    <h2 className="text-lg font-display font-semibold text-white mt-1">
                      {activeSup.name}
                    </h2>
                  </div>
                  <div className="text-right">
                    <RiskTag category={activeSup.risk_category} />
                    <div className="text-xl font-display font-semibold text-white tabular-nums mt-0.5">
                      Risk Score: {activeSup.risk_score} / 100
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-3.5 rounded-md bg-[#090D16] border border-slate-800 text-xs text-slate-300 leading-relaxed">
                  <span className="font-semibold text-white">Risk Explanation: </span>
                  {activeSup.risk_explanation}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <MetricTile
                    label="Reliability Score"
                    value={`${activeSup.reliability_score}%`}
                    tone={activeSup.reliability_score < 70 ? 'critical' : 'low'}
                  />
                  <MetricTile
                    label="Avg Delivery Delay"
                    value={`${activeSup.avg_delay_days}d`}
                    tone={activeSup.avg_delay_days >= 6 ? 'high' : 'neutral'}
                  />
                  <MetricTile
                    label="Dependency Share"
                    value={`${activeSup.dependency_share_pct}%`}
                    subtext={activeSup.dependency_level}
                  />
                  <MetricTile
                    label="Financial Health"
                    value={`${activeSup.financial_health_score}/100`}
                    subtext={`Spend: ${formatUsd(activeSup.annual_spend_usd)}`}
                  />
                </div>
              </Panel>

              <div className="grid md:grid-cols-2 gap-5">
                <Panel className="p-5">
                  <h3 className="text-sm font-display font-semibold text-white mb-1">
                    Historical Delivery Performance
                  </h3>
                  <p className="text-[11px] text-slate-400 mb-4">
                    6-period on-time fulfillment (%) & delay days
                  </p>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={detail?.trends || []}>
                        <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                        <XAxis dataKey="period_label" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#090D16',
                            borderColor: '#334155',
                            fontSize: '12px',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="on_time_pct"
                          name="On-Time %"
                          stroke="#2DD4BF"
                          strokeWidth={2}
                        />
                        <Line
                          type="monotone"
                          dataKey="avg_delay_days"
                          name="Avg Delay (Days)"
                          stroke="#FB7185"
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>

                <Panel className="p-5 space-y-3 text-xs">
                  <h3 className="text-sm font-display font-semibold text-white">
                    Operational & ML Risk Telemetry
                  </h3>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="p-3 rounded bg-[#090D16] border border-slate-800">
                      <div className="text-slate-400 text-[11px]">ML Disruption Prob</div>
                      <div className="text-base font-semibold text-rose-400 tabular-nums mt-0.5">
                        {(activeSup.disruption_prob * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="p-3 rounded bg-[#090D16] border border-slate-800">
                      <div className="text-slate-400 text-[11px]">ML Delay Prob</div>
                      <div className="text-base font-semibold text-amber-400 tabular-nums mt-0.5">
                        {(activeSup.delay_prob * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="p-3 rounded bg-[#090D16] border border-slate-800">
                      <div className="text-slate-400 text-[11px]">On-Hand vs Safety Stock</div>
                      <div className="text-base font-semibold text-white tabular-nums mt-0.5">
                        {activeSup.inventory_level_units} / {activeSup.safety_stock_units}
                      </div>
                    </div>
                    <div className="p-3 rounded bg-[#090D16] border border-slate-800">
                      <div className="text-slate-400 text-[11px]">Historical Disruptions</div>
                      <div className="text-base font-semibold text-white tabular-nums mt-0.5">
                        {activeSup.historical_disruptions} events (12m)
                      </div>
                    </div>
                    <div className="p-3 rounded bg-[#090D16] border border-slate-800">
                      <div className="text-slate-400 text-[11px]">Corridor Distance</div>
                      <div className="text-base font-semibold text-slate-200 tabular-nums mt-0.5">
                        {Number(activeSup.shipment_distance_km).toLocaleString()} km
                      </div>
                    </div>
                    <div className="p-3 rounded bg-[#090D16] border border-slate-800">
                      <div className="text-slate-400 text-[11px]">Defect Rate</div>
                      <div className="text-base font-semibold text-slate-200 tabular-nums mt-0.5">
                        {activeSup.defect_rate_pct}%
                      </div>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Add Supplier Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-xl bg-[#111827] border border-slate-700 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-display font-semibold text-white">Register New Supplier</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddSupplier} className="p-5 grid sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block text-slate-300 mb-1">Supplier Name</label>
                <input
                  required
                  value={newSup.name}
                  onChange={(e) => setNewSup({ ...newSup, name: e.target.value })}
                  placeholder="e.g., Osaka Micro-Optics KK"
                  className="w-full px-3 py-1.5 bg-[#090D16] border border-slate-700 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Region</label>
                <select
                  value={newSup.region}
                  onChange={(e) => setNewSup({ ...newSup, region: e.target.value })}
                  className="w-full px-3 py-1.5 bg-[#090D16] border border-slate-700 rounded text-white"
                >
                  <option>East Asia</option>
                  <option>Western Europe</option>
                  <option>North America</option>
                  <option>South Asia</option>
                  <option>Southeast Asia</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Country</label>
                <input
                  required
                  value={newSup.country}
                  onChange={(e) => setNewSup({ ...newSup, country: e.target.value })}
                  placeholder="Japan"
                  className="w-full px-3 py-1.5 bg-[#090D16] border border-slate-700 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Reliability Score (%)</label>
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={newSup.reliability_score}
                  onChange={(e) => setNewSup({ ...newSup, reliability_score: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 bg-[#090D16] border border-slate-700 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Avg Delay (Days)</label>
                <input
                  type="number"
                  step="0.1"
                  value={newSup.avg_delay_days}
                  onChange={(e) => setNewSup({ ...newSup, avg_delay_days: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 bg-[#090D16] border border-slate-700 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Dependency Share (%)</label>
                <input
                  type="number"
                  value={newSup.dependency_share_pct}
                  onChange={(e) => setNewSup({ ...newSup, dependency_share_pct: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 bg-[#090D16] border border-slate-700 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Annual Spend (USD)</label>
                <input
                  type="number"
                  value={newSup.annual_spend_usd}
                  onChange={(e) => setNewSup({ ...newSup, annual_spend_usd: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 bg-[#090D16] border border-slate-700 rounded text-white"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium">
                  Save & Score Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
