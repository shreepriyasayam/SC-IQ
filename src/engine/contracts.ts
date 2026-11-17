export type AlgorithmId =
  | 'Logistic Regression'
  | 'Decision Tree'
  | 'Random Forest'
  | 'Gradient Boosting'
  | 'XGBoost';

export type TargetName = 'disruption_occurred' | 'delivery_delayed' | 'supplier_failure' | string;

export interface ColumnValidationProfile {
  name: string;
  inferredType: 'numeric' | 'categorical' | 'binary_target';
  rawMissingCount: number;
  cleanedMissingCount: number;
  uniqueCount: number;
  outlierCount: number;
  mean?: number;
  std?: number;
  median?: number;
  q1?: number;
  q3?: number;
  min?: number;
  max?: number;
  mode?: string;
  isDerived?: boolean;
  isTargetCandidate?: boolean;
}

export interface BeforeAfterComparison {
  metric: string;
  before: string | number;
  after: string | number;
  note: string;
}

export interface DataQualityReport {
  originalRows: number;
  cleanedRows: number;
  originalColumns: number;
  cleanedColumns: number;
  duplicatesRemoved: number;
  missingValuesDetected: number;
  missingValuesImputed: number;
  outliersDetected: number;
  outliersCapped: number;
  derivedFeaturesAdded: string[];
  validTargetColumns: string[];
  selectableFeatures: string[];
  excludedLeakageColumns: string[];
  columnProfiles: ColumnValidationProfile[];
  beforeAfter: BeforeAfterComparison[];
}

export interface ConfusionMatrixData {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export interface RocPoint {
  fpr: number;
  tpr: number;
  threshold: number;
}

export interface FeatureImportanceItem {
  feature: string;
  importance: number;
}

export interface CrossValidationSummary {
  folds: number;
  meanAccuracy: number;
  meanF1: number;
  stdF1: number;
  meanRocAuc: number;
  foldScores: { fold: number; accuracy: number; f1: number; rocAuc: number }[];
}

export interface TreeNodeSerialized {
  isLeaf: boolean;
  featureIndex?: number;
  threshold?: number;
  value: number;
  left?: TreeNodeSerialized;
  right?: TreeNodeSerialized;
}

export interface TrainedModelArtifact {
  algorithm: AlgorithmId;
  targetColumn: string;
  featureNames: string[];
  means: number[];
  stds: number[];
  baseScore?: number;
  learningRate?: number;
  weights?: number[];
  bias?: number;
  trees?: TreeNodeSerialized[];
  featureImportances: FeatureImportanceItem[];
  expectedFeatureValues: number[];
}

export interface ModelExperimentRecord {
  id?: number;
  datasetId: number;
  datasetName: string;
  algorithm: AlgorithmId;
  targetColumn: string;
  featureColumns: string[];
  testSize: number;
  cvFolds: number;
  hyperparams: Record<string, number | string>;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number;
  confusionMatrix: ConfusionMatrixData;
  rocCurve: RocPoint[];
  featureImportance: FeatureImportanceItem[];
  cvSummary?: CrossValidationSummary;
  tuningSummary?: string;
  trainingTimeMs: number;
  predictionTimeMs: number;
  isProduction: boolean;
  artifact?: TrainedModelArtifact;
  createdAt?: string;
}

export interface DatasetDocumentation {
  source: string;
  isSynthetic: boolean;
  recordCount: number;
  featureDescriptions: { name: string; description: string }[];
  targetVariables: string[];
  limitations: string[];
}
