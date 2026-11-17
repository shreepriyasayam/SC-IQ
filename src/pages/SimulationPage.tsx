import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, GitBranch, Play } from 'lucide-react';
import { ErrorBanner, formatUsd, LoadingState, PageHeader, Panel } from '../ui/CommonUi.tsx';

const PRESETS = [
  { id: 'supplier_fails', label: 'Supplier Fails (Total Outage)' },
  { id: 'delay_increases', label: 'Delivery Delay Increases' },
  { id: 'reliability_drops', label: 'Supplier Reliability Drops' },
  { id: 'inventory_below_safety', label: 'Inventory Below Safety Stock' },
  { id: 'alternative_supplier', label: 'Alternative Supplier Selected' },
] as const;

export function SimulationPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [scenarioType, setScenarioType] = useState<string>('delay_increases');
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [alternativeSupplierId, setAlternativeSupplierId] = useState<string>('');
  const [delayIncreaseDays, setDelayIncreaseDays] = useState<number>(8);
  const [reliabilityDropPts, setReliabilityDropPts] = useState<number>(18);
  const [inventoryDropPct, setInventoryDropPct] = useState<number>(45);
  const [activeSim, setActiveSim] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function init() {
    setLoading(true);
    try {
      const [supRes, simRes] = await Promise.all([fetch('/api/suppliers'), fetch('/api/simulations')]);
      const supJson = await supRes.json();
      const simJson = await simRes.json();
      setSuppliers(supJson.suppliers || []);
      setHistory(simJson.simulations || []);
      if (supJson.suppliers?.length > 0) {
        setSupplierId(supJson.suppliers[0].id);
        const lowRisk = supJson.suppliers[supJson.suppliers.length - 1];
        if (lowRisk) setAlternativeSupplierId(String(lowRisk.id));
      }
      if (simJson.simulations?.length > 0) {
        setActiveSim(simJson.simulations[0]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    init();
  }, []);

  async function handleRunSimulation() {
    if (!supplierId) return;
    setRunning(true);
    setError('');
    try {
      const res = await fetch('/api/simulations/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioType,
          supplierId,
          alternativeSupplierId: alternativeSupplierId ? Number(alternativeSupplierId) : undefined,
          delayIncreaseDays,
          reliabilityDropPts,
          inventoryDropPct,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Simulation failed.');
      setActiveSim(json.simulation);
      const simRes = await fetch('/api/simulations');
      const simJson = await simRes.json();
      setHistory(simJson.simulations || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  if (loading && suppliers.length === 0) return <LoadingState label="Loading deterministic simulation engine..." />;

  const comparisonData = activeSim
    ? [
        {
          metric: 'Risk Score',
          Current: activeSim.current.riskScore,
          Simulated: activeSim.simulated.riskScore,
        },
        {
          metric: 'Disruption %',
          Current: activeSim.current.disruptionProbPct,
          Simulated: activeSim.simulated.disruptionProbPct,
        },
        {
          metric: 'Downtime (Hrs)',
          Current: activeSim.current.downtimeHours,
          Simulated: activeSim.simulated.downtimeHours,
        },
        {
          metric: 'Shortage (Days)',
          Current: activeSim.current.shortageDays,
          Simulated: activeSim.simulated.shortageDays,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        meta="Deterministic What-If Simulation Engine · ML-Calibrated Stress Testing"
        title="Supply Disruption Scenario Simulator"
        subtitle="Simulate supplier failures, transit delay surges, reliability decay, safety-stock depletion, or alternative supplier transitions and compare current vs. simulated impact."
        actions={
          <button
            type="button"
            disabled={running || !supplierId}
            onClick={handleRunSimulation}
            className="px-4 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {running ? 'Simulating...' : 'Run Deterministic Simulation'}
          </button>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid lg:grid-cols-12 gap-5">
        {/* Controls */}
        <Panel className="lg:col-span-4 p-5 space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1.5">Scenario Preset</label>
            <div className="space-y-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setScenarioType(p.id)}
                  className={`w-full text-left px-3 py-2 rounded border transition-colors ${
                    scenarioType === p.id
                      ? 'bg-sky-950/60 border-sky-500 text-white font-medium'
                      : 'bg-[#090D16] border-slate-800 text-slate-300 hover:bg-slate-800/40'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Target Supplier</label>
            <select
              value={supplierId || ''}
              onChange={(e) => setSupplierId(Number(e.target.value))}
              className="w-full px-3 py-2 bg-[#090D16] border border-slate-700 rounded text-white"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (Risk {s.risk_score})
                </option>
              ))}
            </select>
          </div>

          {scenarioType === 'delay_increases' && (
            <div>
              <label className="block text-slate-400 mb-1">
                Additional Transit Delay: <span className="text-white font-mono">+{delayIncreaseDays} days</span>
              </label>
              <input
                type="range"
                min={2}
                max={21}
                value={delayIncreaseDays}
                onChange={(e) => setDelayIncreaseDays(Number(e.target.value))}
                className="w-full accent-sky-500"
              />
            </div>
          )}

          {scenarioType === 'reliability_drops' && (
            <div>
              <label className="block text-slate-400 mb-1">
                Reliability Degradation: <span className="text-white font-mono">-{reliabilityDropPts} pts</span>
              </label>
              <input
                type="range"
                min={5}
                max={40}
                value={reliabilityDropPts}
                onChange={(e) => setReliabilityDropPts(Number(e.target.value))}
                className="w-full accent-sky-500"
              />
            </div>
          )}

          {scenarioType === 'inventory_below_safety' && (
            <div>
              <label className="block text-slate-400 mb-1">
                Inventory Depletion Shock: <span className="text-white font-mono">-{inventoryDropPct}%</span>
              </label>
              <input
                type="range"
                min={15}
                max={80}
                value={inventoryDropPct}
                onChange={(e) => setInventoryDropPct(Number(e.target.value))}
                className="w-full accent-sky-500"
              />
            </div>
          )}

          {scenarioType === 'alternative_supplier' && (
            <div>
              <label className="block text-slate-400 mb-1">Replacement / Dual-Source Supplier</label>
              <select
                value={alternativeSupplierId}
                onChange={(e) => setAlternativeSupplierId(e.target.value)}
                className="w-full px-3 py-2 bg-[#090D16] border border-slate-700 rounded text-white"
              >
                {suppliers
                  .filter((s) => s.id !== supplierId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Reliability {s.reliability_score}% · Delay {s.avg_delay_days}d)
                    </option>
                  ))}
              </select>
            </div>
          )}
        </Panel>

        {/* Results */}
        <div className="lg:col-span-8 space-y-5">
          {!activeSim ? (
            <Panel className="p-10 text-center space-y-2">
              <GitBranch className="w-8 h-8 text-sky-400 mx-auto" />
              <div className="text-sm font-medium text-white">Configure and run a What-If scenario</div>
              <p className="text-xs text-slate-400">
                Compare baseline supplier metrics against ML-recalibrated failure, delay, or dual-sourcing states.
              </p>
            </Panel>
          ) : (
            <>
              <Panel className="p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-800">
                  <div>
                    <div className="text-[11px] font-mono uppercase text-sky-400">
                      Scenario Result · {activeSim.targetSupplierName}
                    </div>
                    <h2 className="text-base font-display font-semibold text-white mt-0.5">
                      {activeSim.title}
                    </h2>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-[11px] text-slate-400">Exposure Delta</div>
                    <div
                      className={`text-lg font-display font-semibold ${
                        activeSim.deltaFinancialUsd > 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {activeSim.deltaFinancialUsd >= 0 ? '+' : ''}
                      {formatUsd(activeSim.deltaFinancialUsd)}
                    </div>
                  </div>
                </div>

                {/* Comparison Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
                  <div className="p-3 rounded bg-[#090D16] border border-slate-800">
                    <div className="text-slate-400 text-[11px]">Risk Score</div>
                    <div className="text-sm font-semibold text-white mt-1">
                      {activeSim.current.riskScore} →{' '}
                      <span className={activeSim.deltaRiskScore > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                        {activeSim.simulated.riskScore}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 rounded bg-[#090D16] border border-slate-800">
                    <div className="text-slate-400 text-[11px]">Disruption Prob</div>
                    <div className="text-sm font-semibold text-white mt-1">
                      {activeSim.current.disruptionProbPct}% →{' '}
                      <span className="text-sky-300">{activeSim.simulated.disruptionProbPct}%</span>
                    </div>
                  </div>
                  <div className="p-3 rounded bg-[#090D16] border border-slate-800">
                    <div className="text-slate-400 text-[11px]">Financial Exposure</div>
                    <div className="text-sm font-semibold text-white mt-1">
                      {formatUsd(activeSim.current.financialExposureUsd)} →{' '}
                      <span className="text-amber-300">{formatUsd(activeSim.simulated.financialExposureUsd)}</span>
                    </div>
                  </div>
                  <div className="p-3 rounded bg-[#090D16] border border-slate-800">
                    <div className="text-slate-400 text-[11px]">Shortage Runway</div>
                    <div className="text-sm font-semibold text-white mt-1">
                      {activeSim.current.shortageDays}d →{' '}
                      <span className="text-teal-300">{activeSim.simulated.shortageDays}d</span>
                    </div>
                  </div>
                </div>

                <div className="h-56 pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonData}>
                      <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                      <XAxis dataKey="metric" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#090D16',
                          borderColor: '#334155',
                          fontSize: '11px',
                        }}
                      />
                      <Bar dataKey="Current" fill="#64748B" />
                      <Bar dataKey="Simulated" fill="#38BDF8" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <div className="grid md:grid-cols-2 gap-5 text-xs">
                <Panel className="p-5 space-y-3">
                  <h3 className="text-sm font-display font-semibold text-white">Operational Consequences</h3>
                  <ul className="space-y-2 text-slate-300 list-disc pl-4">
                    {activeSim.operationalConsequences.map((c: string, i: number) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                  <div className="pt-2 border-t border-slate-800">
                    <div className="text-[11px] font-mono text-slate-400 mb-1">Calculation Trace</div>
                    {activeSim.calculationTrace.map((t: string, i: number) => (
                      <div key={i} className="text-[11px] text-slate-400">
                        · {t}
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel className="p-5 space-y-3">
                  <h3 className="text-sm font-display font-semibold text-white">Recommended Decision</h3>
                  <div className="p-3.5 rounded bg-emerald-950/30 border border-emerald-800/60 text-emerald-100 flex items-start gap-2.5 leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{activeSim.recommendedDecision}</span>
                  </div>
                  {history.length > 0 && (
                    <div className="pt-2 border-t border-slate-800">
                      <div className="text-[11px] text-slate-400 mb-1.5">Recent Simulations</div>
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {history.slice(0, 5).map((h: any, idx: number) => (
                          <button
                            key={h.id || idx}
                            type="button"
                            onClick={() => setActiveSim(h)}
                            className="w-full text-left px-2.5 py-1.5 rounded bg-[#090D16] hover:bg-slate-800 text-[11px] text-slate-300 truncate"
                          >
                            {h.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Panel>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
