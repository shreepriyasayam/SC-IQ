import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new DatabaseSync(path.join(dataDir, 'sciq_v2.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initializeDatabaseSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Supply Chain Analyst',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS datasets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_label TEXT NOT NULL,
      is_synthetic INTEGER NOT NULL DEFAULT 0,
      documentation_json TEXT NOT NULL,
      raw_row_count INTEGER NOT NULL,
      clean_row_count INTEGER NOT NULL,
      quality_report_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dataset_raw_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id INTEGER NOT NULL,
      row_index INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dataset_clean_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id INTEGER NOT NULL,
      row_index INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      region TEXT NOT NULL,
      country TEXT NOT NULL,
      category TEXT NOT NULL,
      dependency_level TEXT NOT NULL,
      dependency_share_pct REAL NOT NULL,
      reliability_score REAL NOT NULL,
      avg_delay_days REAL NOT NULL,
      shipment_distance_km REAL NOT NULL,
      inventory_level_units INTEGER NOT NULL,
      safety_stock_units INTEGER NOT NULL,
      order_quantity_units INTEGER NOT NULL,
      historical_disruptions INTEGER NOT NULL,
      annual_spend_usd REAL NOT NULL,
      daily_revenue_at_risk_usd REAL NOT NULL,
      financial_health_score REAL NOT NULL,
      defect_rate_pct REAL NOT NULL,
      risk_score REAL NOT NULL,
      risk_category TEXT NOT NULL,
      risk_explanation TEXT NOT NULL,
      disruption_prob REAL NOT NULL DEFAULT 0.25,
      delay_prob REAL NOT NULL DEFAULT 0.25,
      shortage_prob REAL NOT NULL DEFAULT 0.20,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS supplier_trends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      period_label TEXT NOT NULL,
      on_time_pct REAL NOT NULL,
      avg_delay_days REAL NOT NULL,
      defect_pct REAL NOT NULL,
      disruptions INTEGER NOT NULL,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ml_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id INTEGER NOT NULL,
      dataset_name TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      target_column TEXT NOT NULL,
      feature_columns_json TEXT NOT NULL,
      test_size REAL NOT NULL,
      cv_folds INTEGER NOT NULL,
      hyperparams_json TEXT NOT NULL,
      accuracy REAL NOT NULL,
      precision REAL NOT NULL,
      recall REAL NOT NULL,
      f1_score REAL NOT NULL,
      roc_auc REAL NOT NULL,
      confusion_matrix_json TEXT NOT NULL,
      roc_curve_json TEXT NOT NULL,
      feature_importance_json TEXT NOT NULL,
      cv_summary_json TEXT,
      tuning_summary TEXT,
      artifact_json TEXT NOT NULL,
      training_time_ms REAL NOT NULL,
      prediction_time_ms REAL NOT NULL,
      is_production INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS investigations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      supplier_name TEXT NOT NULL,
      workflow_steps_json TEXT NOT NULL,
      summary TEXT NOT NULL,
      mitigation_plan_json TEXT NOT NULL,
      engine_used TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS simulations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_type TEXT NOT NULL,
      title TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER,
      supplier_name TEXT,
      category TEXT NOT NULL,
      problem TEXT NOT NULL,
      evidence TEXT NOT NULL,
      recommended_action TEXT NOT NULL,
      expected_benefit TEXT NOT NULL,
      priority TEXT NOT NULL,
      explanation TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
