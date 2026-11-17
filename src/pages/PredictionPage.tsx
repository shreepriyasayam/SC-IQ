import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, CheckCircle2 } from 'lucide-react';
import { ErrorBanner, MetricTile, PageHeader, Panel, RiskTag } from '../ui/CommonUi.tsx';

export function PredictionPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [runId, setRunId] = useState<string>('');
  const [form, setForm] = useState({
    supplier_reliability: 63,
    delivery_delay_days: 9,
    supplier_dependency_pct: 31,
    shipment_distance_km: 10800,
    inventory_level: 650,
    safety_stock: 1100,
    order_quantity: 2300,
    historical_disruptions: 4,
    defect_rate_pct: 2.3,
    financial_health_score: 68,
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function runPrediction(selectedRunId = runId, payload = form) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, runId: selectedRunId ? Number(selectedRunId) : undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Prediction failed.');
      setResult(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch('/api/ml/runs')
      .then((r) => r.json())
      .then((d) => {
        const list = d.runs || [];
        setRuns(list);
        const prod = list.find((r: any) => r.isProduction) || list[0];
        if (prod) {
          setRunId(String(prod.id));
          runPrediction(String(prod.id), form);
        }
      })
      .catch(() => {});
  }, []);

  function updateField(key: keyof typeof form, val: number) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        meta="Predictive Risk Inference · Live Trained ML Scoring"
        title="Supply Risk Prediction Centre"
        subtitle="Score supplier delivery delay risk, disruption probability, and inventory shortage exposure using any trained ML artifact, complete with local feature attributions and mitigation guidance."
        actions={
          <button
            type="button"
            disabled={loading}
            onClick={() => runPrediction()}
            className="px-4 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Activity className="w-3.5 h-3.5" />
            {loading ? 'Scoring...' : 'Run ML Risk Prediction'}
          </button>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid lg:grid-cols-12 gap-5">
        {/* Input Controls */}
        <Panel className="lg:col-span-5 p-5 space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Trained ML Model Artifact</label>
            <select
              value={runId}
              onChange={(e) => {
                setRunId(e.target.value);
                runPrediction(e.target.value, form);
              }}
              className="w-full px-3 py-2 bg-[#090D16] border border-slate-700 rounded text-white"
            >
              {runs.slice(0, 10).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.algorithm} (F1 {(r.f1Score * 100).toFixed(1)}% · {r.targetColumn}) {r.isProduction ? '★ Active' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
            <div>
              <label className="block text-slate-400 mb-1">Supplier Reliability (%)</label>
              <input
                type="number"
                min={10}
                max={100}
                value={form.supplier_reliability}
                onChange={(e) => updateField('supplier_reliability', Number(e.target.value))}
                className="w-full px-3 py-1.5 bg-[#090D16] border border-slate-700 rounded text-white tabular-nums"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Avg Delivery Delay (Days)</label>
              <input
                type="number"
                step="0.5"
                value={form.delivery_delay_days}
                onChange={(e) => updateField('delivery_delay_days', Number(e.target.value))}
                className="w-full px-3 py-1.5 bg-[#090D16] border border-slate-700 rounded text-white tabular-nums"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Supplier Dependency (%)</label>
              <input
                type="number"
                value={form.supplier_dependency_pct}
                onChange={(e) => updateField('supplier_dependency_pct', Number(e.target.value))}
                className="w-full px-3 py-1.5 bg-[#090D16] border border-slate-700 rounded text-white tabular-nums"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Shipment Distance (km)</label>
              <input
                type="number"
                value={form.shipment_distance_km}
                onChange={(e) => updateField('shipment_distance_km', Number(e.target.value))}
                className="w-full px-3 py-1.5 bg-[#090D16] border border-slate-700 rounded text-white tabular-nums"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Inventory Level (Units)</label>
              <input
                type="number"
                value={form.inventory_level}
                onChange={(e) => updateField('inventory_level', Number(e.target.value))}
                className="w-full px-3 py-1.5 bg-[#090D16] border border-slate-700 rounded text-white tabular-nums"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Order Quantity (Units)</label>
              <input
                type="number"
                value={form.order_quantity}
                onChange={(e) => updateField('order_quantity', Number(e.target.value))}
                className="w-full px-3 py-1.5 bg-[#090D16] border border-slate-700 rounded text-white tabular-nums"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Safety Stock Threshold</label>
              <input
                type="number"
                value={form.safety_stock}
                onChange={(e) => updateField('safety_stock', Number(e.target.value))}
                className="w-full px-3 py-1.5 bg-[#090D16] border border-slate-700 rounded text-white tabular-nums"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Historical Disruptions (12m)</label>
              <input
                type="number"
                value={form.historical_disruptions}
                onChange={(e) => updateField('historical_disruptions', Number(e.target.value))}
                className="w-full px-3 py-1.5 bg-[#090D16] border border-slate-700 rounded text-white tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                const highRisk = {
                  ...form,
                  supplier_reliability: 55,
                  delivery_delay_days: 12,
                  supplier_dependency_pct: 36,
                  inventory_level: 480,
                  historical_disruptions: 5,
                };
                setForm(highRisk);
                runPrediction(runId, highRisk);
              }}
              className="px-3 py-1.5 rounded bg-rose-950/50 border border-rose-800/70 text-rose-200 hover:bg-rose-950"
            >
              Load High-Risk Preset
            </button>
            <button
              type="button"
              onClick={() => {
                const resilient = {
                  ...form,
                  supplier_reliability: 94,
                  delivery_delay_days: 1.5,
                  supplier_dependency_pct: 12,
                  inventory_level: 2100,
                  historical_disruptions: 0,
                };
                setForm(resilient);
                runPrediction(runId, resilient);
              }}
              className="px-3 py-1.5 rounded bg-emerald-950/50 border border-emerald-800/70 text-emerald-200 hover:bg-emerald-950"
            >
              Load Resilient Preset
            </button>
          </div>
        </Panel>

        {/* Prediction Results */}
        <div className="lg:col-span-7 space-y-5">
          {result && (
            <>
              <Panel className="p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
                  <div>
                    <div className="text-[11px] font-mono text-sky-400 uppercase">
                      Model: {result.modelUsed} · Target: {result.targetColumn}
                    </div>
                    <h2 className="text-lg font-display font-semibold text-white mt-0.5">
                      Predicted Outcome: {result.predictedOutcome}
                    </h2>
                  </div>
                  <RiskTag category={result.riskCategory} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <MetricTile
                    label="Disruption Risk"
                    value={`${(result.disruptionRiskProb * 100).toFixed(1)}%`}
                    tone={result.disruptionRiskProb >= 0.6 ? 'critical' : result.disruptionRiskProb >= 0.4 ? 'high' : 'low'}
                  />
                  <MetricTile
                    label="Delivery Delay Risk"
                    value={`${(result.delayRiskProb * 100).toFixed(1)}%`}
                    tone={result.delayRiskProb >= 0.6 ? 'high' : 'sky'}
                  />
                  <MetricTile
                    label="Inventory Shortage Risk"
                    value={`${(result.shortageRiskProb * 100).toFixed(1)}%`}
                    tone={result.shortageRiskProb >= 0.6 ? 'critical' : 'medium'}
                  />
                </div>

                <div className="p-3.5 rounded bg-[#090D16] border border-slate-800 text-xs text-slate-200 leading-relaxed">
                  {result.explanation}
                </div>
              </Panel>

              <div className="grid md:grid-cols-2 gap-5">
                <Panel className="p-5">
                  <h3 className="text-sm font-display font-semibold text-white">
                    Contributing Risk Attributions
                  </h3>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Positive bars push risk up; negative bars stabilize supply
                  </p>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={result.contributingFactors} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                        <YAxis type="category" dataKey="feature" width={135} tick={{ fill: '#CBD5E1', fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#090D16',
                            borderColor: '#334155',
                            fontSize: '11px',
                          }}
                        />
                        <Bar dataKey="contribution" name="Risk Contribution">
                          {result.contributingFactors.map((f: any, idx: number) => (
                            <Cell key={idx} fill={f.contribution >= 0 ? '#FB7185' : '#2DD4BF'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>

                <Panel className="p-5 space-y-3">
                  <h3 className="text-sm font-display font-semibold text-white">
                    Suggested Operational Actions
                  </h3>
                  <ul className="space-y-2.5 text-xs text-slate-300">
                    {result.suggestedActions.map((act: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 p-2.5 rounded bg-[#090D16] border border-slate-800">
                        <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
