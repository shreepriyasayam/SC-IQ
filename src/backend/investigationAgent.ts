import { GoogleGenAI } from '@google/genai';
import type { TrainedModelArtifact } from '../engine/contracts.ts';
import { explainPredictionFactors } from '../engine/mlModels.ts';
import { db } from './database.ts';

export interface InvestigationStep {
  stepNumber: number;
  title: string;
  status: 'completed';
  findings: string;
  evidenceData?: Record<string, string | number>;
}

export interface InvestigationReport {
  id?: number;
  supplierId: number;
  supplierName: string;
  workflowSteps: InvestigationStep[];
  summary: string;
  mitigationPlan: string[];
  engineUsed: string;
  createdAt?: string;
}

export async function runSupplierInvestigationAgent(supplierId: number): Promise<InvestigationReport> {
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId) as any;
  if (!supplier) {
    throw new Error('Supplier not found for investigation.');
  }

  // Step 1: Retrieve Supplier Profile
  const step1: InvestigationStep = {
    stepNumber: 1,
    title: 'Retrieve Supplier Profile & Spend Exposure',
    status: 'completed',
    findings: `${supplier.name} (${supplier.supplier_code}) operates from ${supplier.country} (${supplier.region}) supplying ${supplier.category}. Dependency is classified as ${supplier.dependency_level} (${supplier.dependency_share_pct}% category share, $${Number(supplier.annual_spend_usd).toLocaleString()} annual spend).`,
    evidenceData: {
      Code: supplier.supplier_code,
      Region: `${supplier.country} (${supplier.region})`,
      Dependency: `${supplier.dependency_share_pct}% (${supplier.dependency_level})`,
      AnnualSpend: `$${Number(supplier.annual_spend_usd).toLocaleString()}`,
    },
  };

  // Step 2: Analyse Historical Performance
  const trends = db
    .prepare('SELECT * FROM supplier_trends WHERE supplier_id = ? ORDER BY period_label ASC')
    .all(supplierId) as any[];
  const firstTrend = trends[0];
  const lastTrend = trends[trends.length - 1];
  const onTimeDelta =
    firstTrend && lastTrend ? Number((lastTrend.on_time_pct - firstTrend.on_time_pct).toFixed(1)) : 0;
  const delayDelta =
    firstTrend && lastTrend ? Number((lastTrend.avg_delay_days - firstTrend.avg_delay_days).toFixed(1)) : 0;

  const step2: InvestigationStep = {
    stepNumber: 2,
    title: 'Analyse Historical Delivery & Quality Trajectory',
    status: 'completed',
    findings:
      trends.length >= 2
        ? `Over the last ${trends.length} periods (${firstTrend.period_label} to ${lastTrend.period_label}), on-time fulfillment shifted by ${onTimeDelta >= 0 ? `+${onTimeDelta}` : onTimeDelta}% (to ${lastTrend.on_time_pct}%) while average delivery delay changed by ${delayDelta >= 0 ? `+${delayDelta}` : delayDelta} days (to ${lastTrend.avg_delay_days}d). Current defect rate stands at ${supplier.defect_rate_pct}%.`
        : `Current reliability score is ${supplier.reliability_score}% with ${supplier.avg_delay_days}d average delay and ${supplier.defect_rate_pct}% defect rate.`,
    evidenceData: {
      Reliability: `${supplier.reliability_score}%`,
      OnTimeDelta: `${onTimeDelta >= 0 ? '+' : ''}${onTimeDelta}%`,
      AvgDelay: `${supplier.avg_delay_days} days`,
      DefectRate: `${supplier.defect_rate_pct}%`,
    },
  };

  // Step 3: Examine Risk Factors via Active ML Model
  const prodRun = db
    .prepare('SELECT algorithm, artifact_json FROM ml_runs ORDER BY is_production DESC, id DESC LIMIT 1')
    .get() as any;

  let mlFactorsSummary = `Composite Risk Score: ${supplier.risk_score}/100 (${supplier.risk_category}).`;
  let topDriverNames: string[] = [];
  if (prodRun) {
    const artifact = JSON.parse(prodRun.artifact_json) as TrainedModelArtifact;
    const fMap: Record<string, number> = {
      supplier_reliability: supplier.reliability_score,
      delivery_delay_days: supplier.avg_delay_days,
      supplier_dependency_pct: supplier.dependency_share_pct,
      shipment_distance_km: supplier.shipment_distance_km,
      inventory_level: supplier.inventory_level_units,
      safety_stock: supplier.safety_stock_units,
      order_quantity: supplier.order_quantity_units,
      historical_disruptions: supplier.historical_disruptions,
      defect_rate_pct: supplier.defect_rate_pct,
      financial_health_score: supplier.financial_health_score,
      shipping_cost_usd: supplier.order_quantity_units * 1.3,
      demand_inventory_pressure: Number((supplier.order_quantity_units / Math.max(1, supplier.inventory_level_units)).toFixed(3)),
      reliability_delay_index: Number(((100 - supplier.reliability_score) * (1 + supplier.avg_delay_days / 10)).toFixed(2)),
    };
    const vec = artifact.featureNames.map((f) => fMap[f] ?? 0);
    const attributions = explainPredictionFactors(artifact, vec).slice(0, 4);
    topDriverNames = attributions.filter((a) => a.direction === 'increases_risk').map((a) => `${a.feature.replace(/_/g, ' ')} (${a.value})`);
    mlFactorsSummary = `Active ${prodRun.algorithm} estimates ${(supplier.disruption_prob * 100).toFixed(1)}% disruption probability. Top quantitative risk drivers: ${attributions
      .map((a) => `${a.feature} [${a.contribution >= 0 ? '+' : ''}${a.contribution.toFixed(3)}]`)
      .join(', ')}.`;
  }

  const step3: InvestigationStep = {
    stepNumber: 3,
    title: 'Examine ML Risk Drivers & Feature Attributions',
    status: 'completed',
    findings: mlFactorsSummary,
    evidenceData: {
      RiskScore: `${supplier.risk_score}/100`,
      DisruptionProb: `${(supplier.disruption_prob * 100).toFixed(1)}%`,
      MLModel: prodRun?.algorithm || 'Composite Risk Engine',
    },
  };

  // Step 4: Investigate Potential Disruption Causes
  const causes: string[] = [];
  if (supplier.reliability_score < 70) {
    causes.push(`Chronic fulfillment reliability shortfall (${supplier.reliability_score}%) indicating upstream capacity or scheduling bottlenecks.`);
  }
  if (supplier.avg_delay_days >= 7) {
    causes.push(`Extended transit/customs dwell time averaging ${supplier.avg_delay_days} days across a ${supplier.shipment_distance_km.toLocaleString()} km corridor.`);
  }
  if (supplier.inventory_level_units < supplier.safety_stock_units) {
    causes.push(`Inventory depletion (${supplier.inventory_level_units} units on hand vs. ${supplier.safety_stock_units} safety stock threshold) removes shock absorption.`);
  }
  if (supplier.historical_disruptions >= 3) {
    causes.push(`Repeated historical disruption pattern (${supplier.historical_disruptions} incidents in trailing 12 months).`);
  }
  if (supplier.financial_health_score < 65) {
    causes.push(`Sub-threshold financial health (${supplier.financial_health_score}/100) raising working-capital insolvency exposure.`);
  }
  if (causes.length === 0) {
    causes.push('No acute structural anomalies; primary exposure stems from routine transit lead-time variance.');
  }

  const step4: InvestigationStep = {
    stepNumber: 4,
    title: 'Investigate Potential Root Causes',
    status: 'completed',
    findings: causes.join(' '),
  };

  // Step 5: Estimate Consequences
  const estFinancialLoss = Math.round(
    supplier.annual_spend_usd * supplier.disruption_prob * (0.22 + 0.35 * (supplier.dependency_share_pct / 100))
  );
  const downtimeHours = Number(
    (supplier.avg_delay_days * 24 * (supplier.dependency_share_pct / 100) * Math.max(0.25, supplier.disruption_prob) * 1.4).toFixed(1)
  );
  const dailyBurn = Math.max(10, supplier.order_quantity_units / 30);
  const runwayDays = Number((supplier.inventory_level_units / dailyBurn).toFixed(1));

  const step5: InvestigationStep = {
    stepNumber: 5,
    title: 'Estimate Business & Operational Consequences',
    status: 'completed',
    findings: `Expected annual financial loss exposure is $${estFinancialLoss.toLocaleString()}, with projected assembly interruption of ${downtimeHours} hours. Current inventory provides ${runwayDays} days of operational runway before stockout.`,
    evidenceData: {
      ExpectedLoss: `$${estFinancialLoss.toLocaleString()}`,
      DowntimeHours: `${downtimeHours} hrs`,
      InventoryRunway: `${runwayDays} days`,
    },
  };

  // Step 6 & 7: Synthesize Summary & Mitigation Strategies (Grounded Gemini with Deterministic Fallback)
  const fallbackSummary = `Investigation of ${supplier.name} (${supplier.risk_category}, score ${supplier.risk_score}/100) confirms ${(supplier.disruption_prob * 100).toFixed(1)}% disruption probability driven by ${
    topDriverNames.length > 0 ? topDriverNames.join(', ') : 'delivery delay and reliability variance'
  }. With ${supplier.inventory_level_units} units on hand (${runwayDays} days runway) against a ${supplier.safety_stock_units}-unit safety target, an unmitigated disruption exposes $${estFinancialLoss.toLocaleString()} and ${downtimeHours} production hours.`;

  const fallbackMitigation = [
    supplier.dependency_share_pct >= 20
      ? `Diversify ${supplier.category} sourcing by qualifying an alternate supplier outside ${supplier.region} to reduce dependency below 18%.`
      : `Establish secondary standby allocation with a pre-qualified regional supplier.`,
    supplier.inventory_level_units < supplier.safety_stock_units
      ? `Issue an immediate buffer replenishment order of ${supplier.safety_stock_units - supplier.inventory_level_units + 300} units to restore safety stock.`
      : `Maintain dynamic 21-day safety stock buffer ahead of peak procurement cycles.`,
    `Implement weekly milestone telemetry reviews on shipments exceeding ${Math.max(4, Math.round(supplier.avg_delay_days * 0.7))} days transit delay.`,
  ];

  let summary = fallbackSummary;
  let mitigationPlan = fallbackMitigation;
  let engineUsed = 'Deterministic Evidence Synthesizer';

  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const promptPayload = {
        supplier: {
          name: supplier.name,
          code: supplier.supplier_code,
          country: supplier.country,
          region: supplier.region,
          category: supplier.category,
          riskScore: supplier.risk_score,
          riskCategory: supplier.risk_category,
          disruptionProbabilityPct: Number((supplier.disruption_prob * 100).toFixed(1)),
          reliabilityScore: supplier.reliability_score,
          avgDelayDays: supplier.avg_delay_days,
          inventoryUnits: supplier.inventory_level_units,
          safetyStockUnits: supplier.safety_stock_units,
          dependencySharePct: supplier.dependency_share_pct,
          historicalDisruptions: supplier.historical_disruptions,
          defectRatePct: supplier.defect_rate_pct,
        },
        computedImpact: {
          estimatedFinancialLossUsd: estFinancialLoss,
          estimatedDowntimeHours: downtimeHours,
          inventoryRunwayDays: runwayDays,
        },
        retrievedSteps: [step1.findings, step2.findings, step3.findings, step4.findings, step5.findings],
      };

      const resp = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Generate a concise JSON object with keys "summary" (2-3 sentence executive investigation summary) and "mitigationPlan" (array of 3 specific, concrete action strings). STRICTLY cite ONLY facts and figures from this verified investigation payload—do NOT invent any numbers, suppliers, or dates:\n${JSON.stringify(promptPayload)}`,
        config: {
          systemInstruction:
            'You are a supply chain risk investigation agent. Output valid JSON strictly grounded in the provided telemetry.',
          responseMimeType: 'application/json',
        },
      });
      if (resp.text) {
        const parsed = JSON.parse(resp.text);
        if (typeof parsed.summary === 'string' && Array.isArray(parsed.mitigationPlan)) {
          summary = parsed.summary;
          mitigationPlan = parsed.mitigationPlan.slice(0, 4).map(String);
          engineUsed = 'Gemini 4 Hydrogen (Grounded Investigation Agent)';
        }
      }
    } catch {
      // Gracefully keep deterministic grounded synthesis if API quota/key fails
    }
  }

  const step6: InvestigationStep = {
    stepNumber: 6,
    title: 'Generate Grounded Investigation Summary',
    status: 'completed',
    findings: summary,
  };

  const step7: InvestigationStep = {
    stepNumber: 7,
    title: 'Recommend Prioritized Mitigation Strategies',
    status: 'completed',
    findings: mitigationPlan.join(' | '),
  };

  const workflowSteps = [step1, step2, step3, step4, step5, step6, step7];

  const ins = db
    .prepare(
      'INSERT INTO investigations (supplier_id, supplier_name, workflow_steps_json, summary, mitigation_plan_json, engine_used) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      supplier.id,
      supplier.name,
      JSON.stringify(workflowSteps),
      summary,
      JSON.stringify(mitigationPlan),
      engineUsed
    );

  return {
    id: Number(ins.lastInsertRowid),
    supplierId: supplier.id,
    supplierName: supplier.name,
    workflowSteps,
    summary,
    mitigationPlan,
    engineUsed,
  };
}
