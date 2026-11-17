import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bot,
  Database,
  FileBarChart,
  FlaskConical,
  GitBranch,
  Layers,
  ShieldCheck,
} from 'lucide-react';

const CAPABILITIES = [
  {
    icon: FlaskConical,
    title: '5-Algorithm ML Experimentation Lab',
    desc: 'Train and benchmark Logistic Regression, Decision Tree, Random Forest, Gradient Boosting, and XGBoost with 5-fold stratified CV, grid tuning, ROC curves, and strict leakage checks.',
  },
  {
    icon: Database,
    title: 'Non-Destructive Data Intelligence',
    desc: 'Upload CSV or Excel procurement feeds with automated missing-value imputation, deduplication, IQR outlier Winsorization, derived risk features, and raw-vs-clean audits.',
  },
  {
    icon: Activity,
    title: 'Multi-Risk Prediction Engine',
    desc: 'Score supplier delivery delay, disruption probability, and inventory shortage risk in real time using active trained artifacts with per-feature attribution bars.',
  },
  {
    icon: Bot,
    title: '7-Step AI Investigation Agent',
    desc: 'Retrieve profile telemetry, trajectory deltas, root causes, financial loss projections, and grounded Gemini mitigation plans with deterministic fallback verification.',
  },
  {
    icon: GitBranch,
    title: 'Deterministic What-If Simulations',
    desc: 'Stress-test supplier outages, transit delay surges, reliability decay, safety-stock breaches, and dual-source transitions before executing procurement contracts.',
  },
  {
    icon: FileBarChart,
    title: 'Executive Impact & Board Reporting',
    desc: 'Quantify revenue exposure, downtime hours, HHI spend concentration, and export multi-sheet Excel workbooks, CSV feeds, and formatted PDF executive dossiers.',
  },
];

export function LandingPage({
  onEnterWorkspace,
  onOpenAuth,
  userEmail,
}: {
  onEnterWorkspace: (targetPage?: string) => void;
  onOpenAuth: () => void;
  userEmail?: string | null;
}) {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [facilityImgFailed, setFacilityImgFailed] = useState(false);

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col">
      {/* 3-Zone Header */}
      <header className="h-16 border-b border-slate-800/80 bg-[#090D16]/95 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 shrink-0">
            <Layers className="w-5 h-5 text-sky-400" />
            <span className="font-display font-semibold text-sm tracking-tight text-white whitespace-nowrap">
              SUPPLY CHAIN IQ
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
            <button
              type="button"
              onClick={() => onEnterWorkspace('executive')}
              className="hover:text-white transition-colors whitespace-nowrap"
            >
              Executive Centre
            </button>
            <button
              type="button"
              onClick={() => onEnterWorkspace('ml-lab')}
              className="hover:text-white transition-colors whitespace-nowrap"
            >
              ML Lab
            </button>
            <button
              type="button"
              onClick={() => onEnterWorkspace('investigation')}
              className="hover:text-white transition-colors whitespace-nowrap"
            >
              AI Agent
            </button>
            <button
              type="button"
              onClick={() => onEnterWorkspace('simulation')}
              className="hover:text-white transition-colors whitespace-nowrap"
            >
              What-If Engine
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white border border-slate-700 rounded-md whitespace-nowrap"
            >
              {userEmail ? userEmail.split('@')[0] : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => onEnterWorkspace('executive')}
              className="px-4 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              Enter Platform
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16 grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="text-xs font-mono uppercase tracking-wider text-teal-400">
              Supply Chain Risk Prediction · ML Benchmark · Decision Intelligence
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold text-white tracking-tight leading-[1.12]">
              Predict supplier disruptions before inventory buffers break.
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
              SUPPLY CHAIN IQ combines supervised ensemble machine learning, automated data quality validation,
              a 7-step grounded AI investigation agent, and deterministic financial impact simulation into one
              unified engineering platform.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onEnterWorkspace('executive')}
                className="px-5 py-2.5 text-xs sm:text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md inline-flex items-center gap-2 whitespace-nowrap transition-colors"
              >
                Enter Intelligence Platform
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onEnterWorkspace('ml-lab')}
                className="px-5 py-2.5 text-xs sm:text-sm font-medium bg-[#111827] hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-md whitespace-nowrap transition-colors"
              >
                Open ML Experimentation Lab
              </button>
            </div>

            <div className="pt-4 border-t border-slate-800 grid grid-cols-3 gap-4 text-xs">
              <div>
                <div className="text-lg font-display font-semibold text-white tabular-nums">5 Models</div>
                <div className="text-slate-400">LR · DT · RF · GB · XGBoost</div>
              </div>
              <div>
                <div className="text-lg font-display font-semibold text-teal-400 tabular-nums">324 Orders</div>
                <div className="text-slate-400">Documented Baseline Feed</div>
              </div>
              <div>
                <div className="text-lg font-display font-semibold text-sky-400 tabular-nums">7-Step Agent</div>
                <div className="text-slate-400">Grounded Root-Cause AI</div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-lg border border-slate-800 overflow-hidden bg-[#111827]">
              {!heroImgFailed ? (
                <img
                  src="/src/assets/images/hero_logistics_command_1794762745982.jpg"
                  alt="Automated twilight intermodal container port and supply logistics corridor"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-72 sm:h-88 object-cover"
                />
              ) : (
                <div className="w-full h-72 sm:h-88 bg-gradient-to-br from-slate-900 via-[#0B162C] to-slate-950 flex flex-col items-center justify-center p-6 text-center">
                  <Layers className="w-10 h-10 text-sky-400 mb-3" />
                  <div className="text-sm font-medium text-white">Global Supply Corridor Telemetry</div>
                  <div className="text-xs text-slate-400 mt-1">12 Tier-1 Suppliers · Multi-Region Logistics Network</div>
                </div>
              )}
              <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span>Multi-Corridor Procurement Monitoring</span>
                <span className="font-mono text-slate-300">Active ML Scoring · Node SQLite Store</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16 w-full">
        <div className="mb-8">
          <div className="text-xs font-mono uppercase tracking-wider text-sky-400 mb-1">
            Platform Architecture
          </div>
          <h2 className="text-2xl font-display font-semibold text-white">
            Eleven integrated analytical & decision modules
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {CAPABILITIES.map((cap) => {
            const Icon = cap.icon;
            return (
              <div
                key={cap.title}
                className="bg-[#111827] border border-slate-800 rounded-lg p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="w-9 h-9 rounded-md bg-slate-900 border border-slate-800 flex items-center justify-center text-sky-400 mb-4">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-display font-semibold text-white mb-2">{cap.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{cap.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Engineering Rigor Split Section */}
      <section className="border-t border-slate-800/80 bg-[#0D1320]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-5">
            <div className="rounded-lg border border-slate-800 overflow-hidden bg-[#111827]">
              {!facilityImgFailed ? (
                <img
                  src="/src/assets/images/supply_manufacturing_facility_1794762748937.jpg"
                  alt="Precision semiconductor and component manufacturing facility"
                  referrerPolicy="no-referrer"
                  onError={() => setFacilityImgFailed(true)}
                  className="w-full h-64 object-cover"
                />
              ) : (
                <div className="w-full h-64 bg-slate-900 flex items-center justify-center text-xs text-slate-400">
                  Industrial Supply Telemetry Facility
                </div>
              )}
            </div>
          </div>
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-teal-400">
              <ShieldCheck className="w-4 h-4" />
              Methodological Integrity & Transparency
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-semibold text-white">
              Zero fabricated metrics. Honest synthetic documentation & strict ML hygiene.
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Preloaded procurement records are explicitly documented as a 324-row synthetic benchmark containing
              deliberate duplicates, missing values, and extreme delay outliers so evaluators can inspect
              non-destructive cleaning. Supervised models enforce strict train/test separation, fold-only Z-score
              scaling, and automated target-leakage exclusion.
            </p>
            <div>
              <button
                type="button"
                onClick={() => onEnterWorkspace('data')}
                className="px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-md inline-flex items-center gap-1.5"
              >
                Inspect Dataset & Preprocessing Audit
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-auto border-t border-slate-800/80 py-6 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>SUPPLY CHAIN IQ · B.Tech Computer Science Engineering Capstone</span>
          <span>Machine Learning · Predictive Analytics · Decision Support</span>
        </div>
      </footer>
    </div>
  );
}
