import React, { useEffect, useState } from 'react';
import { CheckSquare, RefreshCw } from 'lucide-react';
import { ErrorBanner, LoadingState, PageHeader, Panel, RiskTag } from '../ui/CommonUi.tsx';

export function DecisionsPage() {
  const [decisions, setDecisions] = useState<any[]>([]);
  const [filter, setFilter] = useState<'All' | 'Open' | 'In Progress' | 'Completed'>('All');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  async function loadDecisions() {
    setLoading(true);
    try {
      const res = await fetch('/api/decisions');
      const json = await res.json();
      setDecisions(json.decisions || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDecisions();
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/decisions/sync', { method: 'POST' });
      const json = await res.json();
      setDecisions(json.decisions || []);
    } finally {
      setSyncing(false);
    }
  }

  async function handleStatusChange(id: number, status: string) {
    await fetch(`/api/decisions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await loadDecisions();
  }

  if (loading) return <LoadingState label="Loading decision intelligence recommendations..." />;

  const filtered = filter === 'All' ? decisions : decisions.filter((d) => d.status === filter);

  return (
    <div className="space-y-6">
      <PageHeader
        meta="Decision Intelligence · Grounded Procurement Actions"
        title="Actionable Supply Chain Recommendations"
        subtitle="Prioritized risk-mitigation decisions generated directly from live supplier telemetry and active ML predictions, complete with supporting evidence and workflow status tracking."
        actions={
          <button
            type="button"
            disabled={syncing}
            onClick={handleSync}
            className="px-3.5 py-2 text-xs font-medium bg-[#111827] hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Sync From Live Risk State
          </button>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(['All', 'Open', 'In Progress', 'Completed'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            className={`px-3.5 py-1.5 rounded-md border transition-colors ${
              filter === tab
                ? 'bg-sky-600 border-sky-500 text-white font-medium'
                : 'bg-[#111827] border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {tab} ({tab === 'All' ? decisions.length : decisions.filter((d) => d.status === tab).length})
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtered.map((d) => (
          <Panel key={d.id} className="p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 text-[11px] font-mono text-slate-400">
                  <RiskTag category={d.priority} />
                  <span>·</span>
                  <span className="text-sky-400">{d.supplier_name}</span>
                  <span>·</span>
                  <span>Status: {d.status}</span>
                </div>
                <h2 className="text-sm sm:text-base font-display font-semibold text-white">{d.problem}</h2>
              </div>

              <div className="flex items-center gap-1.5 text-xs shrink-0">
                {(['Open', 'In Progress', 'Completed'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleStatusChange(d.id, st)}
                    className={`px-2.5 py-1 rounded border text-[11px] ${
                      d.status === st
                        ? 'bg-teal-700 border-teal-500 text-white'
                        : 'bg-[#090D16] border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="p-3 rounded bg-[#090D16] border border-slate-800">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono mb-1">
                  Supporting Evidence
                </div>
                <p className="text-slate-200 leading-relaxed">{d.evidence}</p>
              </div>
              <div className="p-3 rounded bg-[#090D16] border border-slate-800">
                <div className="text-[10px] uppercase tracking-wider text-teal-400 font-mono mb-1">
                  Recommended Action
                </div>
                <p className="text-white leading-relaxed">{d.recommended_action}</p>
              </div>
              <div className="p-3 rounded bg-[#090D16] border border-slate-800">
                <div className="text-[10px] uppercase tracking-wider text-sky-400 font-mono mb-1">
                  Expected Benefit
                </div>
                <p className="text-slate-200 leading-relaxed">{d.expected_benefit}</p>
              </div>
              <div className="p-3 rounded bg-[#090D16] border border-slate-800">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono mb-1">
                  Business Explanation
                </div>
                <p className="text-slate-300 leading-relaxed">{d.explanation}</p>
              </div>
            </div>
          </Panel>
        ))}

        {filtered.length === 0 && (
          <Panel className="p-8 text-center text-xs text-slate-400">
            <CheckSquare className="w-6 h-6 text-slate-500 mx-auto mb-2" />
            No recommendations in "{filter}" status.
          </Panel>
        )}
      </div>
    </div>
  );
}
