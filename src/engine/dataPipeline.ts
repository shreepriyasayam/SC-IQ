import type {
  BeforeAfterComparison,
  ColumnValidationProfile,
  DataQualityReport,
} from './contracts.ts';

function isNullish(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));
}

export function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.trim().replace(/[$,%]/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export interface PreprocessOptions {
  capOutliers?: boolean;
  generateDerivedFeatures?: boolean;
  addDerivedFeatures?: boolean;
  dropDuplicates?: boolean;
  deduplicate?: boolean;
  imputeMissing?: boolean;
}

/**
 * Non-destructive preprocessing pipeline:
 * Accepts raw uploaded rows, clones them, performs cleaning/imputation/outlier capping/feature engineering,
 * and returns both the cleaned dataset and a detailed before-and-after DataQualityReport.
 */
export function runIntelligentPreprocessing(
  rawRows: Record<string, unknown>[],
  options: PreprocessOptions = {}
): {
  cleanedRows: Record<string, unknown>[];
  report: DataQualityReport;
} {
  const capOutliers = options.capOutliers ?? true;
  const generateDerived = options.generateDerivedFeatures ?? options.addDerivedFeatures ?? true;
  const dropDuplicates = options.dropDuplicates ?? options.deduplicate ?? true;
  const imputeMissing = options.imputeMissing ?? true;

  if (!rawRows || rawRows.length === 0) {
    throw new Error('Dataset contains zero rows.');
  }

  const rawCols = Array.from(new Set(rawRows.flatMap((r) => Object.keys(r))));
  let workingRows = rawRows.map((r) => ({ ...r }));

  // 1. Exact duplicate detection
  let duplicatesRemoved = 0;
  if (dropDuplicates) {
    const seen = new Set<string>();
    const deduped: Record<string, unknown>[] = [];
    for (const r of workingRows) {
      const sig = JSON.stringify(rawCols.map((c) => r[c] ?? null));
      if (seen.has(sig)) duplicatesRemoved++;
      else {
        seen.add(sig);
        deduped.push(r);
      }
    }
    workingRows = deduped;
  }

  let totalMissingDetected = 0;
  let totalMissingImputed = 0;
  let totalOutliersDetected = 0;
  let totalOutliersCapped = 0;

  const profiles: ColumnValidationProfile[] = [];
  const validTargetColumns: string[] = [];
  const selectableFeatures: string[] = [];
  const excludedLeakageColumns: string[] = [];

  for (const col of rawCols) {
    const rawMissingCount = rawRows.filter((r) => isNullish(r[col])).length;
    totalMissingDetected += rawMissingCount;

    const nonNull = workingRows.map((r) => r[col]).filter((v) => !isNullish(v));
    const parsedNums = nonNull.map(toFiniteNumber).filter((v): v is number => v !== null);
    const isNumeric = nonNull.length > 0 && parsedNums.length / nonNull.length >= 0.85;

    if (isNumeric && parsedNums.length > 0) {
      const sorted = [...parsedNums].sort((a, b) => a - b);
      const n = sorted.length;
      const median = n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
      const q1 = sorted[Math.floor(n * 0.25)] ?? sorted[0];
      const q3 = sorted[Math.floor(n * 0.75)] ?? sorted[n - 1];
      const iqr = q3 - q1;
      const lowerFence = q1 - 1.5 * iqr;
      const upperFence = q3 + 1.5 * iqr;

      const uniqueNums = new Set(parsedNums);
      const isBinary =
        uniqueNums.size === 2 &&
        Array.from(uniqueNums).every((v) => v === 0 || v === 1);

      let outlierCount = 0;
      for (const row of workingRows) {
        const val = toFiniteNumber(row[col]);
        if (val === null) {
          if (imputeMissing) {
            row[col] = Number(median.toFixed(4));
            totalMissingImputed++;
          } else {
            row[col] = null;
          }
        } else if (!isBinary && iqr > 0 && (val < lowerFence || val > upperFence)) {
          outlierCount++;
          if (capOutliers) {
            const capped = Math.max(lowerFence, Math.min(upperFence, val));
            row[col] = Number(capped.toFixed(4));
            totalOutliersCapped++;
          } else {
            row[col] = val;
          }
        } else {
          row[col] = val;
        }
      }
      totalOutliersDetected += outlierCount;

      const finalNums = workingRows.map((r) => toFiniteNumber(r[col])).filter((v): v is number => v !== null);
      const mean = finalNums.reduce((a, b) => a + b, 0) / finalNums.length;
      const std = Math.sqrt(
        finalNums.reduce((a, b) => a + (b - mean) ** 2, 0) / finalNums.length
      );
      const min = Math.min(...finalNums);
      const max = Math.max(...finalNums);

      const lowerName = col.toLowerCase();
      const isTargetCandidate =
        isBinary ||
        lowerName.includes('disruption') ||
        lowerName.includes('delayed') ||
        lowerName.includes('failure') ||
        lowerName === 'target' ||
        lowerName === 'label';

      if (isBinary) {
        validTargetColumns.push(col);
      }

      const isIdOrLeakage =
        lowerName === 'id' ||
        lowerName.endsWith('_id') ||
        lowerName === 'record_id' ||
        lowerName === 'order_date';

      if (isIdOrLeakage) {
        excludedLeakageColumns.push(col);
      } else if (uniqueNums.size > 1 && !isBinary) {
        selectableFeatures.push(col);
      }

      profiles.push({
        name: col,
        inferredType: isBinary ? 'binary_target' : 'numeric',
        rawMissingCount,
        cleanedMissingCount: 0,
        uniqueCount: new Set(finalNums).size,
        outlierCount,
        mean: Number(mean.toFixed(3)),
        std: Number(std.toFixed(3)),
        median: Number(median.toFixed(3)),
        q1: Number(q1.toFixed(3)),
        q3: Number(q3.toFixed(3)),
        min: Number(min.toFixed(3)),
        max: Number(max.toFixed(3)),
        isTargetCandidate,
      });
    } else {
      // Categorical column
      const freq = new Map<string, number>();
      for (const v of nonNull) {
        const s = String(v).trim();
        freq.set(s, (freq.get(s) ?? 0) + 1);
      }
      let mode = 'Unknown';
      let bestCount = -1;
      for (const [k, c] of freq.entries()) {
        if (c > bestCount) {
          bestCount = c;
          mode = k;
        }
      }

      for (const row of workingRows) {
        if (isNullish(row[col])) {
          row[col] = mode;
          totalMissingImputed++;
        } else {
          row[col] = String(row[col]).trim();
        }
      }

      const uniqueCount = new Set(workingRows.map((r) => String(r[col]))).size;
      const lowerName = col.toLowerCase();
      const isIdOrHighCard =
        lowerName === 'id' ||
        lowerName.endsWith('_id') ||
        lowerName.includes('name') ||
        lowerName.includes('date') ||
        uniqueCount > Math.max(25, workingRows.length * 0.6);

      if (isIdOrHighCard) {
        excludedLeakageColumns.push(col);
      } else if (uniqueCount === 2) {
        validTargetColumns.push(col);
      } else if (uniqueCount > 1) {
        selectableFeatures.push(col);
      }

      profiles.push({
        name: col,
        inferredType: 'categorical',
        rawMissingCount,
        cleanedMissingCount: 0,
        uniqueCount,
        outlierCount: 0,
        mode,
        isTargetCandidate: uniqueCount === 2,
      });
    }
  }

  // 2. Derived feature engineering (transparently marked)
  const derivedFeaturesAdded: string[] = [];
  if (generateDerived) {
    const colSet = new Set(rawCols);
    if (colSet.has('order_quantity') && colSet.has('inventory_level')) {
      const name = 'demand_inventory_pressure';
      for (const r of workingRows) {
        const qty = Number(r.order_quantity || 0);
        const inv = Math.max(1, Number(r.inventory_level || 1));
        r[name] = Number((qty / inv).toFixed(3));
      }
      derivedFeaturesAdded.push(name);
      selectableFeatures.push(name);
    }
    if (colSet.has('delivery_delay_days') && colSet.has('supplier_reliability')) {
      const name = 'reliability_delay_index';
      for (const r of workingRows) {
        const rel = Number(r.supplier_reliability || 80);
        const del = Math.max(0, Number(r.delivery_delay_days || 0));
        r[name] = Number(((100 - rel) * (1 + del / 10)).toFixed(2));
      }
      derivedFeaturesAdded.push(name);
      selectableFeatures.push(name);
    }
    if (colSet.has('shipment_distance_km') && colSet.has('shipping_cost_usd')) {
      const name = 'freight_cost_per_100km';
      for (const r of workingRows) {
        const dist = Math.max(10, Number(r.shipment_distance_km || 100));
        const cost = Number(r.shipping_cost_usd || 0);
        r[name] = Number(((cost / dist) * 100).toFixed(2));
      }
      derivedFeaturesAdded.push(name);
      selectableFeatures.push(name);
    }

    for (const df of derivedFeaturesAdded) {
      const vals = workingRows.map((r) => Number(r[df]));
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
      profiles.push({
        name: df,
        inferredType: 'numeric',
        rawMissingCount: 0,
        cleanedMissingCount: 0,
        uniqueCount: new Set(vals).size,
        outlierCount: 0,
        mean: Number(mean.toFixed(3)),
        std: Number(std.toFixed(3)),
        min: Number(Math.min(...vals).toFixed(3)),
        max: Number(Math.max(...vals).toFixed(3)),
        isDerived: true,
      });
    }
  }

  const cleanedColumns = rawCols.length + derivedFeaturesAdded.length;

  const beforeAfter: BeforeAfterComparison[] = [
    {
      metric: 'Record Count',
      before: rawRows.length,
      after: workingRows.length,
      note: duplicatesRemoved > 0 ? `${duplicatesRemoved} exact duplicate rows removed` : 'No duplicate records found',
    },
    {
      metric: 'Missing Cells',
      before: totalMissingDetected,
      after: 0,
      note: totalMissingImputed > 0 ? `${totalMissingImputed} cells imputed (median/mode)` : 'Complete feature coverage',
    },
    {
      metric: 'IQR Outliers (>1.5×IQR)',
      before: totalOutliersDetected,
      after: capOutliers ? 0 : totalOutliersDetected,
      note: capOutliers ? `${totalOutliersCapped} extreme values Winsorized to IQR fences` : 'Outliers retained per configuration',
    },
    {
      metric: 'Feature Columns',
      before: rawCols.length,
      after: cleanedColumns,
      note: derivedFeaturesAdded.length > 0 ? `Engineered: ${derivedFeaturesAdded.join(', ')}` : 'No derived features added',
    },
  ];

  const report: DataQualityReport = {
    originalRows: rawRows.length,
    cleanedRows: workingRows.length,
    originalColumns: rawCols.length,
    cleanedColumns,
    duplicatesRemoved,
    missingValuesDetected: totalMissingDetected,
    missingValuesImputed: totalMissingImputed,
    outliersDetected: totalOutliersDetected,
    outliersCapped: totalOutliersCapped,
    derivedFeaturesAdded,
    validTargetColumns,
    selectableFeatures,
    excludedLeakageColumns,
    columnProfiles: profiles,
    beforeAfter,
  };

  return { cleanedRows: workingRows, report };
}
