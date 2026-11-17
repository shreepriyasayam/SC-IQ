import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { AlertTriangle, Lightbulb } from 'lucide-react';
import { ErrorBanner, LoadingState, PageHeader, Panel } from '../ui/CommonUi.tsx';

export function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/analytics')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Running correlation matrix & anomaly detection..." />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  const {
    datasetName,
    recordCount,
    numericCols,
    correlations,
    regionalComparison,
    delayDistribution,
    anomalies,
    trends,
    supplierPerformance,
    interpretations,
  } = data;

  const corrLookup = new Map<string, number>(correlations.map((c: any) => [`${c.x}::${c.y}`, c.value]));

  return (
    <div className="space-y-6">
      <PageHeader
        meta={`Analytical Intelligence · ${datasetName} · ${recordCount} Records`}
        title="Statistical Analytics, Correlation & Anomaly Detection"
        subtitle="Explore supplier performance dispersion, regional risk concentration, Pearson correlation drivers, unsupervised multivariate Z-score anomalies, and plain-English business takeaways."
      />

      {/* Plain-English Interpretations */}
      <div className="grid md:grid-cols-2 gap-5">
        {interpretations.map((item: any) => (
          <Panel key={item.title} className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-teal-400">
              <Lightbulb className="w-4 h-4" />
              {item.title}
            </div>
            <p className="text-xs text-white leading-relaxed">{item.summary}</p>
            <p className="text-xs text-slate-400 leading-relaxed">{item.businessMeaning}</p>
          </Panel>
        ))}
      </div>

      {/* Regional Comparison + Delay Histogram */}
      <div className="grid lg:grid-cols-12 gap-5">
        <Panel className="lg:col-span-7 p-5">
          <h2 className="text-sm font-display font-semibold text-white">Regional Risk Comparison</h2>
          <p className="text-[11px] text-slate-400 mb-4">
            Disruption rate (%) vs. average delivery delay (days) by corridor
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regionalComparison}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                <XAxis dataKey="region" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090D16',
                    borderColor: '#334155',
                    fontSize: '11px',
                  }}
                />
                <Bar dataKey="disruptionRatePct" name="Disruption Rate %" fill="#FB7185" />
                <Bar dataKey="avgDelayDays" name="Avg Delay (Days)" fill="#FBBF24" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="lg:col-span-5 p-5">
          <h2 className="text-sm font-display font-semibold text-white">Delivery Delay Distribution</h2>
          <p className="text-[11px] text-slate-400 mb-4">Order frequency across transit delay buckets</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={delayDistribution}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090D16',
                    borderColor: '#334155',
                    fontSize: '11px',
                  }}
                />
                <Bar dataKey="count" name="Orders" fill="#38BDF8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Dependency Scatter & Historical Trends */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Panel className="p-5">
          <h2 className="text-sm font-display font-semibold text-white">
            Dependency Share vs. Risk Concentration
          </h2>
          <p className="text-[11px] text-slate-400 mb-4">
            Each point represents a Tier-1 supplier (X: Dependency %, Y: Risk Score)
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="dependencySharePct" name="Dependency %" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <YAxis type="number" dataKey="riskScore" name="Risk Score" domain={[0, 100]} tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <ZAxis type="number" dataKey="avgDelayDays" range={[60, 300]} name="Avg Delay" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{
                    backgroundColor: '#090D16',
                    borderColor: '#334155',
                    fontSize: '11px',
                  }}
                />
                <Scatter name="Suppliers" data={supplierPerformance} fill="#2DD4BF" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="text-sm font-display font-semibold text-white">Historical Portfolio Trend</h2>
          <p className="text-[11px] text-slate-400 mb-4">
            Mean on-time fulfillment (%) & total disruptions over trailing periods
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090D16',
                    borderColor: '#334155',
                    fontSize: '11px',
                  }}
                />
                <Line type="monotone" dataKey="onTimePct" name="On-Time %" stroke="#2DD4BF" strokeWidth={2} />
                <Line type="monotone" dataKey="disruptions" name="Disruptions" stroke="#FB7185" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Pearson Correlation Matrix */}
      <Panel className="p-5 overflow-x-auto">
        <h2 className="text-sm font-display font-semibold text-white">
          Pearson Risk Correlation Matrix (r)
        </h2>
        <p className="text-[11px] text-slate-400 mb-4">
          Linear association strength between operational telemetry attributes and disruption incidence
        </p>
        <table className="w-full text-[11px] font-mono tabular-nums border-collapse">
          <thead>
            <tr>
              <th className="py-2 px-2 text-left text-slate-400">Feature</th>
              {numericCols.map((c: string) => (
                <th key={c} className="py-2 px-2 text-center text-slate-400">
                  {c.replace(/_/g, ' ').slice(0, 11)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {numericCols.map((rCol: string) => (
              <tr key={rCol}>
                <td className="py-2 px-2 text-slate-300 whitespace-nowrap">{rCol}</td>
                {numericCols.map((cCol: string) => {
                  const v = corrLookup.get(`${rCol}::${cCol}`) ?? 0;
                  const intensity = Math.min(0.75, Math.abs(v) * 0.75);
                  const bg =
                    v >= 0
                      ? `rgba(244, 63, 94, ${intensity * 0.55})`
                      : `rgba(45, 212, 191, ${intensity * 0.55})`;
                  return (
                    <td
                      key={cCol}
                      style={{ backgroundColor: rCol === cCol ? 'rgba(30,41,59,0.8)' : bg }}
                      className="py-2 px-2 text-center text-white border border-slate-900"
                    >
                      {v.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {/* Unsupervised Anomaly Detection */}
      <Panel className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <div>
            <h2 className="text-sm font-display font-semibold text-white">
              Unsupervised Multivariate Anomaly Detection (L2 Z-Score)
            </h2>
            <p className="text-[11px] text-slate-400">
              Top procurement order anomalies exhibiting extreme multi-feature deviation from portfolio baseline
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0D1320] text-slate-400 text-[10px] uppercase border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4">Order / Record</th>
                <th className="py-2.5 px-4">Supplier</th>
                <th className="py-2.5 px-4">Region</th>
                <th className="py-2.5 px-4 text-right">Delay</th>
                <th className="py-2.5 px-4 text-right">Reliability</th>
                <th className="py-2.5 px-4 text-right">Anomaly Z-Score</th>
                <th className="py-2.5 px-4">Primary Deviant Drivers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 tabular-nums">
              {(anomalies || []).map((a: any) => (
                <tr key={a.rowIndex} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-4 font-mono text-slate-200">{a.orderId || `REC-${a.rowIndex}`}</td>
                  <td className="py-2.5 px-4 text-white">{a.supplierName}</td>
                  <td className="py-2.5 px-4 text-slate-300">{a.region}</td>
                  <td className="py-2.5 px-4 text-right text-amber-300">{a.delayDays ?? 0}d</td>
                  <td className="py-2.5 px-4 text-right text-slate-200">{a.reliability ?? 0}%</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-rose-400">{a.anomalyScore}</td>
                  <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">
                    {Array.isArray(a.drivers) ? a.drivers.join(', ') : a.primaryDeviation || '—'}
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
