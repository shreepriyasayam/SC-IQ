import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createServer as createViteServer } from 'vite';
import type { AlgorithmId } from './src/engine/contracts.ts';
import { runIntelligentPreprocessing, toFiniteNumber } from './src/engine/dataPipeline.ts';
import {
  detectAnomaliesUnsupervised,
  explainPredictionFactors,
  predictProbability,
  trainAndEvaluateSupervisedModel,
} from './src/engine/mlModels.ts';
import {
  calculateBusinessImpact,
  runDeterministicSimulation,
  type ScenarioPresetType,
} from './src/engine/riskAndImpact.ts';
import { db, initializeDatabaseSchema } from './src/backend/database.ts';
import {
  computeSupplierScoreAndCategory,
  refreshSupplierPredictionsFromModel,
  regenerateDecisionsFromLiveSuppliers,
  seedFreshPlatform,
} from './src/backend/datasetSeed.ts';
import { runSupplierInvestigationAgent } from './src/backend/investigationAgent.ts';

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'sciq-capstone-v2-secret-2026';

initializeDatabaseSchema();
seedFreshPlatform();

const app = express();
app.use(express.json({ limit: '20mb' }));

function makeToken(u: { id: number; name: string; email: string; role: string }) {
  return jwt.sign(u, JWT_SECRET, { expiresIn: '7d' });
}

// ============================================================================
// AUTHENTICATION
// ============================================================================
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || String(password).length < 6) {
      return res.status(400).json({ error: 'Name, email, and password (6+ chars) are required.' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    const hash = bcrypt.hashSync(String(password), 10);
    const info = db
      .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(String(name).trim(), cleanEmail, hash, role || 'Supply Chain Analyst');

    const user = {
      id: Number(info.lastInsertRowid),
      name: String(name).trim(),
      email: cleanEmail,
      role: role || 'Supply Chain Analyst',
    };
    res.status(201).json({ token: makeToken(user), user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const row = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(String(email).trim().toLowerCase()) as any;
    if (!row || !bcrypt.compareSync(String(password), row.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    const user = { id: row.id, name: row.name, email: row.email, role: row.role };
    res.json({ token: makeToken(user), user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/demo-login', (_req, res) => {
  const row = db.prepare('SELECT id, name, email, role FROM users ORDER BY id ASC LIMIT 1').get() as any;
  if (!row) return res.status(404).json({ error: 'Evaluator account unavailable.' });
  res.json({ token: makeToken(row), user: row });
});

// ============================================================================
// DATASET HELPERS
// ============================================================================
function fetchCleanDatasetRows(datasetId: number): { dataset: any; rows: Record<string, unknown>[] } {
  const dataset = db.prepare('SELECT * FROM datasets WHERE id = ?').get(datasetId) as any;
  if (!dataset) throw new Error(`Dataset #${datasetId} not found.`);
  const rowItems = db
    .prepare('SELECT data_json FROM dataset_clean_rows WHERE dataset_id = ? ORDER BY row_index ASC')
    .all(datasetId) as any[];
  return {
    dataset,
    rows: rowItems.map((r) => JSON.parse(r.data_json)),
  };
}

// ============================================================================
// MODULE 1: EXECUTIVE INTELLIGENCE CENTRE (DYNAMIC FROM SELECTED DATASET)
// ============================================================================
app.get('/api/executive', (req, res) => {
  try {
    const datasets = db
      .prepare('SELECT id, name, is_synthetic, clean_row_count FROM datasets ORDER BY id DESC')
      .all() as any[];
    const datasetId = Number(req.query.datasetId || datasets[0]?.id || 1);
    const regionFilter = String(req.query.region || 'All');
    const dateRange = String(req.query.dateRange || 'All');

    const { dataset, rows } = fetchCleanDatasetRows(datasetId);
    const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY risk_score DESC').all() as any[];

    // Apply interactive date range & region filters directly on dataset rows
    let filteredRows = rows;
    if (regionFilter !== 'All') {
      filteredRows = filteredRows.filter((r) => String(r.region || '') === regionFilter);
    }
    if (dateRange === 'Last 90 Days') {
      filteredRows = filteredRows.filter((r) => String(r.order_date || '2026-11-01') >= '2026-08-15');
    } else if (dateRange === 'Last 30 Days') {
      filteredRows = filteredRows.filter((r) => String(r.order_date || '2026-11-01') >= '2026-10-01');
    }

    // Aggregate supplier-level risk dynamically from filtered dataset rows
    const supBuckets = new Map<string, Record<string, unknown>[]>();
    for (const r of filteredRows) {
      const key = String(r.supplier_name || r.supplier_id || 'General Portfolio');
      if (!supBuckets.has(key)) supBuckets.set(key, []);
      supBuckets.get(key)!.push(r);
    }

    const dynamicEntities = Array.from(supBuckets.entries()).map(([name, grp]) => {
      const avgRel =
        grp.reduce((a, r) => a + (toFiniteNumber(r.supplier_reliability) ?? 80), 0) / grp.length;
      const avgDelay =
        grp.reduce((a, r) => a + (toFiniteNumber(r.delivery_delay_days) ?? 2), 0) / grp.length;
      const disruptionRate =
        grp.reduce((a, r) => a + ((toFiniteNumber(r.disruption_occurred) ?? 0) >= 0.5 ? 1 : 0), 0) /
        grp.length;
      const delayRate =
        grp.reduce((a, r) => a + ((toFiniteNumber(r.delivery_delayed) ?? 0) >= 0.5 ? 1 : 0), 0) /
        grp.length;
      const avgInv =
        grp.reduce((a, r) => a + (toFiniteNumber(r.inventory_level) ?? 1000), 0) / grp.length;
      const avgSafety =
        grp.reduce((a, r) => a + (toFiniteNumber(r.safety_stock) ?? 1000), 0) / grp.length;
      const riskScore = Number(
        Math.min(98, Math.max(8, (100 - avgRel) * 0.65 + avgDelay * 2.2 + disruptionRate * 35)).toFixed(1)
      );
      const matchedSup = suppliers.find((s) => s.name === name || s.supplier_code === name);
      const annualSpend = matchedSup ? matchedSup.annual_spend_usd : grp.length * 185000;
      const exposure = Math.round(annualSpend * Math.max(disruptionRate, matchedSup?.disruption_prob ?? 0.2) * 0.35);

      return {
        id: matchedSup?.id ?? null,
        name,
        region: String(grp[0]?.region || matchedSup?.region || 'Global'),
        records: grp.length,
        avgReliability: Number(avgRel.toFixed(1)),
        avgDelayDays: Number(avgDelay.toFixed(1)),
        disruptionRatePct: Number((disruptionRate * 100).toFixed(1)),
        delayProbPct: Number((delayRate * 100).toFixed(1)),
        shortageWarning: avgInv < avgSafety,
        riskScore,
        riskCategory: riskScore >= 75 ? 'CRITICAL' : riskScore >= 55 ? 'HIGH' : riskScore >= 35 ? 'MEDIUM' : 'LOW',
        exposureUsd: exposure,
      };
    });

    const totalSuppliers = dynamicEntities.length;
    const criticalRiskSuppliers = dynamicEntities.filter((e) => e.riskScore >= 75).length;
    const highRiskSuppliers = dynamicEntities.filter((e) => e.riskScore >= 55 && e.riskScore < 75).length;
    const overallRiskScore = Number(
      (dynamicEntities.reduce((a, e) => a + e.riskScore, 0) / (totalSuppliers || 1)).toFixed(1)
    );
    const predictedDisruptions = filteredRows.filter(
      (r) => (toFiniteNumber(r.disruption_occurred) ?? 0) >= 0.5
    ).length;
    const avgDelayProbPct = Number(
      (
        (filteredRows.filter((r) => (toFiniteNumber(r.delivery_delayed) ?? 0) >= 0.5).length /
          (filteredRows.length || 1)) *
        100
      ).toFixed(1)
    );
    const financialExposureUsd = dynamicEntities.reduce((a, e) => a + e.exposureUsd, 0);
    const inventoryShortageWarnings = dynamicEntities.filter((e) => e.shortageWarning).length;

    // Trend series grouped by order_date
    const dateMap = new Map<string, Record<string, unknown>[]>();
    for (const r of filteredRows) {
      const d = String(r.order_date || '2026-11');
      if (!dateMap.has(d)) dateMap.set(d, []);
      dateMap.get(d)!.push(r);
    }
    const performanceTrends = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, grp]) => ({
        period,
        reliability: Number(
          (grp.reduce((a, r) => a + (toFiniteNumber(r.supplier_reliability) ?? 80), 0) / grp.length).toFixed(1)
        ),
        avgDelay: Number(
          (grp.reduce((a, r) => a + (toFiniteNumber(r.delivery_delay_days) ?? 2), 0) / grp.length).toFixed(1)
        ),
        disruptions: grp.filter((r) => (toFiniteNumber(r.disruption_occurred) ?? 0) >= 0.5).length,
      }));

    const prodModel = db
      .prepare('SELECT id, algorithm, f1_score, roc_auc, accuracy FROM ml_runs ORDER BY is_production DESC, id DESC LIMIT 1')
      .get() as any;

    const availableRegions = ['All', ...Array.from(new Set(rows.map((r) => String(r.region || '')).filter(Boolean)))];

    res.json({
      datasets,
      activeDataset: {
        id: dataset.id,
        name: dataset.name,
        isSynthetic: Boolean(dataset.is_synthetic),
        totalRecords: filteredRows.length,
      },
      availableRegions,
      kpis: {
        totalSuppliers,
        criticalRiskSuppliers,
        highRiskSuppliers,
        overallRiskScore,
        predictedDisruptions,
        deliveryDelayProbabilityPct: avgDelayProbPct,
        financialExposureUsd,
        inventoryShortageWarnings,
      },
      performanceTrends,
      supplierEntities: dynamicEntities.sort((a, b) => b.riskScore - a.riskScore),
      prodModel,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// MODULE 2: SUPPLIER INTELLIGENCE
// ============================================================================
app.get('/api/suppliers', (_req, res) => {
  const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY risk_score DESC').all();
  res.json({ suppliers });
});

app.get('/api/suppliers/:id', (req, res) => {
  const id = Number(req.params.id);
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
  const trends = db
    .prepare('SELECT * FROM supplier_trends WHERE supplier_id = ? ORDER BY period_label ASC')
    .all(id);
  res.json({ supplier, trends });
});

app.post('/api/suppliers', (req, res) => {
  try {
    const b = req.body;
    if (!b.name || !b.region || !b.country) {
      return res.status(400).json({ error: 'Supplier name, region, and country are required.' });
    }
    const payload = {
      code: b.supplier_code || `SCI-${Math.floor(20 + Math.random() * 89)}`,
      name: String(b.name).trim(),
      region: String(b.region),
      country: String(b.country),
      category: String(b.category || 'Components'),
      dependency_level: String(b.dependency_level || 'Moderate'),
      dependency_share_pct: Number(b.dependency_share_pct ?? 15),
      reliability_score: Number(b.reliability_score ?? 80),
      avg_delay_days: Number(b.avg_delay_days ?? 3.5),
      shipment_distance_km: Number(b.shipment_distance_km ?? 4500),
      inventory_level_units: Number(b.inventory_level_units ?? 1200),
      safety_stock_units: Number(b.safety_stock_units ?? 1000),
      order_quantity_units: Number(b.order_quantity_units ?? 1600),
      historical_disruptions: Number(b.historical_disruptions ?? 1),
      annual_spend_usd: Number(b.annual_spend_usd ?? 2000000),
      daily_revenue_at_risk_usd: Number(b.daily_revenue_at_risk_usd ?? 45000),
      financial_health_score: Number(b.financial_health_score ?? 78),
      defect_rate_pct: Number(b.defect_rate_pct ?? 1.5),
    };
    const scored = computeSupplierScoreAndCategory(payload);
    const info = db
      .prepare(
        `INSERT INTO suppliers (
          supplier_code, name, region, country, category, dependency_level, dependency_share_pct,
          reliability_score, avg_delay_days, shipment_distance_km, inventory_level_units,
          safety_stock_units, order_quantity_units, historical_disruptions, annual_spend_usd,
          daily_revenue_at_risk_usd, financial_health_score, defect_rate_pct,
          risk_score, risk_category, risk_explanation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        payload.code, payload.name, payload.region, payload.country, payload.category,
        payload.dependency_level, payload.dependency_share_pct, payload.reliability_score,
        payload.avg_delay_days, payload.shipment_distance_km, payload.inventory_level_units,
        payload.safety_stock_units, payload.order_quantity_units, payload.historical_disruptions,
        payload.annual_spend_usd, payload.daily_revenue_at_risk_usd, payload.financial_health_score,
        payload.defect_rate_pct, scored.riskScore, scored.riskCategory, scored.riskExplanation
      );
    refreshSupplierPredictionsFromModel();
    regenerateDecisionsFromLiveSuppliers();
    const created = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json({ supplier: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// MODULE 3: INTELLIGENT DATA MANAGEMENT
// ============================================================================
app.get('/api/datasets', (_req, res) => {
  const list = db
    .prepare('SELECT id, name, source_label, is_synthetic, documentation_json, raw_row_count, clean_row_count, quality_report_json, created_at FROM datasets ORDER BY id DESC')
    .all() as any[];
  res.json({
    datasets: list.map((d) => ({
      ...d,
      isSynthetic: Boolean(d.is_synthetic),
      documentation: JSON.parse(d.documentation_json),
      qualityReport: JSON.parse(d.quality_report_json),
    })),
  });
});

app.get('/api/datasets/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const ds = db.prepare('SELECT * FROM datasets WHERE id = ?').get(id) as any;
    if (!ds) return res.status(404).json({ error: 'Dataset not found' });

    const rawRows = db
      .prepare('SELECT data_json FROM dataset_raw_rows WHERE dataset_id = ? ORDER BY row_index ASC LIMIT 60')
      .all(id)
      .map((r: any) => JSON.parse(r.data_json));
    const cleanRows = db
      .prepare('SELECT data_json FROM dataset_clean_rows WHERE dataset_id = ? ORDER BY row_index ASC LIMIT 60')
      .all(id)
      .map((r: any) => JSON.parse(r.data_json));

    res.json({
      dataset: {
        ...ds,
        isSynthetic: Boolean(ds.is_synthetic),
        documentation: JSON.parse(ds.documentation_json),
        qualityReport: JSON.parse(ds.quality_report_json),
      },
      rawPreview: rawRows,
      cleanPreview: cleanRows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/datasets/upload', (req, res) => {
  try {
    const { name, sourceLabel, rows, options } = req.body;
    if (!name || !Array.isArray(rows) || rows.length < 15) {
      return res.status(400).json({ error: 'Provide a dataset name and at least 15 records.' });
    }

    const { cleanedRows, report } = runIntelligentPreprocessing(rows, options || {});
    const docs = {
      source: sourceLabel || 'User Uploaded Dataset',
      isSynthetic: false,
      recordCount: rows.length,
      featureDescriptions: report.selectableFeatures.map((f) => ({
        name: f,
        description: 'User-provided numerical or encoded attribute.',
      })),
      targetVariables: report.validTargetColumns,
      limitations: [
        'Automatically validated via SUPPLY CHAIN IQ non-destructive preprocessing pipeline; raw snapshot preserved separately.',
      ],
    };

    const info = db
      .prepare(
        `INSERT INTO datasets (name, source_label, is_synthetic, documentation_json, raw_row_count, clean_row_count, quality_report_json)
         VALUES (?, ?, 0, ?, ?, ?, ?)`
      )
      .run(
        String(name).trim(),
        sourceLabel || 'Uploaded File',
        JSON.stringify(docs),
        rows.length,
        cleanedRows.length,
        JSON.stringify(report)
      );

    const dsId = Number(info.lastInsertRowid);
    const insRaw = db.prepare('INSERT INTO dataset_raw_rows (dataset_id, row_index, data_json) VALUES (?, ?, ?)');
    const insClean = db.prepare('INSERT INTO dataset_clean_rows (dataset_id, row_index, data_json) VALUES (?, ?, ?)');
    rows.forEach((r, i) => insRaw.run(dsId, i, JSON.stringify(r)));
    cleanedRows.forEach((r, i) => insClean.run(dsId, i, JSON.stringify(r)));

    res.status(201).json({ datasetId: dsId, qualityReport: report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/datasets/:id/reprocess', (req, res) => {
  try {
    const id = Number(req.params.id);
    const ds = db.prepare('SELECT * FROM datasets WHERE id = ?').get(id) as any;
    if (!ds) return res.status(404).json({ error: 'Dataset not found' });

    const rawRows = db
      .prepare('SELECT data_json FROM dataset_raw_rows WHERE dataset_id = ? ORDER BY row_index ASC')
      .all(id)
      .map((r: any) => JSON.parse(r.data_json));

    const { cleanedRows, report } = runIntelligentPreprocessing(rawRows, req.body.options || {});

    db.prepare('DELETE FROM dataset_clean_rows WHERE dataset_id = ?').run(id);
    const insClean = db.prepare('INSERT INTO dataset_clean_rows (dataset_id, row_index, data_json) VALUES (?, ?, ?)');
    cleanedRows.forEach((r, i) => insClean.run(id, i, JSON.stringify(r)));

    db.prepare('UPDATE datasets SET clean_row_count = ?, quality_report_json = ? WHERE id = ?').run(
      cleanedRows.length,
      JSON.stringify(report),
      id
    );

    res.json({ qualityReport: report, cleanPreview: cleanedRows.slice(0, 60) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/datasets/:id/download', (req, res) => {
  try {
    const id = Number(req.params.id);
    const { dataset, rows } = fetchCleanDatasetRows(id);
    res.json({ name: dataset.name, rows });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// ============================================================================
// MODULE 4: ML EXPERIMENTATION LAB & COMPARATIVE MODEL ANALYSIS
// ============================================================================
app.get('/api/ml/runs', (_req, res) => {
  const rows = db.prepare('SELECT * FROM ml_runs ORDER BY id DESC').all() as any[];
  res.json({
    runs: rows.map((r) => ({
      id: r.id,
      datasetId: r.dataset_id,
      datasetName: r.dataset_name,
      algorithm: r.algorithm,
      targetColumn: r.target_column,
      featureColumns: JSON.parse(r.feature_columns_json),
      testSize: r.test_size,
      cvFolds: r.cv_folds,
      hyperparams: JSON.parse(r.hyperparams_json),
      accuracy: r.accuracy,
      precision: r.precision,
      recall: r.recall,
      f1Score: r.f1_score,
      rocAuc: r.roc_auc,
      confusionMatrix: JSON.parse(r.confusion_matrix_json),
      rocCurve: JSON.parse(r.roc_curve_json),
      featureImportance: JSON.parse(r.feature_importance_json),
      cvSummary: r.cv_summary_json ? JSON.parse(r.cv_summary_json) : null,
      tuningSummary: r.tuning_summary,
      trainingTimeMs: r.training_time_ms,
      predictionTimeMs: r.prediction_time_ms,
      isProduction: Boolean(r.is_production),
      createdAt: r.created_at,
    })),
  });
});

app.post('/api/ml/train-batch', (req, res) => {
  try {
    const {
      datasetId,
      targetColumn,
      featureColumns,
      algorithms,
      testSize = 0.25,
      cvFolds = 5,
      autoTune = false,
    } = req.body;

    const dsId = Number(datasetId || 1);
    const { dataset, rows } = fetchCleanDatasetRows(dsId);
    const report = JSON.parse(dataset.quality_report_json);

    const chosenAlgos: AlgorithmId[] =
      Array.isArray(algorithms) && algorithms.length > 0
        ? algorithms
        : ['Logistic Regression', 'Decision Tree', 'Random Forest', 'Gradient Boosting', 'XGBoost'];

    const chosenFeatures: string[] =
      Array.isArray(featureColumns) && featureColumns.length > 0
        ? featureColumns
        : report.selectableFeatures;

    const results = chosenAlgos.map((algorithm) =>
      trainAndEvaluateSupervisedModel({
        datasetId: dsId,
        datasetName: dataset.name,
        rows,
        algorithm,
        targetColumn,
        featureColumns: chosenFeatures,
        testSize: Number(testSize),
        cvFolds: Number(cvFolds),
        autoTune: Boolean(autoTune),
      })
    );

    let bestIdx = 0;
    let bestComp = -1;
    results.forEach((r, idx) => {
      const comp = r.f1Score * 0.5 + r.rocAuc * 0.5;
      if (comp > bestComp) {
        bestComp = comp;
        bestIdx = idx;
      }
    });

    db.prepare('UPDATE ml_runs SET is_production = 0').run();
    const ins = db.prepare(`
      INSERT INTO ml_runs (
        dataset_id, dataset_name, algorithm, target_column, feature_columns_json,
        test_size, cv_folds, hyperparams_json, accuracy, precision, recall, f1_score, roc_auc,
        confusion_matrix_json, roc_curve_json, feature_importance_json, cv_summary_json,
        tuning_summary, artifact_json, training_time_ms, prediction_time_ms, is_production
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const savedRuns = results.map((r, idx) => {
      const info = ins.run(
        r.datasetId,
        r.datasetName,
        r.algorithm,
        r.targetColumn,
        JSON.stringify(r.featureColumns),
        r.testSize,
        r.cvFolds,
        JSON.stringify(r.hyperparams),
        r.accuracy,
        r.precision,
        r.recall,
        r.f1Score,
        r.rocAuc,
        JSON.stringify(r.confusionMatrix),
        JSON.stringify(r.rocCurve),
        JSON.stringify(r.featureImportance),
        JSON.stringify(r.cvSummary ?? null),
        r.tuningSummary ?? null,
        JSON.stringify(r.artifact),
        r.trainingTimeMs,
        r.predictionTimeMs,
        idx === bestIdx ? 1 : 0
      );
      const { artifact: _a, ...rest } = r;
      return { ...rest, id: Number(info.lastInsertRowid), isProduction: idx === bestIdx };
    });

    refreshSupplierPredictionsFromModel(results[bestIdx].artifact);
    regenerateDecisionsFromLiveSuppliers();

    const best = savedRuns[bestIdx];
    const explanation = `${best.algorithm} achieved the highest composite test score (F1 ${(best.f1Score * 100).toFixed(1)}%, ROC-AUC ${best.rocAuc.toFixed(3)}, Accuracy ${(best.accuracy * 100).toFixed(1)}%${best.cvSummary ? `, ${best.cvFolds}-Fold CV Mean F1 ${(best.cvSummary.meanF1 * 100).toFixed(1)}%` : ''}). Tree ensembles and regularized boosting capture non-linear risk thresholds across reliability decay, delay spikes, and inventory shortfalls without overfitting.`;

    res.json({ runs: savedRuns, bestAlgorithm: best.algorithm, explanation });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/ml/runs/:id/promote', (req, res) => {
  const id = Number(req.params.id);
  const run = db.prepare('SELECT * FROM ml_runs WHERE id = ?').get(id) as any;
  if (!run) return res.status(404).json({ error: 'Experiment run not found.' });
  db.prepare('UPDATE ml_runs SET is_production = 0').run();
  db.prepare('UPDATE ml_runs SET is_production = 1 WHERE id = ?').run(id);
  refreshSupplierPredictionsFromModel(JSON.parse(run.artifact_json));
  regenerateDecisionsFromLiveSuppliers();
  res.json({ promotedId: id, algorithm: run.algorithm });
});

// ============================================================================
// MODULE 5: AI PREDICTION ENGINE
// ============================================================================
app.post('/api/predict', (req, res) => {
  try {
    const {
      runId,
      supplier_reliability,
      delivery_delay_days,
      supplier_dependency_pct,
      shipment_distance_km,
      inventory_level,
      order_quantity,
      historical_disruptions,
      defect_rate_pct = 1.8,
      financial_health_score = 72,
      safety_stock = 1000,
    } = req.body;

    const run = runId
      ? (db.prepare('SELECT * FROM ml_runs WHERE id = ?').get(Number(runId)) as any)
      : (db.prepare('SELECT * FROM ml_runs ORDER BY is_production DESC, id DESC LIMIT 1').get() as any);

    if (!run) return res.status(404).json({ error: 'No trained ML model available.' });
    const artifact = JSON.parse(run.artifact_json);

    const rel = Number(supplier_reliability ?? 75);
    const delay = Number(delivery_delay_days ?? 4);
    const dep = Number(supplier_dependency_pct ?? 20);
    const dist = Number(shipment_distance_km ?? 5500);
    const inv = Number(inventory_level ?? 900);
    const qty = Number(order_quantity ?? 1600);
    const hist = Number(historical_disruptions ?? 2);

    const featureMap: Record<string, number> = {
      supplier_reliability: rel,
      delivery_delay_days: delay,
      supplier_dependency_pct: dep,
      shipment_distance_km: dist,
      inventory_level: inv,
      safety_stock: Number(safety_stock),
      order_quantity: qty,
      historical_disruptions: hist,
      defect_rate_pct: Number(defect_rate_pct),
      financial_health_score: Number(financial_health_score),
      shipping_cost_usd: qty * 1.4,
      demand_inventory_pressure: Number((qty / Math.max(1, inv)).toFixed(3)),
      reliability_delay_index: Number(((100 - rel) * (1 + delay / 10)).toFixed(2)),
    };

    const vec = artifact.featureNames.map((f: string) => featureMap[f] ?? 0);
    const disruptionProb = Number(Math.max(0.02, Math.min(0.98, predictProbability(artifact, vec))).toFixed(4));

    // Derived delay & shortage risk projections calibrated against the trained model output + physical constraints
    const delayRiskProb = Number(
      Math.min(0.98, Math.max(0.04, disruptionProb * 0.68 + Math.min(0.35, delay / 28))).toFixed(4)
    );
    const invRatio = qty / Math.max(1, inv);
    const shortageRiskProb = Number(
      Math.min(0.97, Math.max(0.05, disruptionProb * 0.5 + Math.max(0, (invRatio - 0.85) * 0.35))).toFixed(4)
    );

    const factors = explainPredictionFactors(artifact, vec).slice(0, 6);

    const riskCategory =
      disruptionProb >= 0.72
        ? 'CRITICAL'
        : disruptionProb >= 0.5
        ? 'HIGH'
        : disruptionProb >= 0.3
        ? 'MEDIUM'
        : 'LOW';

    const topRiskDrivers = factors
      .filter((f) => f.direction === 'increases_risk')
      .slice(0, 3)
      .map((f) => `${f.feature.replace(/_/g, ' ')} (${f.value})`);

    const explanation =
      topRiskDrivers.length > 0
        ? `Trained ${run.algorithm} (Target: ${run.target_column}) predicts a ${(disruptionProb * 100).toFixed(1)}% disruption probability (${riskCategory}), pushed upward primarily by ${topRiskDrivers.join(', ')}.`
        : `Trained ${run.algorithm} classifies this order profile as ${riskCategory} risk (${(disruptionProb * 100).toFixed(1)}%) with resilient reliability and buffer metrics.`;

    const suggestedActions = [
      disruptionProb >= 0.5
        ? `Engage secondary supplier allocation to cap single-node dependency below 18% (currently ${dep}%).`
        : `Maintain standard procurement cadence and quarterly SLA monitoring.`,
      inv < Number(safety_stock) || shortageRiskProb >= 0.5
        ? `Increase warehouse buffer stock by +${Math.max(250, Math.round(qty * 0.35))} units to absorb ${delay}-day delay variance.`
        : `Inventory coverage is adequate relative to current order quantity.`,
      delay >= 6
        ? `Shift critical replenishment batch to expedited rail/air corridor to trim lead-time slippage.`
        : `Standard ocean/road freight mode remains cost-optimal.`,
    ];

    res.json({
      modelUsed: run.algorithm,
      targetColumn: run.target_column,
      predictedOutcome: disruptionProb >= 0.5 ? 'Disruption Likely' : 'Nominal Continuity',
      disruptionRiskProb: disruptionProb,
      delayRiskProb,
      shortageRiskProb,
      riskCategory,
      contributingFactors: factors,
      explanation,
      suggestedActions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// MODULE 6: ADVANCED ANALYTICAL INTELLIGENCE
// ============================================================================
app.get('/api/analytics', (req, res) => {
  try {
    const datasetId = Number(req.query.datasetId || 1);
    const { dataset, rows } = fetchCleanDatasetRows(datasetId);
    const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY risk_score DESC').all() as any[];

    const numericCols = [
      'supplier_reliability',
      'delivery_delay_days',
      'supplier_dependency_pct',
      'shipment_distance_km',
      'inventory_level',
      'order_quantity',
      'historical_disruptions',
      'defect_rate_pct',
      'disruption_occurred',
    ].filter((c) => rows[0] && c in rows[0]);

    const pearson = (xs: number[], ys: number[]) => {
      const mx = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
      const my = ys.reduce((a, b) => a + b, 0) / (ys.length || 1);
      let num = 0;
      let dx = 0;
      let dy = 0;
      for (let i = 0; i < xs.length; i++) {
        num += (xs[i] - mx) * (ys[i] - my);
        dx += (xs[i] - mx) ** 2;
        dy += (ys[i] - my) ** 2;
      }
      const d = Math.sqrt(dx * dy);
      return d > 1e-9 ? Number((num / d).toFixed(3)) : 0;
    };

    const colVecs = new Map(
      numericCols.map((c) => [c, rows.map((r) => toFiniteNumber(r[c]) ?? 0)])
    );

    const correlations: { x: string; y: string; value: number }[] = [];
    for (const c1 of numericCols) {
      for (const c2 of numericCols) {
        correlations.push({
          x: c1,
          y: c2,
          value: c1 === c2 ? 1 : pearson(colVecs.get(c1)!, colVecs.get(c2)!),
        });
      }
    }

    // Regional aggregation
    const regMap = new Map<string, any[]>();
    for (const r of rows) {
      const reg = String(r.region || 'Other');
      if (!regMap.has(reg)) regMap.set(reg, []);
      regMap.get(reg)!.push(r);
    }
    const regionalComparison = Array.from(regMap.entries()).map(([region, grp]) => ({
      region,
      shipments: grp.length,
      avgDelayDays: Number(
        (grp.reduce((a, r) => a + (toFiniteNumber(r.delivery_delay_days) ?? 0), 0) / grp.length).toFixed(2)
      ),
      avgReliability: Number(
        (grp.reduce((a, r) => a + (toFiniteNumber(r.supplier_reliability) ?? 0), 0) / grp.length).toFixed(1)
      ),
      disruptionRatePct: Number(
        (
          (grp.filter((r) => (toFiniteNumber(r.disruption_occurred) ?? 0) >= 0.5).length / grp.length) *
          100
        ).toFixed(1)
      ),
    }));

    // Delay distribution buckets
    const delayDistribution = [
      { bucket: '0-2d', count: 0 },
      { bucket: '2-5d', count: 0 },
      { bucket: '5-10d', count: 0 },
      { bucket: '10d+', count: 0 },
    ];
    for (const r of rows) {
      const d = toFiniteNumber(r.delivery_delay_days) ?? 0;
      if (d <= 2) delayDistribution[0].count++;
      else if (d <= 5) delayDistribution[1].count++;
      else if (d <= 10) delayDistribution[2].count++;
      else delayDistribution[3].count++;
    }

    const anomalies = detectAnomaliesUnsupervised(
      rows,
      numericCols.filter((c) => c !== 'disruption_occurred')
    );

    const trends = db
      .prepare(
        `SELECT period_label as period,
                ROUND(AVG(on_time_pct), 1) as onTimePct,
                ROUND(AVG(avg_delay_days), 1) as avgDelayDays,
                SUM(disruptions) as disruptions
         FROM supplier_trends
         GROUP BY period_label
         ORDER BY period_label ASC`
      )
      .all();

    const targetDrivers = correlations
      .filter((c) => c.x === 'disruption_occurred' && c.y !== 'disruption_occurred')
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

    const worstRegion = [...regionalComparison].sort((a, b) => b.disruptionRatePct - a.disruptionRatePct)[0];

    res.json({
      datasetName: dataset.name,
      recordCount: rows.length,
      numericCols,
      correlations,
      regionalComparison,
      delayDistribution,
      anomalies,
      trends,
      supplierPerformance: suppliers.map((s) => ({
        name: s.name.split(' ').slice(0, 2).join(' '),
        fullName: s.name,
        reliability: s.reliability_score,
        dependencySharePct: s.dependency_share_pct,
        riskScore: s.risk_score,
        avgDelayDays: s.avg_delay_days,
      })),
      interpretations: [
        {
          title: 'Primary Quantitative Risk Correlates',
          summary: targetDrivers[0]
            ? `${targetDrivers[0].y.replace(/_/g, ' ')} exhibits the strongest linear correlation with supply disruptions (r = ${targetDrivers[0].value}), followed by ${targetDrivers[1]?.y.replace(/_/g, ' ')} (r = ${targetDrivers[1]?.value}).`
            : 'Reliability and delay variance dominate disruption incidence.',
          businessMeaning:
            'Procurement teams can use these leading indicators as early-warning SLA triggers 2–3 weeks before an inventory stockout materializes.',
        },
        {
          title: 'Regional Risk Concentration',
          summary: worstRegion
            ? `${worstRegion.region} leads regional disruption exposure at ${worstRegion.disruptionRatePct}% across ${worstRegion.shipments} orders, averaging ${worstRegion.avgDelayDays} delay days.`
            : 'Regional corridors display asymmetric transit reliability.',
          businessMeaning:
            'High spend concentration in elevated-delay corridors creates compounded revenue-at-risk during seasonal demand surges; near-shore diversification reduces volatility.',
        },
      ],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// MODULE 7: AI INVESTIGATION AGENT
// ============================================================================
app.get('/api/investigations', (_req, res) => {
  const rows = db.prepare('SELECT * FROM investigations ORDER BY id DESC LIMIT 20').all() as any[];
  res.json({
    investigations: rows.map((r) => ({
      id: r.id,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      workflowSteps: JSON.parse(r.workflow_steps_json),
      summary: r.summary,
      mitigationPlan: JSON.parse(r.mitigation_plan_json),
      engineUsed: r.engine_used,
      createdAt: r.created_at,
    })),
  });
});

app.post('/api/investigations/run', async (req, res) => {
  try {
    const supplierId = Number(req.body.supplierId);
    if (!supplierId) return res.status(400).json({ error: 'supplierId is required.' });
    const report = await runSupplierInvestigationAgent(supplierId);
    res.status(201).json({ investigation: report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// MODULE 8: BUSINESS IMPACT INTELLIGENCE
// ============================================================================
app.get('/api/business-impact', (_req, res) => {
  const suppliers = db.prepare('SELECT * FROM suppliers').all() as any[];
  const report = calculateBusinessImpact(suppliers);
  res.json(report);
});

// ============================================================================
// MODULE 9: WHAT-IF SIMULATION ENGINE
// ============================================================================
app.get('/api/simulations', (_req, res) => {
  const rows = db.prepare('SELECT * FROM simulations ORDER BY id DESC LIMIT 20').all() as any[];
  res.json({
    simulations: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      ...JSON.parse(r.result_json),
    })),
  });
});

app.post('/api/simulations/run', (req, res) => {
  try {
    const {
      scenarioType,
      supplierId,
      alternativeSupplierId,
      delayIncreaseDays,
      reliabilityDropPts,
      inventoryDropPct,
    } = req.body;

    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(Number(supplierId)) as any;
    if (!supplier) return res.status(404).json({ error: 'Target supplier not found.' });

    const altSupplier = alternativeSupplierId
      ? (db.prepare('SELECT * FROM suppliers WHERE id = ?').get(Number(alternativeSupplierId)) as any)
      : null;

    const prodRun = db
      .prepare('SELECT artifact_json FROM ml_runs ORDER BY is_production DESC, id DESC LIMIT 1')
      .get() as any;
    const artifact = prodRun ? JSON.parse(prodRun.artifact_json) : null;

    const result = runDeterministicSimulation({
      scenarioType: scenarioType as ScenarioPresetType,
      supplier,
      alternativeSupplier: altSupplier,
      delayIncreaseDays: Number(delayIncreaseDays ?? 8),
      reliabilityDropPts: Number(reliabilityDropPts ?? 18),
      inventoryDropPct: Number(inventoryDropPct ?? 45),
      modelArtifact: artifact,
    });

    const info = db
      .prepare('INSERT INTO simulations (scenario_type, title, supplier_name, result_json) VALUES (?, ?, ?, ?)')
      .run(result.scenarioType, result.title, result.targetSupplierName, JSON.stringify(result));

    res.status(201).json({ simulation: { id: Number(info.lastInsertRowid), ...result } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// MODULE 10: DECISION INTELLIGENCE
// ============================================================================
app.get('/api/decisions', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM decisions
       ORDER BY CASE status WHEN 'Open' THEN 1 WHEN 'In Progress' THEN 2 ELSE 3 END,
                CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END`
    )
    .all();
  res.json({ decisions: rows });
});

app.post('/api/decisions/sync', (_req, res) => {
  regenerateDecisionsFromLiveSuppliers();
  const rows = db.prepare('SELECT * FROM decisions').all();
  res.json({ decisions: rows });
});

app.patch('/api/decisions/:id', (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!['Open', 'In Progress', 'Completed'].includes(status)) {
    return res.status(400).json({ error: 'Status must be Open, In Progress, or Completed.' });
  }
  db.prepare('UPDATE decisions SET status = ? WHERE id = ?').run(status, id);
  res.json({ updated: true });
});

// ============================================================================
// MODULE 11: UNIFIED REPORT DATA BUNDLE
// ============================================================================
app.get('/api/reports/bundle', (_req, res) => {
  const datasets = db.prepare('SELECT id, name, source_label, is_synthetic, raw_row_count, clean_row_count, quality_report_json FROM datasets ORDER BY id DESC').all() as any[];
  const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY risk_score DESC').all() as any[];
  const runs = db.prepare('SELECT id, dataset_name, algorithm, target_column, accuracy, precision, recall, f1_score, roc_auc, training_time_ms, is_production FROM ml_runs ORDER BY id DESC LIMIT 10').all();
  const investigations = db.prepare('SELECT supplier_name, summary, engine_used, created_at FROM investigations ORDER BY id DESC LIMIT 5').all();
  const simulations = db.prepare('SELECT result_json, created_at FROM simulations ORDER BY id DESC LIMIT 5').all() as any[];
  const decisions = db.prepare('SELECT * FROM decisions').all();
  const impact = calculateBusinessImpact(suppliers);

  res.json({
    generatedAt: new Date().toISOString(),
    dataset: datasets[0]
      ? { ...datasets[0], qualityReport: JSON.parse(datasets[0].quality_report_json) }
      : null,
    suppliers,
    mlRuns: runs,
    investigations,
    simulations: simulations.map((s) => JSON.parse(s.result_json)),
    decisions,
    businessImpact: impact,
  });
});

// ============================================================================
// VITE DEV / PRODUCTION STATIC HOSTING
// ============================================================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SUPPLY CHAIN IQ platform running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
