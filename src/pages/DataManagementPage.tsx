import React, { useEffect, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { CheckCircle2, Download, FileSpreadsheet, RefreshCw, ShieldAlert, Upload } from 'lucide-react';
import { ErrorBanner, LoadingState, MetricTile, PageHeader, Panel } from '../ui/CommonUi.tsx';

export function DataManagementPage() {
  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [previewTab, setPreviewTab] = useState<'clean' | 'raw'>('clean');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // Non-destructive preprocessing options
  const [opts, setOpts] = useState({
    deduplicate: true,
    imputeMissing: true,
    capOutliers: true,
    addDerivedFeatures: true,
  });

  async function loadDatasets(pickId?: number) {
    setLoading(true);
    try {
      const res = await fetch('/api/datasets');
      const json = await res.json();
      setDatasets(json.datasets || []);
      const targetId = pickId || selectedId || json.datasets?.[0]?.id;
      if (targetId) {
        setSelectedId(targetId);
        const detRes = await fetch(`/api/datasets/${targetId}`);
        const detJson = await detRes.json();
        setDetail(detJson);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDatasets();
  }, []);

  async function handleSelectDataset(id: number) {
    setSelectedId(id);
    setError('');
    const res = await fetch(`/api/datasets/${id}`);
    const json = await res.json();
    setDetail(json);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setStatusMsg('');
    setUploading(true);

    try {
      let parsedRows: Record<string, unknown>[] = [];
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'csv') {
        const text = await file.text();
        const result = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
        });
        parsedRows = result.data;
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        parsedRows = XLSX.utils.sheet_to_json(sheet);
      } else {
        throw new Error('Unsupported format. Upload a .csv, .xlsx, or .xls file.');
      }

      if (parsedRows.length < 15) {
        throw new Error(`Uploaded file has only ${parsedRows.length} rows. Minimum 15 rows required.`);
      }

      const cleanName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
      const res = await fetch('/api/datasets/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          sourceLabel: `Uploaded ${ext?.toUpperCase()} (${file.name})`,
          rows: parsedRows,
          options: opts,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed.');
      setStatusMsg(`Uploaded "${cleanName}" (${parsedRows.length} raw rows preserved; ${json.qualityReport.cleanedRows} clean rows prepared).`);
      await loadDatasets(json.datasetId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleReprocess() {
    if (!selectedId) return;
    setReprocessing(true);
    setError('');
    setStatusMsg('');
    try {
      const res = await fetch(`/api/datasets/${selectedId}/reprocess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options: opts }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Reprocess failed.');
      setStatusMsg('Re-ran non-destructive preprocessing from untouched raw snapshot.');
      await handleSelectDataset(selectedId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReprocessing(false);
    }
  }

  async function handleDownloadClean(format: 'csv' | 'xlsx') {
    if (!selectedId) return;
    const res = await fetch(`/api/datasets/${selectedId}/download`);
    const json = await res.json();
    if (!res.ok || !json.rows) return;

    const safeName = String(json.name || 'cleaned_dataset').replace(/[^a-zA-Z0-9_-]/g, '_');
    if (format === 'csv') {
      const csv = Papa.unparse(json.rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}_cleaned.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const ws = XLSX.utils.json_to_sheet(json.rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'CleanedData');
      XLSX.writeFile(wb, `${safeName}_cleaned.xlsx`);
    }
  }

  if (loading && !detail) return <LoadingState label="Inspecting dataset quality profiles..." />;

  const ds = detail?.dataset;
  const qr = ds?.qualityReport;
  const docs = ds?.documentation;
  const previewRows = previewTab === 'clean' ? detail?.cleanPreview || [] : detail?.rawPreview || [];
  const previewCols = previewRows[0] ? Object.keys(previewRows[0]) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        meta="Intelligent Data Management · Non-Destructive Pipeline"
        title="Dataset Ingestion, Quality Audit & Feature Engineering"
        subtitle="Upload CSV or Excel supply datasets, inspect raw vs. cleaned records side-by-side, audit missing values and IQR outliers, and export ML-ready tables without mutating raw data."
        actions={
          <>
            <label className="px-3.5 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Uploading...' : 'Upload CSV / Excel'}
              <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
            </label>
            <button
              type="button"
              onClick={() => handleDownloadClean('csv')}
              className="px-3 py-2 text-xs font-medium bg-[#111827] hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Clean CSV
            </button>
            <button
              type="button"
              onClick={() => handleDownloadClean('xlsx')}
              className="px-3 py-2 text-xs font-medium bg-[#111827] hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Clean Excel
            </button>
          </>
        }
      />

      {error && <ErrorBanner message={error} />}
      {statusMsg && (
        <div className="p-3 rounded-md bg-emerald-950/40 border border-emerald-800/70 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Dataset Selector + Preprocessing Policy Controls */}
      <Panel className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-300 whitespace-nowrap">Active Dataset</label>
          <select
            value={selectedId || ''}
            onChange={(e) => handleSelectDataset(Number(e.target.value))}
            className="px-3 py-1.5 text-xs bg-[#090D16] border border-slate-700 rounded text-white focus:outline-none focus:border-sky-500"
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.raw_row_count} raw → {d.clean_row_count} clean)
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={opts.deduplicate}
              onChange={(e) => setOpts({ ...opts, deduplicate: e.target.checked })}
              className="rounded border-slate-600 bg-slate-900"
            />
            Deduplicate
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={opts.imputeMissing}
              onChange={(e) => setOpts({ ...opts, imputeMissing: e.target.checked })}
              className="rounded border-slate-600 bg-slate-900"
            />
            Median/Mode Impute
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={opts.capOutliers}
              onChange={(e) => setOpts({ ...opts, capOutliers: e.target.checked })}
              className="rounded border-slate-600 bg-slate-900"
            />
            IQR Winsorize Outliers
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={opts.addDerivedFeatures}
              onChange={(e) => setOpts({ ...opts, addDerivedFeatures: e.target.checked })}
              className="rounded border-slate-600 bg-slate-900"
            />
            Derived Risk Features
          </label>
          <button
            type="button"
            disabled={reprocessing}
            onClick={handleReprocess}
            className="px-3 py-1.5 text-xs font-medium bg-teal-700 hover:bg-teal-600 text-white rounded inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reprocessing ? 'animate-spin' : ''}`} />
            Re-Run Pipeline
          </button>
        </div>
      </Panel>

      {qr && (
        <>
          {/* Quality Audit Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricTile label="Raw Rows" value={qr.originalRows} subtext="Untouched immutable snapshot" />
            <MetricTile label="Cleaned Rows" value={qr.cleanedRows} tone="low" subtext={`${qr.duplicatesRemoved} duplicates removed`} />
            <MetricTile label="Missing Imputed" value={`${qr.missingValuesImputed} / ${qr.missingValuesDetected}`} tone="sky" subtext="Zero silent drops" />
            <MetricTile label="Outliers Capped" value={`${qr.outliersCapped} / ${qr.outliersDetected}`} tone="high" subtext="1.5× IQR fence capping" />
            <MetricTile label="Derived Features" value={qr.derivedFeaturesAdded.length} tone="medium" subtext={qr.derivedFeaturesAdded.join(', ') || 'Disabled'} />
          </div>

          {/* Before & After Comparison + Dataset Documentation */}
          <div className="grid lg:grid-cols-12 gap-5">
            <Panel className="lg:col-span-7 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <h2 className="text-sm font-display font-semibold text-white">
                  Before & After Preprocessing Comparison
                </h2>
                <p className="text-[11px] text-slate-400">
                  Verifiable integrity changes between immutable raw upload and active ML workspace table
                </p>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0D1320] text-slate-400 text-[10px] uppercase border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">Metric</th>
                    <th className="py-2.5 px-4 text-right">Before</th>
                    <th className="py-2.5 px-4 text-right">After</th>
                    <th className="py-2.5 px-4">Audit Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {qr.beforeAfter.map((b: any) => (
                    <tr key={b.metric}>
                      <td className="py-2.5 px-4 font-medium text-white">{b.metric}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-400">{b.before}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-teal-300">{b.after}</td>
                      <td className="py-2.5 px-4 text-slate-400">{b.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel className="lg:col-span-5 p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-display font-semibold text-white">Dataset Documentation</h2>
                <span className="text-[11px] font-mono text-amber-300">
                  {docs?.isSynthetic ? 'SYNTHETIC BENCHMARK' : 'USER DATASET'}
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed">{docs?.source}</p>
              <div className="p-3 rounded bg-[#090D16] border border-slate-800">
                <div className="text-[11px] font-semibold text-slate-300 mb-1">Valid Binary Targets</div>
                <div className="font-mono text-sky-400">{qr.validTargetColumns.join(' · ') || 'None detected'}</div>
              </div>
              <div className="p-3 rounded bg-[#090D16] border border-slate-800">
                <div className="text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  Excluded Leakage & Identifier Columns
                </div>
                <div className="font-mono text-slate-400">{qr.excludedLeakageColumns.join(' · ') || 'None'}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-300 mb-1">Methodological Limitations</div>
                <ul className="space-y-1 text-slate-400 list-disc pl-4">
                  {docs?.limitations?.map((l: string, i: number) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            </Panel>
          </div>

          {/* Column Validation Profile Table */}
          <Panel className="overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800">
              <h2 className="text-sm font-display font-semibold text-white">
                Column Validation & Outlier Profile
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0D1320] text-slate-400 text-[10px] uppercase border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">Column</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4 text-right">Raw Missing</th>
                    <th className="py-2.5 px-4 text-right">Clean Missing</th>
                    <th className="py-2.5 px-4 text-right">Outliers</th>
                    <th className="py-2.5 px-4 text-right">Mean / Mode</th>
                    <th className="py-2.5 px-4 text-right">Min – Max</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 tabular-nums">
                  {qr.columnProfiles.map((c: any) => (
                    <tr key={c.name} className="hover:bg-slate-800/30">
                      <td className="py-2 px-4 font-mono text-white">
                        {c.name}
                        {c.isDerived && <span className="ml-2 text-[10px] text-teal-400">(Derived)</span>}
                        {c.isTargetCandidate && <span className="ml-2 text-[10px] text-sky-400">(Target)</span>}
                      </td>
                      <td className="py-2 px-4 text-slate-300">{c.inferredType}</td>
                      <td className="py-2 px-4 text-right text-amber-300">{c.rawMissingCount}</td>
                      <td className="py-2 px-4 text-right text-emerald-400">{c.cleanedMissingCount}</td>
                      <td className="py-2 px-4 text-right text-rose-300">{c.outlierCount}</td>
                      <td className="py-2 px-4 text-right text-slate-200">
                        {c.mean !== undefined ? c.mean.toFixed(2) : c.mode || '—'}
                      </td>
                      <td className="py-2 px-4 text-right text-slate-400">
                        {c.min !== undefined ? `${c.min} – ${c.max}` : `${c.uniqueCount} unique`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Raw vs Clean Data Preview */}
          <Panel className="overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="text-sm font-display font-semibold text-white">
                Record Preview (First {previewRows.length} Rows)
              </div>
              <div className="flex items-center gap-1 bg-[#090D16] p-1 rounded border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewTab('clean')}
                  className={`px-3 py-1 rounded ${previewTab === 'clean' ? 'bg-sky-600 text-white' : 'text-slate-400'}`}
                >
                  Cleaned Dataset
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('raw')}
                  className={`px-3 py-1 rounded ${previewTab === 'raw' ? 'bg-sky-600 text-white' : 'text-slate-400'}`}
                >
                  Untouched Raw Upload
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left text-[11px] font-mono">
                <thead className="bg-[#0D1320] text-slate-400 border-b border-slate-800 sticky top-0">
                  <tr>
                    {previewCols.map((col) => (
                      <th key={col} className="py-2 px-3 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 tabular-nums">
                  {previewRows.slice(0, 25).map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      {previewCols.map((col) => (
                        <td key={col} className="py-1.5 px-3 whitespace-nowrap text-slate-300">
                          {row[col] === null || row[col] === undefined || row[col] === '' ? (
                            <span className="text-rose-400">NULL</span>
                          ) : (
                            String(row[col])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
