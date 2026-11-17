import type {
  AlgorithmId,
  ConfusionMatrixData,
  CrossValidationSummary,
  FeatureImportanceItem,
  ModelExperimentRecord,
  RocPoint,
  TrainedModelArtifact,
  TreeNodeSerialized,
} from './contracts.ts';
import { toFiniteNumber } from './dataPipeline.ts';

export function seededRng(seed = 2026): () => number {
  let s = seed >>> 0;
  return () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sigmoid(z: number): number {
  const c = Math.max(-30, Math.min(30, z));
  return 1 / (1 + Math.exp(-c));
}

function normalizeImportanceList(names: string[], scores: number[]): FeatureImportanceItem[] {
  const sum = scores.reduce((a, b) => a + Math.abs(b), 0) || 1;
  return names
    .map((feature, idx) => ({
      feature,
      importance: Number((Math.abs(scores[idx]) / sum).toFixed(4)),
    }))
    .sort((a, b) => b.importance - a.importance);
}

/**
 * Strictly validates that the chosen target variable is a genuine labelled binary target
 * (never allows silent training on missing or constant targets).
 */
export function buildFeatureMatrixAndValidateTarget(
  rows: Record<string, unknown>[],
  targetColumn: string,
  requestedFeatures: string[]
): {
  XRaw: number[][];
  y: number[];
  featureNames: string[];
} {
  if (!targetColumn) {
    throw new Error('A labelled target variable is required for supervised ML training.');
  }

  // Prevent data leakage by blocking target itself and any sibling targets or IDs
  const leakageSet = new Set([
    targetColumn.toLowerCase(),
    'disruption_occurred',
    'delivery_delayed',
    'supplier_failure',
    'record_id',
    'supplier_id',
    'id',
  ]);
  leakageSet.add(targetColumn.toLowerCase());

  const candidateFeatures = requestedFeatures.filter(
    (f) => !leakageSet.has(f.toLowerCase())
  );

  if (candidateFeatures.length === 0) {
    throw new Error('Select at least one valid input feature distinct from target/ID columns.');
  }

  // Encode categorical features deterministically & parse numeric features
  const featureEncoders = new Map<string, Map<string, number>>();
  for (const feat of candidateFeatures) {
    const sampleNums = rows.map((r) => toFiniteNumber(r[feat])).filter((v) => v !== null);
    if (sampleNums.length < rows.length * 0.8) {
      const uniqueStrs = Array.from(new Set(rows.map((r) => String(r[feat] ?? 'Unknown')))).sort();
      const map = new Map<string, number>();
      uniqueStrs.forEach((s, i) => map.set(s, i));
      featureEncoders.set(feat, map);
    }
  }

  // Validate target variable has >=2 classes
  const y: number[] = [];
  const rawTargetValues = rows.map((r) => r[targetColumn]);
  const numericTargets = rawTargetValues.map(toFiniteNumber);
  const allNumeric = numericTargets.every((v) => v !== null);

  if (allNumeric) {
    const distinct = new Set(numericTargets as number[]);
    if (distinct.size < 2) {
      throw new Error(
        `Target column "${targetColumn}" contains only 1 unique value (${Array.from(distinct)[0]}). Supervised classification requires at least 2 distinct classes.`
      );
    }
    const maxVal = Math.max(...(numericTargets as number[]));
    const minVal = Math.min(...(numericTargets as number[]));
    const isZeroOne = distinct.size === 2 && minVal === 0 && maxVal === 1;
    if (!isZeroOne) {
      throw new Error(
        `Target column "${targetColumn}" is not binary (0/1). Please select a valid labelled binary risk target such as disruption_occurred, delivery_delayed, or supplier_failure.`
      );
    }
    for (const v of numericTargets as number[]) y.push(v);
  } else {
    const distinctStr = Array.from(new Set(rawTargetValues.map((v) => String(v ?? '').trim()))).filter(Boolean);
    if (distinctStr.length !== 2) {
      throw new Error(
        `Target column "${targetColumn}" has ${distinctStr.length} classes; binary classification requires exactly 2 labelled classes.`
      );
    }
    const posWords = new Set(['1', 'true', 'yes', 'high', 'disrupted', 'delayed', 'failed']);
    for (const val of rawTargetValues) {
      const s = String(val ?? '').trim().toLowerCase();
      y.push(posWords.has(s) ? 1 : s === distinctStr[1].toLowerCase() ? 1 : 0);
    }
  }

  const XRaw: number[][] = rows.map((r) =>
    candidateFeatures.map((feat) => {
      const enc = featureEncoders.get(feat);
      if (enc) {
        return enc.get(String(r[feat] ?? 'Unknown')) ?? 0;
      }
      return toFiniteNumber(r[feat]) ?? 0;
    })
  );

  return { XRaw, y, featureNames: candidateFeatures };
}

/**
 * Fits standardization parameters ONLY on training rows to prevent train-test data leakage.
 */
function fitAndTransformTrainTest(
  XTrainRaw: number[][],
  XTestRaw: number[][]
): { XTrain: number[][]; XTest: number[][]; means: number[]; stds: number[] } {
  const p = XTrainRaw[0].length;
  const n = XTrainRaw.length || 1;
  const means = new Array(p).fill(0);
  const stds = new Array(p).fill(1);

  for (let j = 0; j < p; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += XTrainRaw[i][j];
    means[j] = sum / n;

    let sq = 0;
    for (let i = 0; i < n; i++) sq += (XTrainRaw[i][j] - means[j]) ** 2;
    const s = Math.sqrt(sq / n);
    stds[j] = s > 1e-8 ? s : 1;
  }

  const transform = (mat: number[][]) =>
    mat.map((row) => row.map((v, j) => (v - means[j]) / stds[j]));

  return {
    XTrain: transform(XTrainRaw),
    XTest: transform(XTestRaw),
    means,
    stds,
  };
}

// ============================================================================
// TREE / ENSEMBLE TRAINING PRIMITIVES
// ============================================================================
function gini(labels: number[]): number {
  if (labels.length === 0) return 0;
  let ones = 0;
  for (const l of labels) if (l >= 0.5) ones++;
  const p1 = ones / labels.length;
  const p0 = 1 - p1;
  return 1 - p1 * p1 - p0 * p0;
}

function buildGiniTree(
  X: number[][],
  y: number[],
  indices: number[],
  depth: number,
  maxDepth: number,
  minSamplesSplit: number,
  subsampleFeatures: number | null,
  importances: number[],
  rng: () => number
): TreeNodeSerialized {
  const n = indices.length;
  const vals = indices.map((i) => y[i]);
  const mean = vals.reduce((a, b) => a + b, 0) / (n || 1);

  if (depth >= maxDepth || n < minSamplesSplit) {
    return { isLeaf: true, value: Number(mean.toFixed(6)) };
  }
  const parentGini = gini(vals);
  if (parentGini < 1e-7) {
    return { isLeaf: true, value: Number(mean.toFixed(6)) };
  }

  const p = X[0].length;
  let featCandidates = Array.from({ length: p }, (_, i) => i);
  if (subsampleFeatures && subsampleFeatures < p) {
    for (let i = featCandidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [featCandidates[i], featCandidates[j]] = [featCandidates[j], featCandidates[i]];
    }
    featCandidates = featCandidates.slice(0, subsampleFeatures);
  }

  let bestGain = 0;
  let bestFeat = -1;
  let bestThresh = 0;
  let bestL: number[] = [];
  let bestR: number[] = [];

  for (const f of featCandidates) {
    const colVals = indices.map((i) => X[i][f]).sort((a, b) => a - b);
    const step = Math.max(1, Math.floor(colVals.length / 16));
    const seenT = new Set<number>();

    for (let k = step; k < colVals.length; k += step) {
      const thresh = (colVals[k - 1] + colVals[k]) / 2;
      if (seenT.has(thresh)) continue;
      seenT.add(thresh);

      const leftIdx: number[] = [];
      const rightIdx: number[] = [];
      for (const idx of indices) {
        if (X[idx][f] <= thresh) leftIdx.push(idx);
        else rightIdx.push(idx);
      }
      if (leftIdx.length === 0 || rightIdx.length === 0) continue;

      const gain =
        parentGini -
        (leftIdx.length * gini(leftIdx.map((i) => y[i])) +
          rightIdx.length * gini(rightIdx.map((i) => y[i]))) /
          n;

      if (gain > bestGain) {
        bestGain = gain;
        bestFeat = f;
        bestThresh = thresh;
        bestL = leftIdx;
        bestR = rightIdx;
      }
    }
  }

  if (bestFeat === -1 || bestGain <= 1e-6) {
    return { isLeaf: true, value: Number(mean.toFixed(6)) };
  }

  importances[bestFeat] += bestGain * n;

  return {
    isLeaf: false,
    featureIndex: bestFeat,
    threshold: Number(bestThresh.toFixed(6)),
    value: Number(mean.toFixed(6)),
    left: buildGiniTree(X, y, bestL, depth + 1, maxDepth, minSamplesSplit, subsampleFeatures, importances, rng),
    right: buildGiniTree(X, y, bestR, depth + 1, maxDepth, minSamplesSplit, subsampleFeatures, importances, rng),
  };
}

function buildGradientTree(
  X: number[][],
  gradients: number[],
  hessians: number[],
  indices: number[],
  depth: number,
  maxDepth: number,
  regLambda: number,
  minChildWeight: number,
  gamma: number,
  importances: number[]
): TreeNodeSerialized {
  let G = 0;
  let H = 0;
  for (const i of indices) {
    G += gradients[i];
    H += hessians[i];
  }
  const leafWeight = -G / (H + regLambda);
  if (depth >= maxDepth || indices.length < 4 || H < minChildWeight) {
    return { isLeaf: true, value: Number(leafWeight.toFixed(6)) };
  }

  const parentScore = (G * G) / (H + regLambda);
  const p = X[0].length;
  let bestGain = 0;
  let bestFeat = -1;
  let bestThresh = 0;
  let bestL: number[] = [];
  let bestR: number[] = [];

  for (let f = 0; f < p; f++) {
    const colVals = indices.map((i) => X[i][f]).sort((a, b) => a - b);
    const step = Math.max(1, Math.floor(colVals.length / 14));
    const seenT = new Set<number>();

    for (let k = step; k < colVals.length; k += step) {
      const thresh = (colVals[k - 1] + colVals[k]) / 2;
      if (seenT.has(thresh)) continue;
      seenT.add(thresh);

      let GL = 0;
      let HL = 0;
      const leftIdx: number[] = [];
      const rightIdx: number[] = [];
      for (const idx of indices) {
        if (X[idx][f] <= thresh) {
          leftIdx.push(idx);
          GL += gradients[idx];
          HL += hessians[idx];
        } else {
          rightIdx.push(idx);
        }
      }
      const GR = G - GL;
      const HR = H - HL;
      if (leftIdx.length < 2 || rightIdx.length < 2 || HL < minChildWeight || HR < minChildWeight) {
        continue;
      }
      const gain =
        0.5 * ((GL * GL) / (HL + regLambda) + (GR * GR) / (HR + regLambda) - parentScore) - gamma;

      if (gain > bestGain) {
        bestGain = gain;
        bestFeat = f;
        bestThresh = thresh;
        bestL = leftIdx;
        bestR = rightIdx;
      }
    }
  }

  if (bestFeat === -1 || bestGain <= 1e-6) {
    return { isLeaf: true, value: Number(leafWeight.toFixed(6)) };
  }

  importances[bestFeat] += bestGain;

  return {
    isLeaf: false,
    featureIndex: bestFeat,
    threshold: Number(bestThresh.toFixed(6)),
    value: Number(leafWeight.toFixed(6)),
    left: buildGradientTree(X, gradients, hessians, bestL, depth + 1, maxDepth, regLambda, minChildWeight, gamma, importances),
    right: buildGradientTree(X, gradients, hessians, bestR, depth + 1, maxDepth, regLambda, minChildWeight, gamma, importances),
  };
}

function walkTree(node: TreeNodeSerialized, row: number[]): number {
  let curr = node;
  while (!curr.isLeaf) {
    if (row[curr.featureIndex!] <= curr.threshold!) curr = curr.left!;
    else curr = curr.right!;
  }
  return curr.value;
}

// ============================================================================
// TRAINING FOR ALL 5 ALGORITHMS
// ============================================================================
export function fitAlgorithm(
  algorithm: AlgorithmId,
  XTrain: number[][],
  yTrain: number[],
  featureNames: string[],
  targetColumn: string,
  means: number[],
  stds: number[],
  hyperparams: Record<string, number | string> = {}
): TrainedModelArtifact {
  const n = XTrain.length;
  const p = featureNames.length;
  const expectedFeatureValues = new Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += XTrain[i][j];
    expectedFeatureValues[j] = Number((s / (n || 1)).toFixed(6));
  }

  if (algorithm === 'Logistic Regression') {
    const lr = Number(hyperparams.learningRate ?? 0.15);
    const epochs = Number(hyperparams.epochs ?? 350);
    const l2 = Number(hyperparams.l2Penalty ?? 0.01);
    const weights = new Array(p).fill(0);
    let bias = 0;

    for (let ep = 0; ep < epochs; ep++) {
      const gradW = new Array(p).fill(0);
      let gradB = 0;
      for (let i = 0; i < n; i++) {
        let z = bias;
        for (let j = 0; j < p; j++) z += weights[j] * XTrain[i][j];
        const err = sigmoid(z) - yTrain[i];
        gradB += err;
        for (let j = 0; j < p; j++) gradW[j] += err * XTrain[i][j];
      }
      bias -= (lr * gradB) / n;
      for (let j = 0; j < p; j++) {
        weights[j] -= lr * (gradW[j] / n + l2 * weights[j]);
      }
    }

    return {
      algorithm,
      targetColumn,
      featureNames,
      means,
      stds,
      weights: weights.map((w) => Number(w.toFixed(6))),
      bias: Number(bias.toFixed(6)),
      featureImportances: normalizeImportanceList(featureNames, weights),
      expectedFeatureValues,
    };
  }

  if (algorithm === 'Decision Tree') {
    const maxDepth = Number(hyperparams.maxDepth ?? 5);
    const minSamplesSplit = Number(hyperparams.minSamplesSplit ?? 5);
    const rng = seededRng(42);
    const imps = new Array(p).fill(0);
    const indices = Array.from({ length: n }, (_, i) => i);
    const tree = buildGiniTree(XTrain, yTrain, indices, 0, maxDepth, minSamplesSplit, null, imps, rng);

    return {
      algorithm,
      targetColumn,
      featureNames,
      means,
      stds,
      trees: [tree],
      featureImportances: normalizeImportanceList(featureNames, imps),
      expectedFeatureValues,
    };
  }

  if (algorithm === 'Random Forest') {
    const nEstimators = Number(hyperparams.nEstimators ?? 30);
    const maxDepth = Number(hyperparams.maxDepth ?? 6);
    const minSamplesSplit = Number(hyperparams.minSamplesSplit ?? 4);
    const rng = seededRng(101);
    const imps = new Array(p).fill(0);
    const subFeat = Math.max(1, Math.floor(Math.sqrt(p)));
    const trees: TreeNodeSerialized[] = [];

    for (let t = 0; t < nEstimators; t++) {
      const boot = Array.from({ length: n }, () => Math.floor(rng() * n));
      trees.push(buildGiniTree(XTrain, yTrain, boot, 0, maxDepth, minSamplesSplit, subFeat, imps, rng));
    }

    return {
      algorithm,
      targetColumn,
      featureNames,
      means,
      stds,
      trees,
      featureImportances: normalizeImportanceList(featureNames, imps),
      expectedFeatureValues,
    };
  }

  // Gradient Boosting (1st-order binomial deviance residual trees, regLambda=0) vs XGBoost (2nd-order regularized gain + gamma)
  const isXgboost = algorithm === 'XGBoost';
  const nEstimators = Number(hyperparams.nEstimators ?? (isXgboost ? 35 : 30));
  const maxDepth = Number(hyperparams.maxDepth ?? 3);
  const learningRate = Number(hyperparams.learningRate ?? (isXgboost ? 0.14 : 0.12));
  const regLambda = Number(hyperparams.regLambda ?? (isXgboost ? 1.5 : 0.25));
  const gamma = isXgboost ? Number(hyperparams.gamma ?? 0.05) : 0;

  const meanY = Math.max(0.02, Math.min(0.98, yTrain.reduce((a, b) => a + b, 0) / (n || 1)));
  const baseScore = Math.log(meanY / (1 - meanY));
  const rawPreds = new Array(n).fill(baseScore);
  const allIdx = Array.from({ length: n }, (_, i) => i);
  const imps = new Array(p).fill(0);
  const trees: TreeNodeSerialized[] = [];

  for (let m = 0; m < nEstimators; m++) {
    const gradients = new Array(n);
    const hessians = new Array(n);
    for (let i = 0; i < n; i++) {
      const prob = sigmoid(rawPreds[i]);
      gradients[i] = prob - yTrain[i];
      // Standard GBM uses constant step denominator ~0.25; XGBoost uses exact 2nd-order Hessian p*(1-p)
      hessians[i] = isXgboost ? Math.max(prob * (1 - prob), 1e-6) : 0.25;
    }

    const tree = buildGradientTree(
      XTrain,
      gradients,
      hessians,
      allIdx,
      0,
      maxDepth,
      regLambda,
      1.0,
      gamma,
      imps
    );
    trees.push(tree);
    for (let i = 0; i < n; i++) {
      rawPreds[i] += learningRate * walkTree(tree, XTrain[i]);
    }
  }

  return {
    algorithm,
    targetColumn,
    featureNames,
    means,
    stds,
    baseScore: Number(baseScore.toFixed(6)),
    learningRate,
    trees,
    featureImportances: normalizeImportanceList(featureNames, imps),
    expectedFeatureValues,
  };
}

export function predictProbability(artifact: TrainedModelArtifact, rawFeatureVector: number[]): number {
  const stdVec = rawFeatureVector.map(
    (v, j) => (v - (artifact.means[j] ?? 0)) / (artifact.stds[j] || 1)
  );
  return predictProbabilityFromStd(artifact, stdVec);
}

export function predictProbabilityFromStd(artifact: TrainedModelArtifact, stdVec: number[]): number {
  if (artifact.algorithm === 'Logistic Regression') {
    let z = artifact.bias ?? 0;
    for (let j = 0; j < stdVec.length; j++) z += (artifact.weights?.[j] ?? 0) * stdVec[j];
    return sigmoid(z);
  }
  if (artifact.algorithm === 'Decision Tree' || artifact.algorithm === 'Random Forest') {
    const trees = artifact.trees ?? [];
    if (trees.length === 0) return 0.5;
    return trees.reduce((acc, t) => acc + walkTree(t, stdVec), 0) / trees.length;
  }
  const trees = artifact.trees ?? [];
  const lr = artifact.learningRate ?? 0.14;
  let score = artifact.baseScore ?? 0;
  for (const t of trees) score += lr * walkTree(t, stdVec);
  return sigmoid(score);
}

// ============================================================================
// EVALUATION, ROC-AUC, CROSS-VALIDATION & HYPERPARAMETER TUNING
// ============================================================================
function computeClassificationStats(yTrue: number[], probs: number[]) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (let i = 0; i < yTrue.length; i++) {
    const a = yTrue[i] >= 0.5 ? 1 : 0;
    const p = probs[i] >= 0.5 ? 1 : 0;
    if (a === 1 && p === 1) tp++;
    else if (a === 0 && p === 1) fp++;
    else if (a === 0 && p === 0) tn++;
    else fn++;
  }

  const accuracy = (tp + tn) / (yTrue.length || 1);
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // ROC Curve & Trapezoidal AUC
  const pairs = yTrue.map((y, i) => ({ y: y >= 0.5 ? 1 : 0, p: probs[i] })).sort((a, b) => b.p - a.p);
  const posCount = pairs.filter((x) => x.y === 1).length || 1;
  const negCount = pairs.filter((x) => x.y === 0).length || 1;

  const rocCurve: RocPoint[] = [{ fpr: 0, tpr: 0, threshold: 1 }];
  let runTp = 0;
  let runFp = 0;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].y === 1) runTp++;
    else runFp++;
    if (i === pairs.length - 1 || pairs[i].p !== pairs[i + 1].p) {
      rocCurve.push({
        fpr: Number((runFp / negCount).toFixed(4)),
        tpr: Number((runTp / posCount).toFixed(4)),
        threshold: Number(pairs[i].p.toFixed(4)),
      });
    }
  }
  if (rocCurve[rocCurve.length - 1].fpr !== 1 || rocCurve[rocCurve.length - 1].tpr !== 1) {
    rocCurve.push({ fpr: 1, tpr: 1, threshold: 0 });
  }

  let rocAuc = 0;
  for (let i = 1; i < rocCurve.length; i++) {
    rocAuc += (rocCurve[i].fpr - rocCurve[i - 1].fpr) * ((rocCurve[i].tpr + rocCurve[i - 1].tpr) / 2);
  }

  const confusionMatrix: ConfusionMatrixData = { tp, fp, tn, fn };
  return {
    accuracy: Number(accuracy.toFixed(4)),
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1Score: Number(f1Score.toFixed(4)),
    rocAuc: Number(Math.max(0, Math.min(1, rocAuc)).toFixed(4)),
    confusionMatrix,
    rocCurve,
  };
}

function stratifiedSplitIndices(y: number[], testSize: number, seed = 42) {
  const rng = seededRng(seed);
  const pos: number[] = [];
  const neg: number[] = [];
  y.forEach((v, idx) => (v >= 0.5 ? pos.push(idx) : neg.push(idx)));

  const shuffle = (arr: number[]) => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const pShuf = shuffle(pos);
  const nShuf = shuffle(neg);
  const pTest = Math.max(1, Math.round(pShuf.length * testSize));
  const nTest = Math.max(1, Math.round(nShuf.length * testSize));

  return {
    testIdx: [...pShuf.slice(0, pTest), ...nShuf.slice(0, nTest)],
    trainIdx: [...pShuf.slice(pTest), ...nShuf.slice(nTest)],
  };
}

function runStratifiedKFoldCV(
  algorithm: AlgorithmId,
  XRaw: number[][],
  y: number[],
  featureNames: string[],
  targetColumn: string,
  folds: number,
  hyperparams: Record<string, number | string>
): CrossValidationSummary {
  const rng = seededRng(77);
  const pos = y.map((v, i) => (v >= 0.5 ? i : -1)).filter((i) => i >= 0);
  const neg = y.map((v, i) => (v < 0.5 ? i : -1)).filter((i) => i >= 0);

  const shuffle = (arr: number[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const foldBuckets: number[][] = Array.from({ length: folds }, () => []);
  shuffle(pos).forEach((idx, k) => foldBuckets[k % folds].push(idx));
  shuffle(neg).forEach((idx, k) => foldBuckets[k % folds].push(idx));

  const foldScores: CrossValidationSummary['foldScores'] = [];

  for (let f = 0; f < folds; f++) {
    const valIdx = foldBuckets[f];
    const trainIdx = foldBuckets.flatMap((b, idx) => (idx === f ? [] : b));
    const { XTrain, XTest, means, stds } = fitAndTransformTrainTest(
      trainIdx.map((i) => XRaw[i]),
      valIdx.map((i) => XRaw[i])
    );
    const yTrain = trainIdx.map((i) => y[i]);
    const yVal = valIdx.map((i) => y[i]);

    const model = fitAlgorithm(algorithm, XTrain, yTrain, featureNames, targetColumn, means, stds, hyperparams);
    const probs = XTest.map((row) => predictProbabilityFromStd(model, row));
    const stats = computeClassificationStats(yVal, probs);
    foldScores.push({
      fold: f + 1,
      accuracy: stats.accuracy,
      f1: stats.f1Score,
      rocAuc: stats.rocAuc,
    });
  }

  const meanAccuracy = foldScores.reduce((a, b) => a + b.accuracy, 0) / folds;
  const meanF1 = foldScores.reduce((a, b) => a + b.f1, 0) / folds;
  const stdF1 = Math.sqrt(foldScores.reduce((a, b) => a + (b.f1 - meanF1) ** 2, 0) / folds);
  const meanRocAuc = foldScores.reduce((a, b) => a + b.rocAuc, 0) / folds;

  return {
    folds,
    meanAccuracy: Number(meanAccuracy.toFixed(4)),
    meanF1: Number(meanF1.toFixed(4)),
    stdF1: Number(stdF1.toFixed(4)),
    meanRocAuc: Number(meanRocAuc.toFixed(4)),
    foldScores,
  };
}

function tuneHyperparametersOnTrain(
  algorithm: AlgorithmId,
  XTrainRaw: number[][],
  yTrain: number[],
  featureNames: string[],
  targetColumn: string
): { bestParams: Record<string, number | string>; tuningSummary: string } {
  const candidates: Record<string, number | string>[] =
    algorithm === 'Logistic Regression'
      ? [
          { learningRate: 0.1, l2Penalty: 0.005, epochs: 350 },
          { learningRate: 0.15, l2Penalty: 0.01, epochs: 350 },
          { learningRate: 0.2, l2Penalty: 0.05, epochs: 400 },
        ]
      : algorithm === 'Decision Tree'
      ? [
          { maxDepth: 3, minSamplesSplit: 6 },
          { maxDepth: 5, minSamplesSplit: 4 },
          { maxDepth: 7, minSamplesSplit: 3 },
        ]
      : algorithm === 'Random Forest'
      ? [
          { nEstimators: 20, maxDepth: 5 },
          { nEstimators: 35, maxDepth: 6 },
          { nEstimators: 45, maxDepth: 7 },
        ]
      : [
          { nEstimators: 25, maxDepth: 2, learningRate: 0.12 },
          { nEstimators: 35, maxDepth: 3, learningRate: 0.14 },
          { nEstimators: 45, maxDepth: 4, learningRate: 0.1 },
        ];

  const { trainIdx, testIdx } = stratifiedSplitIndices(yTrain, 0.25, 19);
  const { XTrain, XTest, means, stds } = fitAndTransformTrainTest(
    trainIdx.map((i) => XTrainRaw[i]),
    testIdx.map((i) => XTrainRaw[i])
  );
  const yTr = trainIdx.map((i) => yTrain[i]);
  const yVal = testIdx.map((i) => yTrain[i]);

  let bestParams = candidates[0];
  let bestScore = -1;

  for (const cand of candidates) {
    const model = fitAlgorithm(algorithm, XTrain, yTr, featureNames, targetColumn, means, stds, cand);
    const probs = XTest.map((row) => predictProbabilityFromStd(model, row));
    const stats = computeClassificationStats(yVal, probs);
    const comp = stats.f1Score * 0.5 + stats.rocAuc * 0.5;
    if (comp > bestScore) {
      bestScore = comp;
      bestParams = cand;
    }
  }

  return {
    bestParams,
    tuningSummary: `Grid-searched ${candidates.length} configurations on internal validation split; selected ${JSON.stringify(bestParams)} (val composite ${(bestScore * 100).toFixed(1)}%).`,
  };
}

export function trainAndEvaluateSupervisedModel(params: {
  datasetId: number;
  datasetName: string;
  rows: Record<string, unknown>[];
  algorithm: AlgorithmId;
  targetColumn: string;
  featureColumns: string[];
  testSize?: number;
  cvFolds?: number;
  autoTune?: boolean;
  hyperparams?: Record<string, number | string>;
}): ModelExperimentRecord {
  const testSize = params.testSize ?? 0.25;
  const cvFolds = params.cvFolds ?? 5;

  const { XRaw, y, featureNames } = buildFeatureMatrixAndValidateTarget(
    params.rows,
    params.targetColumn,
    params.featureColumns
  );

  if (XRaw.length < 20) {
    throw new Error('At least 20 cleaned records are required for reliable train/test evaluation.');
  }

  const t0 = performance.now();
  const { trainIdx, testIdx } = stratifiedSplitIndices(y, testSize, 42);
  const XTrainRaw = trainIdx.map((i) => XRaw[i]);
  const XTestRaw = testIdx.map((i) => XRaw[i]);
  const yTrain = trainIdx.map((i) => y[i]);
  const yTest = testIdx.map((i) => y[i]);

  let chosenParams = params.hyperparams ?? {};
  let tuningSummary: string | undefined;

  if (params.autoTune) {
    const tuned = tuneHyperparametersOnTrain(
      params.algorithm,
      XTrainRaw,
      yTrain,
      featureNames,
      params.targetColumn
    );
    chosenParams = { ...chosenParams, ...tuned.bestParams };
    tuningSummary = tuned.tuningSummary;
  }

  // Strictly fit scaler on training split ONLY
  const { XTrain, XTest, means, stds } = fitAndTransformTrainTest(XTrainRaw, XTestRaw);

  const artifact = fitAlgorithm(
    params.algorithm,
    XTrain,
    yTrain,
    featureNames,
    params.targetColumn,
    means,
    stds,
    chosenParams
  );
  const tTrainEnd = performance.now();

  const tPredStart = performance.now();
  const testProbs = XTest.map((row) => predictProbabilityFromStd(artifact, row));
  const tPredEnd = performance.now();

  const evalStats = computeClassificationStats(yTest, testProbs);
  const cvSummary =
    cvFolds >= 2
      ? runStratifiedKFoldCV(
          params.algorithm,
          XRaw,
          y,
          featureNames,
          params.targetColumn,
          cvFolds,
          chosenParams
        )
      : undefined;

  return {
    datasetId: params.datasetId,
    datasetName: params.datasetName,
    algorithm: params.algorithm,
    targetColumn: params.targetColumn,
    featureColumns: featureNames,
    testSize,
    cvFolds,
    hyperparams: chosenParams,
    accuracy: evalStats.accuracy,
    precision: evalStats.precision,
    recall: evalStats.recall,
    f1Score: evalStats.f1Score,
    rocAuc: evalStats.rocAuc,
    confusionMatrix: evalStats.confusionMatrix,
    rocCurve: evalStats.rocCurve,
    featureImportance: artifact.featureImportances,
    cvSummary,
    tuningSummary,
    trainingTimeMs: Number((tTrainEnd - t0).toFixed(2)),
    predictionTimeMs: Number((tPredEnd - tPredStart).toFixed(2)),
    isProduction: false,
    artifact,
  };
}

export function explainPredictionFactors(
  artifact: TrainedModelArtifact,
  rawFeatureVector: number[]
): { feature: string; value: number; contribution: number; direction: 'increases_risk' | 'reduces_risk' }[] {
  const stdVec = rawFeatureVector.map(
    (v, j) => (v - (artifact.means[j] ?? 0)) / (artifact.stds[j] || 1)
  );
  const baseline = artifact.expectedFeatureValues;
  const fullProb = predictProbabilityFromStd(artifact, stdVec);
  const baseProb = predictProbabilityFromStd(artifact, baseline);

  return artifact.featureNames
    .map((feature, j) => {
      const withoutJ = [...stdVec];
      withoutJ[j] = baseline[j];
      const onlyJ = [...baseline];
      onlyJ[j] = stdVec[j];
      const phi = 0.5 * ((fullProb - predictProbabilityFromStd(artifact, withoutJ)) + (predictProbabilityFromStd(artifact, onlyJ) - baseProb));
      return {
        feature,
        value: Number(rawFeatureVector[j].toFixed(2)),
        contribution: Number(phi.toFixed(4)),
        direction: phi >= 0 ? ('increases_risk' as const) : ('reduces_risk' as const),
      };
    })
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

export function detectAnomaliesUnsupervised(rows: Record<string, unknown>[], features: string[]) {
  if (rows.length < 5 || features.length === 0) return [];
  const mat = rows.map((r) => features.map((f) => toFiniteNumber(r[f]) ?? 0));
  const p = features.length;
  const means = new Array(p).fill(0);
  const stds = new Array(p).fill(1);
  for (let j = 0; j < p; j++) {
    means[j] = mat.reduce((a, r) => a + r[j], 0) / mat.length;
    const s = Math.sqrt(mat.reduce((a, r) => a + (r[j] - means[j]) ** 2, 0) / mat.length);
    stds[j] = s > 1e-8 ? s : 1;
  }

  return rows
    .map((r, i) => {
      const zVec = mat[i].map((v, j) => (v - means[j]) / stds[j]);
      const l2Dist = Math.sqrt(zVec.reduce((a, z) => a + z * z, 0) / p);
      let maxFeat = features[0];
      let maxZ = 0;
      zVec.forEach((z, idx) => {
        if (Math.abs(z) > Math.abs(maxZ)) {
          maxZ = z;
          maxFeat = features[idx];
        }
      });
      const topDrivers = zVec
        .map((z, idx) => ({ feat: features[idx], z }))
        .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
        .slice(0, 2)
        .map((d) => `${d.feat.replace(/_/g, ' ')} (${d.z >= 0 ? '+' : ''}${d.z.toFixed(1)}σ)`);

      return {
        rowIndex: i + 1,
        orderId: String(r.order_id ?? r.record_id ?? `REC-${i + 1}`),
        supplierName: String(r.supplier_name ?? r.supplier_id ?? `Record ${i + 1}`),
        region: String(r.region ?? 'Unknown'),
        delayDays: toFiniteNumber(r.delivery_delay_days) ?? 0,
        reliability: toFiniteNumber(r.supplier_reliability) ?? 0,
        anomalyScore: Number(Math.min(0.99, l2Dist / 3.5).toFixed(3)),
        primaryDeviation: `${maxFeat.replace(/_/g, ' ')} (${maxZ >= 0 ? '+' : ''}${maxZ.toFixed(1)}σ from cohort mean)`,
        drivers: topDrivers,
      };
    })
    .sort((a, b) => b.anomalyScore - a.anomalyScore)
    .slice(0, 10);
}
