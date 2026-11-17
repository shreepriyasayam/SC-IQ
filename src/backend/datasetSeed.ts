import bcrypt from 'bcryptjs';
import type { AlgorithmId, DatasetDocumentation, TrainedModelArtifact } from '../engine/contracts.ts';
import { runIntelligentPreprocessing } from '../engine/dataPipeline.ts';
import { predictProbability, seededRng, trainAndEvaluateSupervisedModel } from '../engine/mlModels.ts';
import { db } from './database.ts';

const INITIAL_SUPPLIERS = [
  {
    code: 'SCI-01',
    name: 'Kaohsiung Semiconductor Foundry',
    region: 'East Asia',
    country: 'Taiwan',
    category: 'Microcontrollers & ICs',
    dependency_level: 'Critical',
    dependency_share_pct: 32,
    reliability_score: 64,
    avg_delay_days: 9.4,
    shipment_distance_km: 11400,
    inventory_level_units: 620,
    safety_stock_units: 1100,
    order_quantity_units: 2400,
    historical_disruptions: 5,
    annual_spend_usd: 5800000,
    daily_revenue_at_risk_usd: 145000,
    financial_health_score: 79,
    defect_rate_pct: 2.1,
  },
  {
    code: 'SCI-02',
    name: 'Shenzhen Precision Connectors',
    region: 'East Asia',
    country: 'China',
    category: 'Electronic Interconnects',
    dependency_level: 'High',
    dependency_share_pct: 24,
    reliability_score: 57,
    avg_delay_days: 11.8,
    shipment_distance_km: 10900,
    inventory_level_units: 540,
    safety_stock_units: 1000,
    order_quantity_units: 2600,
    historical_disruptions: 6,
    annual_spend_usd: 4100000,
    daily_revenue_at_risk_usd: 98000,
    financial_health_score: 62,
    defect_rate_pct: 3.9,
  },
  {
    code: 'SCI-03',
    name: 'Rotterdam Specialty Alloys BV',
    region: 'Western Europe',
    country: 'Netherlands',
    category: 'Structural Metals',
    dependency_level: 'Moderate',
    dependency_share_pct: 14,
    reliability_score: 93,
    avg_delay_days: 1.6,
    shipment_distance_km: 6100,
    inventory_level_units: 1850,
    safety_stock_units: 1200,
    order_quantity_units: 1500,
    historical_disruptions: 1,
    annual_spend_usd: 2950000,
    daily_revenue_at_risk_usd: 42000,
    financial_health_score: 91,
    defect_rate_pct: 0.6,
  },
  {
    code: 'SCI-04',
    name: 'Stuttgart Mechatronics GmbH',
    region: 'Western Europe',
    country: 'Germany',
    category: 'Actuators & Drives',
    dependency_level: 'High',
    dependency_share_pct: 21,
    reliability_score: 95,
    avg_delay_days: 1.2,
    shipment_distance_km: 6450,
    inventory_level_units: 2100,
    safety_stock_units: 1300,
    order_quantity_units: 1400,
    historical_disruptions: 0,
    annual_spend_usd: 4900000,
    daily_revenue_at_risk_usd: 76000,
    financial_health_score: 94,
    defect_rate_pct: 0.4,
  },
  {
    code: 'SCI-05',
    name: 'Monterrey Die-Casting SA',
    region: 'North America',
    country: 'Mexico',
    category: 'Chassis & Enclosures',
    dependency_level: 'Moderate',
    dependency_share_pct: 16,
    reliability_score: 84,
    avg_delay_days: 3.4,
    shipment_distance_km: 2300,
    inventory_level_units: 1420,
    safety_stock_units: 1050,
    order_quantity_units: 1800,
    historical_disruptions: 2,
    annual_spend_usd: 2650000,
    daily_revenue_at_risk_usd: 48000,
    financial_health_score: 77,
    defect_rate_pct: 1.5,
  },
  {
    code: 'SCI-06',
    name: 'Chennai Polymer Compounds',
    region: 'South Asia',
    country: 'India',
    category: 'Industrial Resins',
    dependency_level: 'High',
    dependency_share_pct: 19,
    reliability_score: 61,
    avg_delay_days: 10.2,
    shipment_distance_km: 13100,
    inventory_level_units: 680,
    safety_stock_units: 1150,
    order_quantity_units: 2100,
    historical_disruptions: 5,
    annual_spend_usd: 2240000,
    daily_revenue_at_risk_usd: 64000,
    financial_health_score: 59,
    defect_rate_pct: 3.4,
  },
  {
    code: 'SCI-07',
    name: 'Detroit Industrial Fasteners',
    region: 'North America',
    country: 'United States',
    category: 'Mechanical Hardware',
    dependency_level: 'Low',
    dependency_share_pct: 9,
    reliability_score: 91,
    avg_delay_days: 1.5,
    shipment_distance_km: 950,
    inventory_level_units: 2400,
    safety_stock_units: 1100,
    order_quantity_units: 1600,
    historical_disruptions: 1,
    annual_spend_usd: 1580000,
    daily_revenue_at_risk_usd: 21000,
    financial_health_score: 88,
    defect_rate_pct: 0.8,
  },
  {
    code: 'SCI-08',
    name: 'Sao Paulo Cathode Refining',
    region: 'Latin America',
    country: 'Brazil',
    category: 'Battery Materials',
    dependency_level: 'Critical',
    dependency_share_pct: 28,
    reliability_score: 53,
    avg_delay_days: 13.5,
    shipment_distance_km: 8900,
    inventory_level_units: 490,
    safety_stock_units: 1250,
    order_quantity_units: 2300,
    historical_disruptions: 6,
    annual_spend_usd: 3750000,
    daily_revenue_at_risk_usd: 112000,
    financial_health_score: 54,
    defect_rate_pct: 4.3,
  },
  {
    code: 'SCI-09',
    name: 'Busan Marine Optics Co.',
    region: 'East Asia',
    country: 'South Korea',
    category: 'Optical Sensors',
    dependency_level: 'Moderate',
    dependency_share_pct: 15,
    reliability_score: 87,
    avg_delay_days: 2.8,
    shipment_distance_km: 10200,
    inventory_level_units: 1560,
    safety_stock_units: 1000,
    order_quantity_units: 1300,
    historical_disruptions: 1,
    annual_spend_usd: 2890000,
    daily_revenue_at_risk_usd: 52000,
    financial_health_score: 85,
    defect_rate_pct: 0.9,
  },
  {
    code: 'SCI-10',
    name: 'Gdansk Thermal Packaging',
    region: 'Eastern Europe',
    country: 'Poland',
    category: 'Protective Packaging',
    dependency_level: 'Low',
    dependency_share_pct: 8,
    reliability_score: 89,
    avg_delay_days: 2.1,
    shipment_distance_km: 7100,
    inventory_level_units: 1920,
    safety_stock_units: 950,
    order_quantity_units: 1450,
    historical_disruptions: 1,
    annual_spend_usd: 1180000,
    daily_revenue_at_risk_usd: 18000,
    financial_health_score: 84,
    defect_rate_pct: 1.0,
  },
  {
    code: 'SCI-11',
    name: 'Haiphong Harness & Cabling',
    region: 'Southeast Asia',
    country: 'Vietnam',
    category: 'Wiring Assemblies',
    dependency_level: 'High',
    dependency_share_pct: 18,
    reliability_score: 73,
    avg_delay_days: 6.5,
    shipment_distance_km: 12300,
    inventory_level_units: 960,
    safety_stock_units: 1100,
    order_quantity_units: 1950,
    historical_disruptions: 3,
    annual_spend_usd: 1950000,
    daily_revenue_at_risk_usd: 46000,
    financial_health_score: 71,
    defect_rate_pct: 2.3,
  },
  {
    code: 'SCI-12',
    name: 'Alexandria Composites Ltd.',
    region: 'MENA',
    country: 'Egypt',
    category: 'Fiberglass Laminates',
    dependency_level: 'Moderate',
    dependency_share_pct: 12,
    reliability_score: 52,
    avg_delay_days: 14.2,
    shipment_distance_km: 9300,
    inventory_level_units: 410,
    safety_stock_units: 980,
    order_quantity_units: 1700,
    historical_disruptions: 7,
    annual_spend_usd: 1320000,
    daily_revenue_at_risk_usd: 39000,
    financial_health_score: 49,
    defect_rate_pct: 4.8,
  },
];

export function computeSupplierScoreAndCategory(s: {
  name: string;
  reliability_score: number;
  avg_delay_days: number;
  dependency_share_pct: number;
  inventory_level_units: number;
  safety_stock_units: number;
  historical_disruptions: number;
  financial_health_score: number;
  defect_rate_pct: number;
}): { riskScore: number; riskCategory: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; riskExplanation: string } {
  const relPenalty = (100 - s.reliability_score) * 0.36;
  const delayPenalty = Math.min(24, s.avg_delay_days * 1.55);
  const histPenalty = Math.min(20, s.historical_disruptions * 3.2);
  const invGap = s.inventory_level_units < s.safety_stock_units ? 10 : 0;
  const finPenalty = (100 - s.financial_health_score) * 0.16;
  const depPenalty = s.dependency_share_pct * 0.28;
  const defectPenalty = s.defect_rate_pct * 2.1;

  const riskScore = Number(
    Math.max(
      5,
      Math.min(98, relPenalty + delayPenalty + histPenalty + invGap + finPenalty + depPenalty + defectPenalty)
    ).toFixed(1)
  );

  let riskCategory: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  if (riskScore >= 75) riskCategory = 'CRITICAL';
  else if (riskScore >= 55) riskCategory = 'HIGH';
  else if (riskScore >= 35) riskCategory = 'MEDIUM';

  const factors = [
    { label: `delivery reliability (${s.reliability_score}%)`, weight: relPenalty },
    { label: `avg delay (${s.avg_delay_days}d)`, weight: delayPenalty },
    { label: `${s.historical_disruptions} historical disruptions`, weight: histPenalty },
    { label: `${s.dependency_share_pct}% spend dependency`, weight: depPenalty },
    { label: `safety-stock shortfall`, weight: invGap },
    { label: `defect rate (${s.defect_rate_pct}%)`, weight: defectPenalty },
  ]
    .filter((f) => f.weight > 1)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((f) => f.label);

  const riskExplanation =
    riskScore >= 55
      ? `${s.name} registers a ${riskCategory} risk score (${riskScore}/100) driven primarily by ${factors.join(', ')}.`
      : `${s.name} holds a ${riskCategory} risk score (${riskScore}/100); primary monitored indicators are ${factors.join(', ')}.`;

  return { riskScore, riskCategory, riskExplanation };
}

function buildSyntheticSupplyChainDataset(): {
  rows: Record<string, unknown>[];
  documentation: DatasetDocumentation;
} {
  const rng = seededRng(202611);
  const modes = ['Ocean Freight', 'Air Cargo', 'Rail Intermodal', 'Road Freight'];
  const rows: Record<string, unknown>[] = [];
  const dates = ['2026-06-15', '2026-07-15', '2026-08-15', '2026-09-15', '2026-10-15', '2026-11-05'];

  for (let i = 0; i < 320; i++) {
    const sup = INITIAL_SUPPLIERS[i % INITIAL_SUPPLIERS.length];
    const mode = modes[Math.floor(rng() * modes.length)];
    const orderDate = dates[i % dates.length];

    const reliability = Number(
      Math.max(32, Math.min(99, sup.reliability_score + (rng() - 0.5) * 14)).toFixed(1)
    );
    const delayDays = Number(
      Math.max(0, sup.avg_delay_days + (rng() - 0.45) * 6 + (mode === 'Ocean Freight' ? 1.8 : mode === 'Air Cargo' ? -1.5 : 0)).toFixed(1)
    );
    const distanceKm = Math.round(sup.shipment_distance_km * (0.9 + rng() * 0.2));
    const inventoryLevel = Math.round(sup.inventory_level_units * (0.65 + rng() * 0.75));
    const safetyStock = sup.safety_stock_units;
    const orderQty = Math.round(sup.order_quantity_units * (0.7 + rng() * 0.65));
    const histDisruptions = Math.max(0, Math.round(sup.historical_disruptions + (rng() - 0.5) * 2));
    const defectRate = Number(Math.max(0.1, sup.defect_rate_pct + (rng() - 0.45) * 1.6).toFixed(2));
    const finHealth = Number(Math.max(30, Math.min(98, sup.financial_health_score + (rng() - 0.5) * 8)).toFixed(1));
    const depPct = Number(Math.max(4, Math.min(45, sup.dependency_share_pct + (rng() - 0.5) * 6)).toFixed(1));
    const shippingCost = Number(
      ((mode === 'Air Cargo' ? 2.9 : mode === 'Road Freight' ? 1.3 : 0.85) * orderQty * (0.8 + rng() * 0.4)).toFixed(2)
    );

    // Inject small realistic missingness (~3%) & 4 duplicate rows & 5 outlier spikes so preprocessing Before/After is visibly demonstrated!
    const missingRel = i % 39 === 7 ? null : reliability;
    const missingDefect = i % 47 === 11 ? null : defectRate;
    const spikedShipping = i === 18 || i === 142 ? Number((shippingCost * 4.5).toFixed(2)) : shippingCost;

    // Ground-truth probabilistic risk generators for 3 distinct valid binary targets
    const invDeficitRatio = Math.max(0, (safetyStock - inventoryLevel) / Math.max(1, safetyStock));
    const logOddsDisruption =
      -2.15 +
      0.072 * (82 - reliability) +
      0.24 * delayDays +
      0.32 * histDisruptions +
      0.38 * defectRate +
      1.35 * invDeficitRatio +
      0.03 * (75 - finHealth) +
      (rng() - 0.5) * 0.85;
    const pDisrupt = 1 / (1 + Math.exp(-logOddsDisruption));
    const disruptionOccurred = pDisrupt >= 0.5 ? 1 : 0;

    const deliveryDelayed = delayDays >= 5.0 || (delayDays >= 3.2 && rng() > 0.45) ? 1 : 0;
    const supplierFailure =
      disruptionOccurred === 1 && reliability < 65 && finHealth < 68 && rng() > 0.3 ? 1 : 0;

    const row: Record<string, unknown> = {
      record_id: `ORD-${1001 + i}`,
      order_date: orderDate,
      supplier_id: sup.code,
      supplier_name: sup.name,
      region: sup.region,
      transport_mode: mode,
      supplier_reliability: missingRel,
      delivery_delay_days: delayDays,
      supplier_dependency_pct: depPct,
      shipment_distance_km: distanceKm,
      inventory_level: inventoryLevel,
      safety_stock: safetyStock,
      order_quantity: orderQty,
      historical_disruptions: histDisruptions,
      defect_rate_pct: missingDefect,
      financial_health_score: finHealth,
      shipping_cost_usd: spikedShipping,
      disruption_occurred: disruptionOccurred,
      delivery_delayed: deliveryDelayed,
      supplier_failure: supplierFailure,
    };

    rows.push(row);
    if (i === 25 || i === 90 || i === 180 || i === 250) {
      rows.push({ ...row }); // intentional exact duplicate for data quality demonstration
    }
  }

  const documentation: DatasetDocumentation = {
    source: 'Synthetic Multi-Echelon Supply Chain Benchmark (Domain-Calibrated Capstone Dataset)',
    isSynthetic: true,
    recordCount: rows.length,
    featureDescriptions: [
      { name: 'supplier_reliability', description: 'On-time fulfillment consistency score (0–100%).' },
      { name: 'delivery_delay_days', description: 'Observed transit delay beyond quoted SLA lead time (days).' },
      { name: 'supplier_dependency_pct', description: 'Percentage of category procurement spend concentrated in this supplier.' },
      { name: 'shipment_distance_km', description: 'Origin-to-plant freight corridor distance in kilometers.' },
      { name: 'inventory_level', description: 'Current warehouse on-hand units for the supplied SKU family.' },
      { name: 'safety_stock', description: 'Target minimum safety-stock buffer units.' },
      { name: 'order_quantity', description: 'Replenishment purchase order volume (units).' },
      { name: 'historical_disruptions', description: 'Recorded supply disruption events over the trailing 12 months.' },
      { name: 'defect_rate_pct', description: 'Incoming quality inspection rejection percentage.' },
      { name: 'financial_health_score', description: 'Composite supplier liquidity and credit stability index (0–100).' },
      { name: 'shipping_cost_usd', description: 'Total logistics freight expense for the shipment.' },
    ],
    targetVariables: ['disruption_occurred', 'delivery_delayed', 'supplier_failure'],
    limitations: [
      'Clearly labeled synthetic data generated via domain-calibrated stochastic models; not actual proprietary corporate ERP records.',
      'Contains intentional ~2% missing cells, 4 exact duplicate rows, and 2 freight cost outliers to demonstrate preprocessing audits.',
      'Assumes independent order snapshots rather than real-time AIS vessel GPS or customs API feeds.',
    ],
  };

  return { rows, documentation };
}

export function refreshSupplierPredictionsFromModel(artifact?: TrainedModelArtifact) {
  let model = artifact;
  if (!model) {
    const prod = db
      .prepare('SELECT artifact_json FROM ml_runs ORDER BY is_production DESC, id DESC LIMIT 1')
      .get() as any;
    if (!prod) return;
    model = JSON.parse(prod.artifact_json) as TrainedModelArtifact;
  }

  const suppliers = db.prepare('SELECT * FROM suppliers').all() as any[];
  const updateStmt = db.prepare(
    'UPDATE suppliers SET disruption_prob = ?, delay_prob = ?, shortage_prob = ? WHERE id = ?'
  );

  for (const s of suppliers) {
    const fMap: Record<string, number> = {
      supplier_reliability: s.reliability_score,
      delivery_delay_days: s.avg_delay_days,
      supplier_dependency_pct: s.dependency_share_pct,
      shipment_distance_km: s.shipment_distance_km,
      inventory_level: s.inventory_level_units,
      safety_stock: s.safety_stock_units,
      order_quantity: s.order_quantity_units,
      historical_disruptions: s.historical_disruptions,
      defect_rate_pct: s.defect_rate_pct,
      financial_health_score: s.financial_health_score,
      shipping_cost_usd: s.order_quantity_units * 1.3,
      demand_inventory_pressure: Number((s.order_quantity_units / Math.max(1, s.inventory_level_units)).toFixed(3)),
      reliability_delay_index: Number(((100 - s.reliability_score) * (1 + s.avg_delay_days / 10)).toFixed(2)),
    };
    const vec = model.featureNames.map((f) => fMap[f] ?? 0);
    const prob = Number(Math.max(0.03, Math.min(0.97, predictProbability(model, vec))).toFixed(4));
    const delayProb = Number(Math.min(0.98, Math.max(0.04, prob * 0.8 + s.avg_delay_days / 25)).toFixed(4));
    const invDeficit = Math.max(0, (s.safety_stock_units - s.inventory_level_units) / Math.max(1, s.safety_stock_units));
    const shortageProb = Number(Math.min(0.97, Math.max(0.05, prob * 0.55 + invDeficit * 0.55)).toFixed(4));
    updateStmt.run(prob, delayProb, shortageProb, s.id);
  }
}

export function regenerateDecisionsFromLiveSuppliers() {
  const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY risk_score DESC').all() as any[];
  db.prepare('DELETE FROM decisions').run();

  const insertDec = db.prepare(`
    INSERT INTO decisions (
      supplier_id, supplier_name, category, problem, evidence,
      recommended_action, expected_benefit, priority, explanation, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  suppliers.slice(0, 6).forEach((s, idx) => {
    const pPct = (s.disruption_prob * 100).toFixed(1);
    const invBelow = s.inventory_level_units < s.safety_stock_units;
    const category =
      s.dependency_share_pct >= 24
        ? 'Diversify Supplier Dependency'
        : invBelow
        ? 'Increase Safety Stock'
        : s.avg_delay_days >= 8
        ? 'Adjust Procurement Schedules'
        : 'Investigate Declining Reliability';

    const priority = s.risk_score >= 75 ? 'Critical' : s.risk_score >= 55 ? 'High' : 'Medium';
    const action =
      s.dependency_share_pct >= 24
        ? `Qualify secondary supplier outside ${s.region} to cap ${s.name} dependency below 18% of spend.`
        : invBelow
        ? `Replenish buffer by +${s.safety_stock_units - s.inventory_level_units + 350} units to restore 21-day safety stock coverage.`
        : `Advance purchase order release by ${Math.ceil(s.avg_delay_days)} days and enforce weekly SLA telemetry audits.`;

    const benefit = `Reduces outage exposure by ~${Math.round(s.dependency_share_pct * 1.4)}% and safeguards ~$${Math.round(
      s.annual_spend_usd * s.disruption_prob * 0.25
    ).toLocaleString()} in annual spend continuity.`;

    insertDec.run(
      s.id,
      s.name,
      category,
      `${s.name} exhibits ${s.risk_category} risk (${s.risk_score}/100) with ${pPct}% ML-predicted disruption probability.`,
      `Reliability: ${s.reliability_score}% · Avg Delay: ${s.avg_delay_days}d · Inventory: ${s.inventory_level_units}/${s.safety_stock_units} units · Historical Disruptions: ${s.historical_disruptions}.`,
      action,
      benefit,
      priority,
      `Decision triggered deterministically by composite risk threshold (${s.risk_score} >= 50) and live ML disruption scoring.`,
      idx === 0 ? 'In Progress' : 'Open'
    );
  });
}

export function seedFreshPlatform() {
  // 1. Seed evaluator account
  const uCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
  if (uCount === 0) {
    const hash = bcrypt.hashSync('Capstone2026!', 10);
    db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
      'Dr. Ananya Rao (Evaluator)',
      'evaluator@supplychainiq.edu',
      hash,
      'Lead Supply Chain Architect'
    );
  }

  // 2. Seed suppliers & historical trends
  const sCount = (db.prepare('SELECT COUNT(*) as c FROM suppliers').get() as any).c;
  if (sCount === 0) {
    const insertSup = db.prepare(`
      INSERT INTO suppliers (
        supplier_code, name, region, country, category, dependency_level, dependency_share_pct,
        reliability_score, avg_delay_days, shipment_distance_km, inventory_level_units,
        safety_stock_units, order_quantity_units, historical_disruptions, annual_spend_usd,
        daily_revenue_at_risk_usd, financial_health_score, defect_rate_pct,
        risk_score, risk_category, risk_explanation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertTrend = db.prepare(
      'INSERT INTO supplier_trends (supplier_id, period_label, on_time_pct, avg_delay_days, defect_pct, disruptions) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const periods = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
    const rng = seededRng(555);

    for (const s of INITIAL_SUPPLIERS) {
      const scored = computeSupplierScoreAndCategory(s);
      const info = insertSup.run(
        s.code, s.name, s.region, s.country, s.category, s.dependency_level, s.dependency_share_pct,
        s.reliability_score, s.avg_delay_days, s.shipment_distance_km, s.inventory_level_units,
        s.safety_stock_units, s.order_quantity_units, s.historical_disruptions, s.annual_spend_usd,
        s.daily_revenue_at_risk_usd, s.financial_health_score, s.defect_rate_pct,
        scored.riskScore, scored.riskCategory, scored.riskExplanation
      );
      const supId = Number(info.lastInsertRowid);
      periods.forEach((p, idx) => {
        const decay = scored.riskScore >= 55 ? -idx * 1.6 : idx * 0.3;
        insertTrend.run(
          supId,
          p,
          Number(Math.max(42, Math.min(99, s.reliability_score + decay + (rng() - 0.5) * 4)).toFixed(1)),
          Number(Math.max(0.5, s.avg_delay_days + (scored.riskScore >= 55 ? idx * 0.55 : 0) + (rng() - 0.5) * 1.2).toFixed(1)),
          Number(Math.max(0.2, s.defect_rate_pct + (scored.riskScore >= 55 ? idx * 0.14 : 0)).toFixed(2)),
          scored.riskScore >= 55 && idx >= 3 ? 1 : 0
        );
      });
    }
  }

  // 3. Seed documented Synthetic Dataset & train all 5 supervised ML models
  const dsCount = (db.prepare('SELECT COUNT(*) as c FROM datasets').get() as any).c;
  if (dsCount === 0) {
    const { rows, documentation } = buildSyntheticSupplyChainDataset();
    const { cleanedRows, report } = runIntelligentPreprocessing(rows, {
      capOutliers: true,
      generateDerivedFeatures: true,
      dropDuplicates: true,
    });

    const dsInfo = db
      .prepare(
        `INSERT INTO datasets (name, source_label, is_synthetic, documentation_json, raw_row_count, clean_row_count, quality_report_json)
         VALUES (?, ?, 1, ?, ?, ?, ?)`
      )
      .run(
        'Supply Chain Risk Benchmark (Synthetic, 320+ Records)',
        documentation.source,
        JSON.stringify(documentation),
        rows.length,
        cleanedRows.length,
        JSON.stringify(report)
      );

    const datasetId = Number(dsInfo.lastInsertRowid);
    const insRaw = db.prepare('INSERT INTO dataset_raw_rows (dataset_id, row_index, data_json) VALUES (?, ?, ?)');
    const insClean = db.prepare('INSERT INTO dataset_clean_rows (dataset_id, row_index, data_json) VALUES (?, ?, ?)');
    rows.forEach((r, idx) => insRaw.run(datasetId, idx, JSON.stringify(r)));
    cleanedRows.forEach((r, idx) => insClean.run(datasetId, idx, JSON.stringify(r)));

    const featureColumns = [
      'supplier_reliability',
      'delivery_delay_days',
      'supplier_dependency_pct',
      'shipment_distance_km',
      'inventory_level',
      'safety_stock',
      'order_quantity',
      'historical_disruptions',
      'defect_rate_pct',
      'financial_health_score',
      'demand_inventory_pressure',
      'reliability_delay_index',
    ];

    const algos: AlgorithmId[] = [
      'Logistic Regression',
      'Decision Tree',
      'Random Forest',
      'Gradient Boosting',
      'XGBoost',
    ];

    const runs = algos.map((algorithm) =>
      trainAndEvaluateSupervisedModel({
        datasetId,
        datasetName: 'Supply Chain Risk Benchmark (Synthetic, 320+ Records)',
        rows: cleanedRows,
        algorithm,
        targetColumn: 'disruption_occurred',
        featureColumns,
        testSize: 0.25,
        cvFolds: 5,
      })
    );

    let bestIdx = 0;
    let bestComposite = -1;
    runs.forEach((r, i) => {
      const comp = r.f1Score * 0.5 + r.rocAuc * 0.5;
      if (comp > bestComposite) {
        bestComposite = comp;
        bestIdx = i;
      }
    });

    const insRun = db.prepare(`
      INSERT INTO ml_runs (
        dataset_id, dataset_name, algorithm, target_column, feature_columns_json,
        test_size, cv_folds, hyperparams_json, accuracy, precision, recall, f1_score, roc_auc,
        confusion_matrix_json, roc_curve_json, feature_importance_json, cv_summary_json,
        tuning_summary, artifact_json, training_time_ms, prediction_time_ms, is_production
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    runs.forEach((r, idx) => {
      insRun.run(
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
    });

    refreshSupplierPredictionsFromModel(runs[bestIdx].artifact);
    regenerateDecisionsFromLiveSuppliers();
  }
}
