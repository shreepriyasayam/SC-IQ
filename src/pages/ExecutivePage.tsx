import React, { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowUpRight, Filter, Layers } from 'lucide-react';
import {
  ErrorBanner,
  formatUsd,
  LoadingState,
  MetricTile,
  PageHeader,
  Panel,
  RiskTag,
} from '../ui/CommonUi.tsx';

export function ExecutivePage({
  onSelectSupplierDrilldown,
  onNavigate,
}: {
  onSelectSupplierDrilldown: (supplierId: number) => void;
  onNavigate: (page: string) => void;
}) {
  const [datasetId, setDatasetId] = useState<string>('');
  const [region, setRegion] = useState<string>('All');
  const [dateRange, setDateRange] = useState<string>('All');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadDashboard(dsId = datasetId, reg = region, dr = dateRange) {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (dsId) qs.set('datasetId', dsId);
      if (reg) qs.set('region', reg);
      if (dr) qs.set('dateRange', dr);
      const res = await fetch(`/api/executive?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load executive metrics.');
      setData(json);
      if (!dsId && json.activeDataset?.id) {
        setDatasetId(String(json.activeDataset.id));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading && !data) return <LoadingState label="Computing portfolio metrics from dataset..." />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  const { kpis, activeDataset, datasets, availableRegions, performanceTrends, supplierEntities, prodModel } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        meta={`Executive Intelligence · ${activeDataset.name} · ${activeDataset.totalRecords} Filtered Orders`}
        title="Executive Intelligence Centre"
        subtitle="Portfolio-wide supply disruption monitoring, delay probabilities, and financial exposure dynamically computed from the selected dataset."
        actions={
          <>
            <button
              type="button"
              onClick={() => onNavigate('ml-lab')}
              className="px-3.5 py-2 text-xs font-medium bg-[#111827] hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-md whitespace-nowrap"
            >
              Active Model: {prodModel?.algorithm || 'Gradient Boosting'} ({((prodModel?.f1_score || 0) * 100).toFixed(1)}% F1)
            </button>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="px-3.5 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md whitespace-nowrap"
            >
              Export Board Report
            </button>
          </>
        }
      />

      {/* Interactive Filter Strip */}
      <Panel className="p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
          <Filter className="w-3.5 h-3.5 text-sky-400" />
          <span>Dynamic Controls</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-400">Dataset</label>
            <select
              value={datasetId}
              onChange={(e) => {
                setDatasetId(e.target.value);
                loadDashboard(e.target.value, region, dateRange);
              }}
              className="px-2.5 py-1.5 text-xs bg-[#090D16] border border-slate-700 rounded text-white focus:outline-none focus:border-sky-500"
            >
              {datasets.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.clean_row_count} rows)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-400">Region</label>
            <select
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                loadDashboard(datasetId, e.target.value, dateRange);
              }}
              className="px-2.5 py-1.5 text-xs bg-[#090D16] border border-slate-700 rounded text-white focus:outline-none focus:border-sky-500"
            >
              {availableRegions.map((r: string) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-400">Window</label>
            <select
              value={dateRange}
              onChange={(e) => {
                setDateRange(e.target.value);
                loadDashboard(datasetId, region, e.target.value);
              }}
              className="px-2.5 py-1.5 text-xs bg-[#090D16] border border-slate-700 rounded text-white focus:outline-none focus:border-sky-500"
            >
              <option value="All">Full Period</option>
              <option value="Last 90 Days">Last 90 Days</option>
              <option value="Last 30 Days">Last 30 Days</option>
            </select>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 font-mono">
          {activeDataset.isSynthetic ? 'Source: Synthetic Benchmark Feed' : 'Source: User Uploaded Dataset'}
        </div>
      </Panel>

      {/* 8 Dynamic KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile
          label="Total Suppliers"
          value={kpis.totalSuppliers}
          subtext="Active entities in filtered view"
          tooltip="Distinct suppliers aggregated from the selected dataset and geographic filter."
        />
        <MetricTile
          label="Critical-Risk Suppliers"
          value={kpis.criticalRiskSuppliers}
          tone={kpis.criticalRiskSuppliers > 0 ? 'critical' : 'low'}
          subtext="Composite risk score ≥ 75/100"
          tooltip="Suppliers requiring immediate dual-sourcing or buffer intervention."
        />
        <MetricTile
          label="High-Risk Suppliers"
          value={kpis.highRiskSuppliers}
          tone={kpis.highRiskSuppliers > 0 ? 'high' : 'low'}
          subtext="Composite risk score 55–74/100"
          tooltip="Suppliers showing elevated transit delay or reliability degradation."
        />
        <MetricTile
          label="Overall Supply Risk"
          value={`${kpis.overallRiskScore} / 100`}
          tone={kpis.overallRiskScore >= 55 ? 'high' : 'medium'}
          subtext="Mean portfolio risk index"
          tooltip="Weighted average across supplier reliability, delay, and historical disruption rates."
        />
        <MetricTile
          label="Predicted Disruptions"
          value={kpis.predictedDisruptions}
          tone="critical"
          subtext={`Across ${activeDataset.totalRecords} filtered orders`}
          tooltip="Count of procurement orders flagged as disrupted in the active filtered dataset."
        />
        <MetricTile
          label="Delivery Delay Prob."
          value={`${kpis.deliveryDelayProbabilityPct}%`}
          tone="sky"
          subtext="Share of late shipments (>3d)"
          tooltip="Empirical rate of deliveries exceeding SLA lead-time tolerance."
        />
        <MetricTile
          label="Financial Exposure"
          value={formatUsd(kpis.financialExposureUsd)}
          tone="high"
          subtext="Annualized revenue & penalty at risk"
          tooltip="Sum of supplier annual spend multiplied by disruption probability and dependency margin factor."
        />
        <MetricTile
          label="Inventory Shortage Alerts"
          value={kpis.inventoryShortageWarnings}
          tone={kpis.inventoryShortageWarnings > 0 ? 'critical' : 'low'}
          subtext="Suppliers below safety stock"
          tooltip="Count of supplier accounts whose average on-hand stock falls below safety stock."
        />
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-12 gap-5">
        <Panel className="lg:col-span-7 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-display font-semibold text-white">
                Supplier Performance & Delay Trend
              </h2>
              <p className="text-[11px] text-slate-400">
                Period-by-period reliability (%) vs. average delivery delay (days)
              </p>
            </div>
            <Layers className="w-4 h-4 text-slate-500" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceTrends}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fill: '#94A3B8', fontSize: 11 }} domain={[0, 100]} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090D16',
                    borderColor: '#334155',
                    fontSize: '12px',
                    color: '#F8FAFC',
                  }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="reliability"
                  name="Reliability (%)"
                  stroke="#2DD4BF"
                  fill="#2DD4BF"
                  fillOpacity={0.14}
                  strokeWidth={2}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="avgDelay"
                  name="Avg Delay (Days)"
                  stroke="#F59E0B"
                  fill="#F59E0B"
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="lg:col-span-5 p-5">
          <div className="mb-4">
            <h2 className="text-sm font-display font-semibold text-white">
              Supplier Risk Distribution
            </h2>
            <p className="text-[11px] text-slate-400">
              Composite risk score (0–100) across top monitored accounts
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={supplierEntities.slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fill: '#CBD5E1', fontSize: 10 }}
                  tickFormatter={(v) => (String(v).length > 16 ? `${String(v).slice(0, 15)}…` : v)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090D16',
                    borderColor: '#334155',
                    fontSize: '12px',
                    color: '#F8FAFC',
                  }}
                />
                <Bar dataKey="riskScore" name="Risk Score" radius={[0, 3, 3, 0]}>
                  {supplierEntities.slice(0, 8).map((entry: any, idx: number) => (
                    <Cell
                      key={idx}
                      fill={
                        entry.riskScore >= 75
                          ? '#FB7185'
                          : entry.riskScore >= 55
                          ? '#FBBF24'
                          : entry.riskScore >= 35
                          ? '#38BDF8'
                          : '#34D399'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Drill-Down Supplier Risk Table */}
      <Panel className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-display font-semibold text-white">
              Monitored Supplier Risk Register
            </h2>
            <p className="text-[11px] text-slate-400">
              Click any supplier row to drill down into its full intelligence profile
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('suppliers')}
            className="text-xs text-sky-400 hover:text-sky-300 font-medium inline-flex items-center gap-1"
          >
            Compare Suppliers
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0D1320] text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-medium">Supplier</th>
                <th className="py-3 px-4 font-medium">Region</th>
                <th className="py-3 px-4 font-medium text-right">Reliability</th>
                <th className="py-3 px-4 font-medium text-right">Avg Delay</th>
                <th className="py-3 px-4 font-medium text-right">Disruption Rate</th>
                <th className="py-3 px-4 font-medium text-right">Exposure</th>
                <th className="py-3 px-4 font-medium text-right">Risk Score</th>
                <th className="py-3 px-4 font-medium">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {supplierEntities.map((s: any) => (
                <tr
                  key={s.name}
                  onClick={() => {
                    if (s.id) onSelectSupplierDrilldown(s.id);
                    else onNavigate('suppliers');
                  }}
                  className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 font-medium text-white">
                    {s.name}
                    {s.shortageWarning && (
                      <span className="ml-2 text-[10px] font-mono text-rose-400">· Shortage Warning</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-300">{s.region}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-slate-200">{s.avgReliability}%</td>
                  <td className="py-3 px-4 text-right tabular-nums text-slate-200">{s.avgDelayDays}d</td>
                  <td className="py-3 px-4 text-right tabular-nums text-slate-200">{s.disruptionRatePct}%</td>
                  <td className="py-3 px-4 text-right tabular-nums text-amber-300">{formatUsd(s.exposureUsd)}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold text-white">{s.riskScore}</td>
                  <td className="py-3 px-4">
                    <RiskTag category={s.riskCategory} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
