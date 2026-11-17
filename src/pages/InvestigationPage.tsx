import React, { useEffect, useState } from 'react';
import { Bot, CheckCircle2, Play, ShieldCheck } from 'lucide-react';
import { ErrorBanner, LoadingState, PageHeader, Panel } from '../ui/CommonUi.tsx';

export function InvestigationPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [investigations, setInvestigations] = useState<any[]>([]);
  const [activeReport, setActiveReport] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadData() {
    setLoading(true);
    try {
      const [supRes, invRes] = await Promise.all([fetch('/api/suppliers'), fetch('/api/investigations')]);
      const supJson = await supRes.json();
      const invJson = await invRes.json();
      setSuppliers(supJson.suppliers || []);
      setInvestigations(invJson.investigations || []);
      if (supJson.suppliers?.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(supJson.suppliers[0].id);
      }
      if (invJson.investigations?.length > 0 && !activeReport) {
        setActiveReport(invJson.investigations[0]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleRunAgent() {
    if (!selectedSupplierId) return;
    setRunning(true);
    setError('');
    try {
      const res = await fetch('/api/investigations/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: selectedSupplierId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Investigation failed.');
      setActiveReport(json.investigation);
      const invRes = await fetch('/api/investigations');
      const invJson = await invRes.json();
      setInvestigations(invJson.investigations || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  if (loading && suppliers.length === 0) return <LoadingState label="Initializing AI Investigation Agent..." />;

  return (
    <div className="space-y-6">
      <PageHeader
        meta="AI Investigation Centre · 7-Step Evidence-Grounded Workflow"
        title="Autonomous Supplier Risk Investigation Agent"
        subtitle="Execute a structured 7-step investigation across supplier telemetry, historical delivery trends, ML feature attributions, root causes, financial loss projections, and grounded mitigation planning."
        actions={
          <>
            <select
              value={selectedSupplierId || ''}
              onChange={(e) => setSelectedSupplierId(Number(e.target.value))}
              className="px-3 py-2 text-xs bg-[#111827] border border-slate-700 rounded-md text-white"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (Risk {s.risk_score}/100 · {s.risk_category})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={running || !selectedSupplierId}
              onClick={handleRunAgent}
              className="px-4 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              {running ? 'Investigating 7 Steps...' : 'Run 7-Step Investigation'}
            </button>
          </>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid lg:grid-cols-12 gap-5">
        {/* Main 7-Step Investigation Trace */}
        <div className="lg:col-span-8 space-y-5">
          {!activeReport ? (
            <Panel className="p-10 text-center space-y-3">
              <Bot className="w-8 h-8 text-sky-400 mx-auto" />
              <div className="text-sm font-medium text-white">No investigation trace selected yet</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Select a high-risk supplier above and click Run 7-Step Investigation to inspect evidence retrieval,
                ML risk attribution, consequence estimation, and mitigation synthesis.
              </p>
            </Panel>
          ) : (
            <>
              <Panel className="p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-teal-400">
                      Target Investigation · {activeReport.supplierName}
                    </div>
                    <h2 className="text-base font-display font-semibold text-white mt-0.5">
                      Executive Investigation Summary
                    </h2>
                  </div>
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-sky-300">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {activeReport.engineUsed}
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">{activeReport.summary}</p>
              </Panel>

              {/* 7 Steps */}
              <Panel className="p-5 space-y-4">
                <h3 className="text-sm font-display font-semibold text-white">
                  7-Step Investigation Agent Execution Trace
                </h3>
                <div className="space-y-3">
                  {activeReport.workflowSteps.map((step: any) => (
                    <div
                      key={step.stepNumber}
                      className="p-4 rounded-md bg-[#090D16] border border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-white">
                          <span className="w-5 h-5 rounded-full bg-sky-950 border border-sky-700 text-sky-300 text-[11px] font-mono inline-flex items-center justify-center">
                            {step.stepNumber}
                          </span>
                          <span>{step.title}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Verified
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed pl-7">{step.findings}</p>
                      {step.evidenceData && (
                        <div className="pl-7 flex flex-wrap gap-4 pt-1 text-[11px] font-mono text-slate-400">
                          {Object.entries(step.evidenceData).map(([k, v]) => (
                            <span key={k}>
                              {k}: <strong className="text-slate-200">{String(v)}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>

              {/* Mitigation Plan */}
              <Panel className="p-5 space-y-3">
                <h3 className="text-sm font-display font-semibold text-white">
                  Prioritized Mitigation Action Plan
                </h3>
                <ul className="space-y-2 text-xs text-slate-200">
                  {activeReport.mitigationPlan.map((m: string, idx: number) => (
                    <li
                      key={idx}
                      className="p-3 rounded bg-[#090D16] border border-slate-800 flex items-start gap-2.5"
                    >
                      <span className="text-teal-400 font-mono font-semibold">0{idx + 1}.</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </>
          )}
        </div>

        {/* Past Investigations Log */}
        <Panel className="lg:col-span-4 p-4 space-y-3 h-fit">
          <h3 className="text-sm font-display font-semibold text-white">Investigation History</h3>
          {investigations.length === 0 ? (
            <div className="text-xs text-slate-400 py-4">No completed investigations recorded yet.</div>
          ) : (
            <div className="space-y-2">
              {investigations.map((inv) => (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => setActiveReport(inv)}
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    activeReport?.id === inv.id
                      ? 'bg-slate-800/70 border-sky-600'
                      : 'bg-[#090D16] border-slate-800 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="text-xs font-medium text-white">{inv.supplierName}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">{inv.engineUsed}</div>
                  <div className="text-[10px] font-mono text-slate-500 mt-1">
                    {inv.createdAt || 'Completed'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
