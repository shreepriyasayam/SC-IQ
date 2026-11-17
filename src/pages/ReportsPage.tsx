import React, { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { ErrorBanner, formatUsd, LoadingState, PageHeader, Panel } from '../ui/CommonUi.tsx';

export function ReportsPage() {
  const [bundle, setBundle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/reports/bundle')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setBundle(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function exportPdf() {
    if (!bundle) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('SUPPLY CHAIN IQ — Executive Risk & ML Intelligence Report', 14, 18);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date(bundle.generatedAt).toLocaleString()}`, 14, 24);

    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text('1. Executive & Business Impact Summary', 14, 34);
    autoTable(doc, {
      startY: 38,
      head: [['Metric', 'Value']],
      body: [
        ['Monitored Suppliers', String(bundle.suppliers.length)],
        ['Active Dataset', `${bundle.dataset?.name || 'Benchmark'} (${bundle.dataset?.clean_row_count || 0} clean rows)`],
        ['Total Financial Exposure', formatUsd(bundle.businessImpact.totalFinancialExposureUsd)],
        ['Projected Production Downtime', `${bundle.businessImpact.estimatedProductionLossHours} hours`],
        ['Expected Procurement Surge', formatUsd(bundle.businessImpact.expectedProcurementCostSurgeUsd)],
        ['HHI Spend Concentration', String(bundle.businessImpact.dependencyConcentrationIndex)],
      ],
    });

    const yAfterImpact = (doc as any).lastAutoTable.finalY + 10;
    doc.text('2. Machine Learning Comparative Benchmark', 14, yAfterImpact);
    autoTable(doc, {
      startY: yAfterImpact + 4,
      head: [['Algorithm', 'Target', 'Accuracy', 'F1-Score', 'ROC-AUC', 'Active']],
      body: bundle.mlRuns.slice(0, 6).map((r: any) => [
        r.algorithm,
        r.target_column,
        `${(r.accuracy * 100).toFixed(1)}%`,
        `${(r.f1_score * 100).toFixed(1)}%`,
        r.roc_auc.toFixed(3),
        r.is_production ? 'ACTIVE' : '—',
      ]),
    });

    const yAfterMl = (doc as any).lastAutoTable.finalY + 10;
    doc.text('3. Top High-Risk Suppliers & Predictions', 14, yAfterMl);
    autoTable(doc, {
      startY: yAfterMl + 4,
      head: [['Supplier', 'Country', 'Reliability', 'Avg Delay', 'Risk Score', 'Disruption Prob']],
      body: bundle.suppliers.slice(0, 10).map((s: any) => [
        s.name,
        s.country,
        `${s.reliability_score}%`,
        `${s.avg_delay_days}d`,
        `${s.risk_score}/100 (${s.risk_category})`,
        `${(s.disruption_prob * 100).toFixed(1)}%`,
      ]),
    });

    doc.addPage();
    doc.text('4. Prioritized Decision Recommendations', 14, 18);
    autoTable(doc, {
      startY: 22,
      head: [['Priority', 'Supplier', 'Problem', 'Recommended Action', 'Status']],
      body: bundle.decisions.map((d: any) => [
        d.priority,
        d.supplier_name,
        d.problem,
        d.recommended_action,
        d.status,
      ]),
    });

    doc.save('supply_chain_iq_executive_report.pdf');
  }

  function exportExcel() {
    if (!bundle) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        {
          GeneratedAt: bundle.generatedAt,
          Dataset: bundle.dataset?.name,
          CleanRows: bundle.dataset?.clean_row_count,
          TotalFinancialExposureUsd: bundle.businessImpact.totalFinancialExposureUsd,
          ProductionDowntimeHours: bundle.businessImpact.estimatedProductionLossHours,
          ProcurementSurgeUsd: bundle.businessImpact.expectedProcurementCostSurgeUsd,
          ConcentrationHHI: bundle.businessImpact.dependencyConcentrationIndex,
        },
      ]),
      'ExecutiveSummary'
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bundle.suppliers), 'SupplierRisk');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bundle.mlRuns), 'MLComparison');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(bundle.businessImpact.topImpactedSuppliers),
      'BusinessImpact'
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bundle.decisions), 'Recommendations');
    if (bundle.simulations?.length > 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          bundle.simulations.map((s: any) => ({
            Title: s.title,
            TargetSupplier: s.targetSupplierName,
            CurrentRisk: s.current?.riskScore,
            SimulatedRisk: s.simulated?.riskScore,
            DeltaFinancialUsd: s.deltaFinancialUsd,
            Decision: s.recommendedDecision,
          }))
        ),
        'Simulations'
      );
    }
    XLSX.writeFile(wb, 'supply_chain_iq_intelligence_workbook.xlsx');
  }

  function exportCsv(section: 'suppliers' | 'mlRuns' | 'decisions') {
    if (!bundle) return;
    const csv = Papa.unparse(bundle[section] || []);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supply_chain_iq_${section}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <LoadingState label="Assembling unified export bundle..." />;
  if (error) return <ErrorBanner message={error} />;
  if (!bundle) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        meta="Reports Centre · Multi-Format Executive Deliverables"
        title="Unified Intelligence Reports & Data Exports"
        subtitle="Generate formatted PDF executive dossiers, multi-sheet Excel analytical workbooks, and raw CSV tables covering executive KPIs, data quality, ML comparisons, supplier risk, business impact, simulations, and decisions."
        actions={
          <>
            <button
              type="button"
              onClick={exportPdf}
              className="px-4 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              Download PDF Report
            </button>
            <button
              type="button"
              onClick={exportExcel}
              className="px-4 py-2 text-xs font-medium bg-teal-700 hover:bg-teal-600 text-white rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Download Excel (.xlsx)
            </button>
          </>
        }
      />

      <div className="grid md:grid-cols-3 gap-4">
        <Panel className="p-5 space-y-3">
          <div className="text-sm font-display font-semibold text-white">Supplier Risk Register (CSV)</div>
          <p className="text-xs text-slate-400">
            {bundle.suppliers.length} supplier profiles with composite scores, reliability, delays, and ML probabilities.
          </p>
          <button
            type="button"
            onClick={() => exportCsv('suppliers')}
            className="px-3 py-1.5 text-xs bg-[#090D16] hover:bg-slate-800 border border-slate-700 text-slate-200 rounded inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export Suppliers CSV
          </button>
        </Panel>

        <Panel className="p-5 space-y-3">
          <div className="text-sm font-display font-semibold text-white">ML Benchmark Runs (CSV)</div>
          <p className="text-xs text-slate-400">
            {bundle.mlRuns.length} comparative training runs with accuracy, precision, recall, F1, ROC-AUC, and latency.
          </p>
          <button
            type="button"
            onClick={() => exportCsv('mlRuns')}
            className="px-3 py-1.5 text-xs bg-[#090D16] hover:bg-slate-800 border border-slate-700 text-slate-200 rounded inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export ML Runs CSV
          </button>
        </Panel>

        <Panel className="p-5 space-y-3">
          <div className="text-sm font-display font-semibold text-white">Actionable Decisions (CSV)</div>
          <p className="text-xs text-slate-400">
            {bundle.decisions.length} prioritized recommendations with supporting evidence, expected benefit, and status.
          </p>
          <button
            type="button"
            onClick={() => exportCsv('decisions')}
            className="px-3 py-1.5 text-xs bg-[#090D16] hover:bg-slate-800 border border-slate-700 text-slate-200 rounded inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export Decisions CSV
          </button>
        </Panel>
      </div>

      {/* Report Sections Preview */}
      <Panel className="p-5 space-y-4 text-xs">
        <h2 className="text-sm font-display font-semibold text-white">Included Deliverable Sections</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['Executive Summary', `${bundle.suppliers.length} suppliers · ${formatUsd(bundle.businessImpact.totalFinancialExposureUsd)} exposure`],
            ['Dataset & Data Quality', `${bundle.dataset?.name} · ${bundle.dataset?.clean_row_count} clean rows`],
            ['ML Model Comparison', `${bundle.mlRuns.length} benchmarked classifier runs`],
            ['Predictions & Explanations', 'Live calibrated disruption, delay & shortage probabilities'],
            ['Supplier Risk Analysis', `${bundle.suppliers.filter((s: any) => s.risk_score >= 55).length} High/Critical risk accounts`],
            ['Business Impact Analysis', `${bundle.businessImpact.estimatedProductionLossHours} downtime hrs · HHI ${bundle.businessImpact.dependencyConcentrationIndex}`],
            ['Simulation Outcomes', `${bundle.simulations.length} recorded stress-test scenarios`],
            ['Strategic Recommendations', `${bundle.decisions.length} prioritized mitigation directives`],
          ].map(([title, meta]) => (
            <div key={title} className="p-3.5 rounded bg-[#090D16] border border-slate-800">
              <div className="font-medium text-white">{title}</div>
              <div className="text-slate-400 mt-1">{meta}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
