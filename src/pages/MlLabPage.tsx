import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Award, CheckCircle2, Play, Sparkles } from 'lucide-react';
import { ErrorBanner, LoadingState, PageHeader, Panel } from '../ui/CommonUi.tsx';

const ALGORITHMS = [
  'Logistic Regression',
  'Decision Tree',
  'Random Forest',
  'Gradient Boosting',
  'XGBoost',
] as const;

const ALGO_COLORS: Record<string, string> = {
  'Logistic Regression': '#94A3B8',
  'Decision Tree': '#F59E0B',
  'Random Forest': '#2DD4BF',
  'Gradient Boosting': '#38BDF8',
  XGBoost: '#A78BFA',
};

export function MlLabPage() {
  const [datasets, setDatasets] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [datasetId, setDatasetId] = useState<number>(1);
  const [targetColumn, setTargetColumn] = useState<string>('disruption_occurred');
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [selectedAlgos, setSelectedAlgos] = useState<string[]>([...ALGORITHMS]);
  const [testSize, setTestSize] = useState<number>(0.25);
  const [cvFolds, setCvFolds] = useState<number>(5);
  const [autoTune, setAutoTune] = useState<boolean>(true);
  const [training, setTraining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [batchSummary, setBatchSummary] = useState<{ bestAlgorithm: string; explanation: string } | null>(null);
  const [inspectRunId, setInspectRunId] = useState<number | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [dsRes, runsRes] = await Promise.all([fetch('/api/datasets'), fetch('/api/ml/runs')]);
      const dsJson = await dsRes.json();
      const runsJson = await runsRes.json();
      setDatasets(dsJson.datasets || []);
      setRuns(runsJson.runs || []);

      const firstDs = dsJson.datasets?.[0];
      if (firstDs) {
        setDatasetId(firstDs.id);
        setSelectedFeatures(firstDs.qualityReport?.selectableFeatures || []);
        if (firstDs.qualityReport?.validTargetColumns?.length > 0) {
          setTargetColumn(firstDs.qualityReport.validTargetColumns[0]);
        }
      }
      if (runsJson.runs?.length > 0) {
        const prod = runsJson.runs.find((r: any) => r.isProduction) || runsJson.runs[0];
        setInspectRunId(prod.id);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const currentDataset = datasets.find((d) => d.id === datasetId);
  const availableFeatures: string[] = currentDataset?.qualityReport?.selectableFeatures || [];
  const allTargets: string[] = currentDataset?.qualityReport?.validTargetColumns || ['disruption_occurred'];

  function handleDatasetChange(id: number) {
    setDatasetId(id);
    const ds = datasets.find((d) => d.id === id);
    if (ds?.qualityReport) {
      setSelectedFeatures(ds.qualityReport.selectableFeatures || []);
      if (ds.qualityReport.validTargetColumns?.length > 0) {
        setTargetColumn(ds.qualityReport.validTargetColumns[0]);
      }
    }
  }

  async function handleTrainBatch() {
    setError('');
    setTraining(true);
    try {
      const res = await fetch('/api/ml/train-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId,
          targetColumn,
          featureColumns: selectedFeatures,
          algorithms: selectedAlgos,
          testSize,
          cvFolds,
          autoTune,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Training failed.');
      setBatchSummary({ bestAlgorithm: json.bestAlgorithm, explanation: json.explanation });
      const runsRes = await fetch('/api/ml/runs');
      const runsJson = await runsRes.json();
      setRuns(runsJson.runs || []);
      const winner = json.runs?.find((r: any) => r.isProduction) || json.runs?.[0];
      if (winner?.id) setInspectRunId(winner.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTraining(false);
    }
  }

  async function handlePromote(runId: number) {
    await fetch(`/api/ml/runs/${runId}/promote`, { method: 'POST' });
    const runsRes = await fetch('/api/ml/runs');
    const runsJson = await runsRes.json();
    setRuns(runsJson.runs || []);
    setInspectRunId(runId);
  }

  if (loading) return <LoadingState label="Initializing ML Experimentation Lab..." />;

  // Latest batch for clean 5-model comparison (latest run per algorithm for selected dataset & target, or latest 5 runs)
  const latestRunsByAlgo = new Map<string, any>();
  for (const r of runs) {
    if (!latestRunsByAlgo.has(r.algorithm)) {
      latestRunsByAlgo.set(r.algorithm, r);
    }
  }
  const comparisonRuns = Array.from(latestRunsByAlgo.values());
  const bestRun =
    comparisonRuns.find((r) => r.isProduction) ||
    [...comparisonRuns].sort((a, b) => b.f1Score + b.rocAuc - (a.f1Score + a.rocAuc))[0];
  const inspectedRun = runs.find((r) => r.id === inspectRunId) || bestRun;

  // Build aligned ROC points for multi-line Recharts comparison
  const rocChartData = Array.from({ length: 21 }, (_, i) => {
    const fprGrid = Number((i * 0.05).toFixed(2));
    const row: Record<string, number> = { fpr: fprGrid, diagonal: fprGrid };
    for (const r of comparisonRuns) {
      const pts: any[] = r.rocCurve || [];
      let closest = pts[0];
      let minDist = Infinity;
      for (const p of pts) {
        const d = Math.abs(p.fpr - fprGrid);
        if (d < minDist) {
          minDist = d;
          closest = p;
        }
      }
      row[r.algorithm] = closest ? Number(closest.tpr.toFixed(3)) : fprGrid;
    }
    return row;
  });

  const barChartData = comparisonRuns.map((r) => ({
    algorithm: r.algorithm.replace('Logistic Regression', 'LogReg').replace('Gradient Boosting', 'GradBoost'),
    accuracy: Number((r.accuracy * 100).toFixed(1)),
    precision: Number((r.precision * 100).toFixed(1)),
    recall: Number((r.recall * 100).toFixed(1)),
    f1: Number((r.f1Score * 100).toFixed(1)),
    rocAuc: Number((r.rocAuc * 100).toFixed(1)),
    trainMs: Number(r.trainingTimeMs.toFixed(1)),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        meta="ML Experimentation Lab & Comparative Model Analysis"
        title="Supervised Model Training, Cross-Validation & Benchmarking"
        subtitle="Train and evaluate multiple classification algorithms with stratified K-fold cross-validation, grid hyperparameter tuning, train-fold Z-score standardization, and automated winner selection."
        actions={
          <button
            type="button"
            disabled={training || selectedAlgos.length === 0 || selectedFeatures.length === 0}
            onClick={handleTrainBatch}
            className="px-4 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md inline-flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            {training ? 'Training & Cross-Validating...' : `Train ${selectedAlgos.length} Selected Models`}
          </button>
        }
      />

      {error && <ErrorBanner message={error} />}

      {/* Configuration Panel */}
      <Panel className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Training Dataset (Cleaned)</label>
            <select
              value={datasetId}
              onChange={(e) => handleDatasetChange(Number(e.target.value))}
              className="w-full px-3 py-2 bg-[#090D16] border border-slate-700 rounded text-white"
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.clean_row_count} rows)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Binary Target Variable</label>
            <select
              value={targetColumn}
              onChange={(e) => setTargetColumn(e.target.value)}
              className="w-full px-3 py-2 bg-[#090D16] border border-slate-700 rounded text-white"
            >
              {allTargets.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">
              Test Split: <span className="text-white font-mono">{Math.round(testSize * 100)}%</span>
            </label>
            <input
              type="range"
              min={0.15}
              max={0.4}
              step={0.05}
              value={testSize}
              onChange={(e) => setTestSize(Number(e.target.value))}
              className="w-full mt-2 accent-sky-500"
            />
          </div>

          <div className="flex flex-col justify-center gap-2 pt-2">
            <label className="inline-flex items-center gap-2 text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={cvFolds === 5}
                onChange={(e) => setCvFolds(e.target.checked ? 5 : 0)}
                className="rounded border-slate-600 bg-slate-900"
              />
              5-Fold Stratified Cross-Validation
            </label>
            <label className="inline-flex items-center gap-2 text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={autoTune}
                onChange={(e) => setAutoTune(e.target.checked)}
                className="rounded border-slate-600 bg-slate-900"
              />
              Grid Hyperparameter Tuning
            </label>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4 pt-3 border-t border-slate-800 text-xs">
          <div>
            <div className="text-slate-400 mb-2">Algorithms to Benchmark</div>
            <div className="flex flex-wrap gap-2">
              {ALGORITHMS.map((alg) => {
                const checked = selectedAlgos.includes(alg);
                return (
                  <button
                    key={alg}
                    type="button"
                    onClick={() =>
                      setSelectedAlgos((prev) =>
                        prev.includes(alg) ? prev.filter((x) => x !== alg) : [...prev, alg]
                      )
                    }
                    className={`px-3 py-1.5 rounded border text-xs transition-colors ${
                      checked
                        ? 'bg-sky-950/60 border-sky-500 text-sky-200'
                        : 'bg-[#090D16] border-slate-800 text-slate-400'
                    }`}
                  >
                    {alg}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-slate-400 mb-2">
              Selected ML Features ({selectedFeatures.length} / {availableFeatures.length} · Leakage-Free)
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {availableFeatures.map((feat) => {
                const on = selectedFeatures.includes(feat);
                return (
                  <button
                    key={feat}
                    type="button"
                    onClick={() =>
                      setSelectedFeatures((prev) =>
                        prev.includes(feat) ? prev.filter((x) => x !== feat) : [...prev, feat]
                      )
                    }
                    className={`px-2 py-1 rounded text-[11px] font-mono border ${
                      on
                        ? 'bg-teal-950/50 border-teal-600 text-teal-200'
                        : 'bg-[#090D16] border-slate-800 text-slate-500'
                    }`}
                  >
                    {feat}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Panel>

      {/* Automated Best Model Banner */}
      {bestRun && (
        <Panel className="p-5 bg-gradient-to-r from-[#111827] via-[#0F1E2E] to-[#111827] border-sky-800/60">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-teal-400">
                <Award className="w-4 h-4" />
                Automated Best Model Selection · Active Production Classifier
              </div>
              <div className="text-base font-display font-semibold text-white">
                {bestRun.algorithm} · F1 {(bestRun.f1Score * 100).toFixed(1)}% · ROC-AUC {bestRun.rocAuc.toFixed(3)} · Accuracy {(bestRun.accuracy * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
                {batchSummary?.explanation ||
                  `${bestRun.algorithm} achieved the highest balanced F1 + ROC-AUC score on held-out test folds without data leakage. ${bestRun.tuningSummary || ''}`}
              </p>
            </div>
          </div>
        </Panel>
      )}

      {/* Comparative Performance Table */}
      <Panel className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-display font-semibold text-white">
              Comparative Model Evaluation Matrix
            </h2>
            <p className="text-[11px] text-slate-400">
              Click any model row to inspect its confusion matrix and feature importances below
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0D1320] text-slate-400 text-[10px] uppercase border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Algorithm</th>
                <th className="py-3 px-4">Target</th>
                <th className="py-3 px-4 text-right">Accuracy</th>
                <th className="py-3 px-4 text-right">Precision</th>
                <th className="py-3 px-4 text-right">Recall</th>
                <th className="py-3 px-4 text-right">F1-Score</th>
                <th className="py-3 px-4 text-right">ROC-AUC</th>
                <th className="py-3 px-4 text-right">CV F1 (5-Fold)</th>
                <th className="py-3 px-4 text-right">Train Time</th>
                <th className="py-3 px-4">Status / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 tabular-nums">
              {comparisonRuns.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setInspectRunId(r.id)}
                  className={`cursor-pointer transition-colors ${
                    inspectedRun?.id === r.id ? 'bg-slate-800/60' : 'hover:bg-slate-800/30'
                  }`}
                >
                  <td className="py-3 px-4 font-medium text-white">{r.algorithm}</td>
                  <td className="py-3 px-4 font-mono text-slate-300">{r.targetColumn}</td>
                  <td className="py-3 px-4 text-right text-slate-200">{(r.accuracy * 100).toFixed(1)}%</td>
                  <td className="py-3 px-4 text-right text-slate-200">{(r.precision * 100).toFixed(1)}%</td>
                  <td className="py-3 px-4 text-right text-slate-200">{(r.recall * 100).toFixed(1)}%</td>
                  <td className="py-3 px-4 text-right font-semibold text-teal-300">{(r.f1Score * 100).toFixed(1)}%</td>
                  <td className="py-3 px-4 text-right font-semibold text-sky-300">{r.rocAuc.toFixed(3)}</td>
                  <td className="py-3 px-4 text-right text-slate-300">
                    {r.cvSummary ? `${(r.cvSummary.meanF1 * 100).toFixed(1)}% ± ${(r.cvSummary.stdF1 * 100).toFixed(1)}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-400">{r.trainingTimeMs.toFixed(1)} ms</td>
                  <td className="py-3 px-4">
                    {r.isProduction ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        ACTIVE
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePromote(r.id);
                        }}
                        className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded"
                      >
                        Set Active
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ROC Comparison & Bar Metrics Comparison */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Panel className="p-5">
          <h3 className="text-sm font-display font-semibold text-white">ROC Curve Comparison</h3>
          <p className="text-[11px] text-slate-400 mb-4">
            True Positive Rate vs. False Positive Rate across probability thresholds
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rocChartData}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                <XAxis dataKey="fpr" tick={{ fill: '#94A3B8', fontSize: 11 }} label={{ value: 'FPR', position: 'insideBottom', offset: -2, fill: '#94A3B8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} domain={[0, 1]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090D16',
                    borderColor: '#334155',
                    fontSize: '11px',
                  }}
                />
                <Line type="linear" dataKey="diagonal" stroke="#475569" strokeDasharray="4 4" dot={false} name="Random Baseline" />
                {comparisonRuns.map((r) => (
                  <Line
                    key={r.algorithm}
                    type="monotone"
                    dataKey={r.algorithm}
                    stroke={ALGO_COLORS[r.algorithm] || '#38BDF8'}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="p-5">
          <h3 className="text-sm font-display font-semibold text-white">
            Accuracy, F1-Score & ROC-AUC (%) Comparison
          </h3>
          <p className="text-[11px] text-slate-400 mb-4">
            Side-by-side held-out test metrics across all trained models
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                <XAxis dataKey="algorithm" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090D16',
                    borderColor: '#334155',
                    fontSize: '11px',
                  }}
                />
                <Bar dataKey="accuracy" name="Accuracy %" fill="#38BDF8" />
                <Bar dataKey="f1" name="F1-Score %" fill="#2DD4BF" />
                <Bar dataKey="rocAuc" name="ROC-AUC ×100" fill="#A78BFA" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Inspected Run: Confusion Matrix, Feature Importance & Training Time */}
      {inspectedRun && (
        <div className="grid lg:grid-cols-12 gap-5">
          <Panel className="lg:col-span-4 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-display font-semibold text-white">
                Confusion Matrix · {inspectedRun.algorithm}
              </h3>
              <p className="text-[11px] text-slate-400">
                Held-out test set classification breakdown
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center tabular-nums">
              <div className="p-4 rounded bg-emerald-950/30 border border-emerald-800/60">
                <div className="text-[10px] uppercase text-emerald-400 font-mono">True Positive</div>
                <div className="text-2xl font-display font-semibold text-white mt-1">
                  {inspectedRun.confusionMatrix.tp}
                </div>
              </div>
              <div className="p-4 rounded bg-rose-950/30 border border-rose-800/60">
                <div className="text-[10px] uppercase text-rose-400 font-mono">False Positive</div>
                <div className="text-2xl font-display font-semibold text-white mt-1">
                  {inspectedRun.confusionMatrix.fp}
                </div>
              </div>
              <div className="p-4 rounded bg-amber-950/30 border border-amber-800/60">
                <div className="text-[10px] uppercase text-amber-400 font-mono">False Negative</div>
                <div className="text-2xl font-display font-semibold text-white mt-1">
                  {inspectedRun.confusionMatrix.fn}
                </div>
              </div>
              <div className="p-4 rounded bg-sky-950/30 border border-sky-800/60">
                <div className="text-[10px] uppercase text-sky-400 font-mono">True Negative</div>
                <div className="text-2xl font-display font-semibold text-white mt-1">
                  {inspectedRun.confusionMatrix.tn}
                </div>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800 space-y-1">
              <div>Hyperparameters: <span className="font-mono text-slate-200">{JSON.stringify(inspectedRun.hyperparams)}</span></div>
              {inspectedRun.tuningSummary && (
                <div className="flex items-start gap-1.5 text-teal-300">
                  <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{inspectedRun.tuningSummary}</span>
                </div>
              )}
            </div>
          </Panel>

          <Panel className="lg:col-span-5 p-5">
            <h3 className="text-sm font-display font-semibold text-white">
              Feature Importance ({inspectedRun.algorithm})
            </h3>
            <p className="text-[11px] text-slate-400 mb-4">
              Normalized split/coefficient importance weights driving predictions
            </p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={inspectedRun.featureImportance.slice(0, 7)} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                  <YAxis type="category" dataKey="feature" width={145} tick={{ fill: '#CBD5E1', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#090D16',
                      borderColor: '#334155',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="importance" name="Importance" fill="#2DD4BF" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel className="lg:col-span-3 p-5">
            <h3 className="text-sm font-display font-semibold text-white">Training Time (ms)</h3>
            <p className="text-[11px] text-slate-400 mb-4">Computational latency per model</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData}>
                  <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                  <XAxis dataKey="algorithm" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#090D16',
                      borderColor: '#334155',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="trainMs" name="Train Time (ms)" fill="#F59E0B" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
