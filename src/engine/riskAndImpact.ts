import type { TrainedModelArtifact } from './contracts.ts';
import { predictProbability } from './mlModels.ts';

export interface SupplierRecord {
  id: number;
  supplier_code: string;
  name: string;
  region: string;
  country: string;
  category: string;
  dependency_level: string;
  dependency_share_pct: number;
  reliability_score: number;
  avg_delay_days: number;
  shipment_distance_km: number;
  inventory_level_units: number;
  safety_stock_units: number;
  order_quantity_units: number;
  historical_disruptions: number;
  annual_spend_usd: number;
  daily_revenue_at_risk_usd: number;
  financial_health_score: number;
  defect_rate_pct: number;
  risk_score: number;
  risk_category: string;
  risk_explanation: string;
  disruption_prob: number;
  delay_prob: number;
  shortage_prob: number;
}

export interface BusinessImpactReport {
  totalFinancialExposureUsd: number;
  estimatedProductionLossHours: number;
  avgInventoryShortageDays: number;
  expectedProcurementCostSurgeUsd: number;
  dependencyConcentrationIndex: number;
  topImpactedSuppliers: {
    supplierId: number;
    name: string;
    region: string;
    dependencySharePct: number;
    disruptionProb: number;
    estimatedLossUsd: number;
    productionDowntimeHours: number;
    shortageDays: number;
    procurementImpactUsd: number;
  }[];
  formulasAndAssumptions: {
    metric: string;
    formula: string;
    assumption: string;
  }[];
}

export function calculateBusinessImpact(suppliers: SupplierRecord[]): BusinessImpactReport {
  const topImpacted = suppliers.map((s) => {
    const depWeight = Math.max(0.1, s.dependency_share_pct / 100);
    // 1. Estimated Financial Loss = Annual Spend * Disruption Probability * (0.22 margin & penalty + 0.35 * dependencyWeight)
    const lossFactor = 0.22 + 0.35 * depWeight;
    const estimatedLossUsd = Math.round(s.annual_spend_usd * s.disruption_prob * lossFactor);

    // 2. Production Interruption Hours = Avg Delay Days * 24h * Dependency Weight * Disruption Probability * 1.4
    const productionDowntimeHours = Number(
      (s.avg_delay_days * 24 * depWeight * Math.max(0.25, s.disruption_prob) * 1.4).toFixed(1)
    );

    // 3. Inventory Shortage Days = max(0, (Safety Stock - Inventory Level) / Daily Consumption + Avg Delay * Disruption Prob)
    const dailyConsumption = Math.max(10, s.order_quantity_units / 30);
    const bufferDeficitDays = Math.max(0, (s.safety_stock_units - s.inventory_level_units) / dailyConsumption);
    const shortageDays = Number((bufferDeficitDays + s.avg_delay_days * s.disruption_prob).toFixed(1));

    // 4. Procurement Spot-Buy & Expedite Surge = Annual Spend * Disruption Prob * 0.14
    const procurementImpactUsd = Math.round(s.annual_spend_usd * s.disruption_prob * 0.14);

    return {
      supplierId: s.id,
      name: s.name,
      region: s.region,
      dependencySharePct: s.dependency_share_pct,
      disruptionProb: s.disruption_prob,
      estimatedLossUsd,
      productionDowntimeHours,
      shortageDays,
      procurementImpactUsd,
    };
  });

  const totalFinancialExposureUsd = topImpacted.reduce((a, b) => a + b.estimatedLossUsd, 0);
  const estimatedProductionLossHours = Number(
    topImpacted.reduce((a, b) => a + b.productionDowntimeHours, 0).toFixed(1)
  );
  const avgInventoryShortageDays = Number(
    (topImpacted.reduce((a, b) => a + b.shortageDays, 0) / (topImpacted.length || 1)).toFixed(1)
  );
  const expectedProcurementCostSurgeUsd = topImpacted.reduce((a, b) => a + b.procurementImpactUsd, 0);

  // Herfindahl-style supplier spend concentration index (0-10000)
  const totalSpend = suppliers.reduce((a, s) => a + s.annual_spend_usd, 0) || 1;
  const hhi = Math.round(
    suppliers.reduce((acc, s) => acc + ((s.annual_spend_usd / totalSpend) * 100) ** 2, 0)
  );

  return {
    totalFinancialExposureUsd,
    estimatedProductionLossHours,
    avgInventoryShortageDays,
    expectedProcurementCostSurgeUsd,
    dependencyConcentrationIndex: hhi,
    topImpactedSuppliers: topImpacted.sort((a, b) => b.estimatedLossUsd - a.estimatedLossUsd),
    formulasAndAssumptions: [
      {
        metric: 'Estimated Financial Loss',
        formula: 'Annual Spend × Disruption Prob × (0.22 + 0.35 × Dependency Share)',
        assumption: 'Assumes 22% baseline margin/SLA penalty exposure amplified by up to 35% for single-source dependencies.',
      },
      {
        metric: 'Production Interruption',
        formula: 'Avg Delay (Days) × 24h × Dependency Share × Disruption Prob × 1.4',
        assumption: 'Models downstream assembly line stoppage sensitivity with a 1.4x cascading buffer factor.',
      },
      {
        metric: 'Inventory Shortage Runway',
        formula: 'max(0, (Safety Stock − Inventory) / Daily Burn) + (Avg Delay × Disruption Prob)',
        assumption: 'Assumes daily consumption equals Order Quantity / 30 days.',
      },
      {
        metric: 'Procurement Expedite Impact',
        formula: 'Annual Spend × Disruption Prob × 14% Spot-Freight Premium',
        assumption: 'Captures emergency air-freight switching and spot-market sourcing premiums during disruptions.',
      },
      {
        metric: 'Dependency Concentration (HHI)',
        formula: 'Σ (Supplier Spend Share %)²',
        assumption: 'Standard Herfindahl-Hirschman concentration index; >1,800 indicates concentrated sourcing risk.',
      },
    ],
  };
}

export type ScenarioPresetType =
  | 'supplier_fails'
  | 'delay_increases'
  | 'reliability_drops'
  | 'inventory_below_safety'
  | 'alternative_supplier';

export interface DeterministicSimulationOutput {
  scenarioType: ScenarioPresetType;
  title: string;
  targetSupplierName: string;
  current: {
    riskScore: number;
    disruptionProbPct: number;
    financialExposureUsd: number;
    downtimeHours: number;
    shortageDays: number;
  };
  simulated: {
    riskScore: number;
    disruptionProbPct: number;
    financialExposureUsd: number;
    downtimeHours: number;
    shortageDays: number;
  };
  deltaRiskScore: number;
  deltaFinancialUsd: number;
  operationalConsequences: string[];
  recommendedDecision: string;
  calculationTrace: string[];
}

export function runDeterministicSimulation(params: {
  scenarioType: ScenarioPresetType;
  supplier: SupplierRecord;
  alternativeSupplier?: SupplierRecord | null;
  delayIncreaseDays?: number;
  reliabilityDropPts?: number;
  inventoryDropPct?: number;
  modelArtifact?: TrainedModelArtifact | null;
}): DeterministicSimulationOutput {
  const s = params.supplier;
  const currentExposure = Math.round(
    s.annual_spend_usd * s.disruption_prob * (0.22 + 0.35 * (s.dependency_share_pct / 100))
  );
  const currentDowntime = Number(
    (s.avg_delay_days * 24 * (s.dependency_share_pct / 100) * Math.max(0.25, s.disruption_prob) * 1.4).toFixed(1)
  );
  const dailyBurn = Math.max(10, s.order_quantity_units / 30);
  const currentShortage = Number(
    (
      Math.max(0, (s.safety_stock_units - s.inventory_level_units) / dailyBurn) +
      s.avg_delay_days * s.disruption_prob
    ).toFixed(1)
  );

  let simReliability = s.reliability_score;
  let simDelay = s.avg_delay_days;
  let simInventory = s.inventory_level_units;
  let simDisruptions = s.historical_disruptions;
  let simSpend = s.annual_spend_usd;
  let simDep = s.dependency_share_pct;
  let title = '';
  const trace: string[] = [];
  const consequences: string[] = [];
  let recommendedDecision = '';

  if (params.scenarioType === 'supplier_fails') {
    title = `Full Supplier Outage: ${s.name}`;
    simReliability = 15;
    simDelay = s.avg_delay_days + 21;
    simDisruptions = s.historical_disruptions + 3;
    trace.push(`Outage forces effective reliability to 15% and adds +21d emergency re-qualification lead time.`);
    consequences.push(`Immediate halt on ${s.category} deliveries (${s.dependency_share_pct}% dependency share).`);
    consequences.push(`Existing ${s.inventory_level_units}-unit stock covers only ${(s.inventory_level_units / dailyBurn).toFixed(1)} days of production.`);
    recommendedDecision = `Activate emergency backup qualification in a non-${s.region} corridor and issue spot-buy allocation for 14 days of buffer coverage.`;
  } else if (params.scenarioType === 'delay_increases') {
    const addDays = params.delayIncreaseDays ?? 8;
    title = `Delivery Delay Escalation (+${addDays} Days): ${s.name}`;
    simDelay = s.avg_delay_days + addDays;
    simReliability = Math.max(25, s.reliability_score - addDays * 1.8);
    trace.push(`Added +${addDays}d transit delay -> new avg delay ${simDelay.toFixed(1)}d; reliability adjusted by -${(addDays * 1.8).toFixed(1)} pts.`);
    consequences.push(`Safety stock cushion erodes as replenishment cycle extends by ${addDays} days.`);
    consequences.push(`Expedited freight surcharges triggered on time-critical orders.`);
    recommendedDecision = `Pre-position ${Math.ceil(addDays * dailyBurn)} additional safety-stock units and shift urgent orders to air/rail express.`;
  } else if (params.scenarioType === 'reliability_drops') {
    const drop = params.reliabilityDropPts ?? 18;
    title = `Supplier Reliability Decay (-${drop} pts): ${s.name}`;
    simReliability = Math.max(20, s.reliability_score - drop);
    simDelay = s.avg_delay_days + drop * 0.25;
    trace.push(`Reliability lowered from ${s.reliability_score}% to ${simReliability.toFixed(1)}%, adding +${(drop * 0.25).toFixed(1)}d expected variance delay.`);
    consequences.push(`Increased incoming QA inspection failures and schedule rescheduling overhead.`);
    recommendedDecision = `Place ${s.name} under corrective SLA review and cap order allocation below 40% of category demand.`;
  } else if (params.scenarioType === 'inventory_below_safety') {
    const dropPct = params.inventoryDropPct ?? 45;
    title = `Safety-Stock Breach (-${dropPct}% Inventory): ${s.name}`;
    simInventory = Math.round(s.inventory_level_units * (1 - dropPct / 100));
    trace.push(`On-hand stock dropped from ${s.inventory_level_units} to ${simInventory} units (below ${s.safety_stock_units} safety threshold).`);
    consequences.push(`Stockout deficit of ${Math.max(0, s.safety_stock_units - simInventory)} units leaves zero buffer against transit variance.`);
    recommendedDecision = `Trigger immediate replenishment PO of ${Math.max(200, s.safety_stock_units - simInventory + Math.round(dailyBurn * 7))} units.`;
  } else {
    const alt = params.alternativeSupplier;
    title = alt
      ? `Switch Volume to Alternative Supplier: ${alt.name}`
      : `Dual-Source Rebalance from ${s.name}`;
    if (alt) {
      simReliability = alt.reliability_score;
      simDelay = alt.avg_delay_days;
      simInventory = alt.inventory_level_units;
      simDisruptions = alt.historical_disruptions;
      simDep = Math.max(10, Math.round(s.dependency_share_pct * 0.45));
      simSpend = s.annual_spend_usd * 1.04; // modest switching premium
      trace.push(`Evaluated replacement metrics from ${alt.name} (Reliability ${alt.reliability_score}%, Delay ${alt.avg_delay_days}d) with 4% transition cost.`);
    } else {
      simReliability = Math.min(96, s.reliability_score + 16);
      simDelay = Math.max(2, s.avg_delay_days * 0.55);
      simDep = Math.max(12, Math.round(s.dependency_share_pct * 0.5));
      trace.push(`Modeled 50% volume transfer to higher-reliability Tier-1 backup (delay -45%, dependency halved).`);
    }
    consequences.push(`Reduces single-node exposure while keeping transition cost within 4% of baseline spend.`);
    recommendedDecision = `Execute phased 60/40 dual-sourcing transition over the next two procurement cycles.`;
  }

  // Evaluate simulated disruption probability using real ML artifact when available
  let simDisruptionProb = s.disruption_prob;
  if (params.scenarioType === 'supplier_fails') {
    simDisruptionProb = 0.98;
  } else if (params.modelArtifact) {
    const fMap: Record<string, number> = {
      supplier_reliability: simReliability,
      delivery_delay_days: simDelay,
      supplier_dependency_pct: simDep,
      shipment_distance_km: s.shipment_distance_km,
      inventory_level: simInventory,
      order_quantity: s.order_quantity_units,
      historical_disruptions: simDisruptions,
      defect_rate_pct: s.defect_rate_pct,
      financial_health_score: s.financial_health_score,
      safety_stock: s.safety_stock_units,
      demand_inventory_pressure: Number((s.order_quantity_units / Math.max(1, simInventory)).toFixed(3)),
      reliability_delay_index: Number(((100 - simReliability) * (1 + simDelay / 10)).toFixed(2)),
    };
    const vec = params.modelArtifact.featureNames.map((f) => fMap[f] ?? 0);
    simDisruptionProb = Number(Math.max(0.03, Math.min(0.97, predictProbability(params.modelArtifact, vec))).toFixed(4));
    trace.push(`Re-scored feature vector via active ${params.modelArtifact.algorithm} classifier -> ${(simDisruptionProb * 100).toFixed(1)}% probability.`);
  } else {
    const riskShift = (s.reliability_score - simReliability) * 0.012 + (simDelay - s.avg_delay_days) * 0.02;
    simDisruptionProb = Number(Math.max(0.04, Math.min(0.96, s.disruption_prob + riskShift)).toFixed(4));
  }

  const simRiskScore = Number(
    Math.max(
      5,
      Math.min(
        99,
        (100 - simReliability) * 0.42 +
          simDelay * 1.7 +
          simDisruptions * 4.5 +
          (simInventory < s.safety_stock_units ? 14 : 0) +
          simDep * 0.25
      )
    ).toFixed(1)
  );

  const simExposure =
    params.scenarioType === 'supplier_fails'
      ? Math.round(simSpend * 0.62)
      : Math.round(simSpend * simDisruptionProb * (0.22 + 0.35 * (simDep / 100)));

  const simDowntime = Number(
    (simDelay * 24 * (simDep / 100) * Math.max(0.25, simDisruptionProb) * 1.4).toFixed(1)
  );
  const simShortage = Number(
    (
      Math.max(0, (s.safety_stock_units - simInventory) / dailyBurn) +
      simDelay * simDisruptionProb
    ).toFixed(1)
  );

  return {
    scenarioType: params.scenarioType,
    title,
    targetSupplierName: s.name,
    current: {
      riskScore: s.risk_score,
      disruptionProbPct: Number((s.disruption_prob * 100).toFixed(1)),
      financialExposureUsd: currentExposure,
      downtimeHours: currentDowntime,
      shortageDays: currentShortage,
    },
    simulated: {
      riskScore: simRiskScore,
      disruptionProbPct: Number((simDisruptionProb * 100).toFixed(1)),
      financialExposureUsd: simExposure,
      downtimeHours: simDowntime,
      shortageDays: simShortage,
    },
    deltaRiskScore: Number((simRiskScore - s.risk_score).toFixed(1)),
    deltaFinancialUsd: simExposure - currentExposure,
    operationalConsequences: consequences,
    recommendedDecision,
    calculationTrace: trace,
  };
}
