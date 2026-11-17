import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Calculator } from 'lucide-react';
import { ErrorBanner, formatUsd, LoadingState, MetricTile, PageHeader, Panel } from '../ui/CommonUi.tsx';

export function BusinessImpactPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/business-impact')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Computing financial & operational impact models..." />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        meta="Business Impact Intelligence · Transparent Financial & Operational Quantification"
        title="Financial Exposure, Downtime & Concentration Analysis"
        subtitle="Translate machine-learning disruption probabilities into concrete annualized dollar exposure, production interruption hours, inventory shortage runway, and procurement expedite premiums."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricTile
          label="Total Financial Exposure"
          value={formatUsd(data.totalFinancialExposureUsd)}
          tone="critical"
          tooltip="Annualized expected margin and SLA penalty exposure across all monitored suppliers."
        />
        <MetricTile
          label="Production Downtime"
          value={`${data.estimatedProductionLossHours} hrs`}
          tone="high"
          tooltip="Expected downstream assembly interruption hours weighted by supplier dependency."
        />
        <MetricTile
          label="Avg Shortage Runway"
          value={`${data.avgInventoryShortageDays} days`}
          tone="sky"
          tooltip="Mean expected inventory stockout duration across active accounts."
        />
        <MetricTile
          label="Procurement Cost Surge"
          value={formatUsd(data.expectedProcurementCostSurgeUsd)}
          tone="medium"
          tooltip="Estimated emergency spot-buy and air-freight expedite surcharges."
        />
        <MetricTile
          label="Spend Concentration (HHI)"
          value={data.dependencyConcentrationIndex}
          tone={data.dependencyConcentrationIndex > 1800 ? 'high' : 'low'}
          subtext={data.dependencyConcentrationIndex > 1800 ? 'Concentrated Sourcing' : 'Diversified Portfolio'}
          tooltip="Herfindahl-Hirschman Index across supplier annual spend shares (0–10,000)."
        />
      </div>

      {/* Chart & Supplier Breakdown */}
      <div className="grid lg:grid-cols-12 gap-5">
        <Panel className="lg:col-span-5 p-5">
          <h2 className="text-sm font-display font-semibold text-white">
            Top Financial Exposure by Supplier
          </h2>
          <p className="text-[11px] text-slate-400 mb-4">Expected annualized loss vs. expedite cost surge (USD)</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topImpactedSuppliers.slice(0, 7)} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#94A3B8', fontSize: 10 }} tickFormatter={(v) => formatUsd(v)} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={125}
                  tick={{ fill: '#CBD5E1', fontSize: 10 }}
                  tickFormatter={(v) => (String(v).length > 16 ? `${String(v).slice(0, 15)}…` : v)}
                />
                <Tooltip
                  formatter={(v: any) => formatUsd(Number(v))}
                  contentStyle={{
                    backgroundColor: '#090D16',
                    borderColor: '#334155',
                    fontSize: '11px',
                  }}
                />
                <Bar dataKey="estimatedLossUsd" name="Financial Loss" fill="#FB7185" />
                <Bar dataKey="procurementImpactUsd" name="Expedite Surge" fill="#FBBF24" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="lg:col-span-7 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-sm font-display font-semibold text-white">
              Supplier-Level Business Impact Ledger
            </h2>
          </div>
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0D1320] text-slate-400 text-[10px] uppercase border-b border-slate-800 sticky top-0">
                <tr>
                  <th className="py-2.5 px-4">Supplier</th>
                  <th className="py-2.5 px-4 text-right">Dep. %</th>
                  <th className="py-2.5 px-4 text-right">Disruption Prob</th>
                  <th className="py-2.5 px-4 text-right">Financial Loss</th>
                  <th className="py-2.5 px-4 text-right">Downtime</th>
                  <th className="py-2.5 px-4 text-right">Shortage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 tabular-nums">
                {data.topImpactedSuppliers.map((s: any) => (
                  <tr key={s.supplierId} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-medium text-white">{s.name}</td>
                    <td className="py-2.5 px-4 text-right text-slate-300">{s.dependencySharePct}%</td>
                    <td className="py-2.5 px-4 text-right text-sky-300">{(s.disruptionProb * 100).toFixed(1)}%</td>
                    <td className="py-2.5 px-4 text-right font-semibold text-rose-400">{formatUsd(s.estimatedLossUsd)}</td>
                    <td className="py-2.5 px-4 text-right text-amber-300">{s.productionDowntimeHours}h</td>
                    <td className="py-2.5 px-4 text-right text-slate-200">{s.shortageDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {/* Explicit Mathematical Formulas & Assumptions */}
      <Panel className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-teal-400" />
          <h2 className="text-sm font-display font-semibold text-white">
            Explicit Formulas & Modeling Assumptions
          </h2>
        </div>
        <div className="divide-y divide-slate-800/70">
          {data.formulasAndAssumptions.map((f: any) => (
            <div key={f.metric} className="p-4 grid md:grid-cols-12 gap-3 text-xs items-center">
              <div className="md:col-span-3 font-medium text-white">{f.metric}</div>
              <div className="md:col-span-4 font-mono text-sky-300 bg-[#090D16] px-3 py-1.5 rounded border border-slate-800">
                {f.formula}
              </div>
              <div className="md:col-span-5 text-slate-400 leading-relaxed">{f.assumption}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
