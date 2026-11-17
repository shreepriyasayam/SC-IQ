import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';

export function formatUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs).toLocaleString()}`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function Panel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-[#111827] border border-slate-800/90 rounded-lg ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  meta,
  actions,
}: {
  title: string;
  subtitle: string;
  meta?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-slate-800">
      <div className="min-w-0">
        {meta && (
          <div className="text-[11px] font-mono uppercase tracking-wider text-sky-400 mb-1">
            {meta}
          </div>
        )}
        <h1 className="text-xl sm:text-2xl font-display font-semibold text-white tracking-tight">
          {title}
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
          {subtitle}
        </p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
}

export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex items-center ml-1.5"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-slate-500 hover:text-sky-400 focus:outline-none"
        aria-label="Metric explanation"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 p-2.5 rounded-md bg-slate-950 border border-slate-700 text-[11px] text-slate-200 leading-relaxed shadow-xl z-50 pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}

export function MetricTile({
  label,
  value,
  subtext,
  tooltip,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  subtext?: string;
  tooltip?: string;
  tone?: 'neutral' | 'critical' | 'high' | 'medium' | 'low' | 'sky';
}) {
  const toneColor =
    tone === 'critical'
      ? 'text-rose-400'
      : tone === 'high'
      ? 'text-amber-400'
      : tone === 'medium'
      ? 'text-sky-400'
      : tone === 'low'
      ? 'text-emerald-400'
      : tone === 'sky'
      ? 'text-teal-300'
      : 'text-white';

  return (
    <Panel className="p-4 flex flex-col justify-between">
      <div className="flex items-center text-[11px] font-medium uppercase tracking-wider text-slate-400">
        <span>{label}</span>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className={`text-2xl font-display font-semibold tabular-nums mt-2 ${toneColor}`}>
        {value}
      </div>
      {subtext && <div className="text-[11px] text-slate-400 mt-1 leading-snug">{subtext}</div>}
    </Panel>
  );
}

export function RiskTag({ category }: { category: string }) {
  const norm = String(category || 'LOW').toUpperCase();
  if (norm === 'CRITICAL') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-rose-400 whitespace-nowrap">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
        CRITICAL
      </span>
    );
  }
  if (norm === 'HIGH') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-amber-400 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        HIGH
      </span>
    );
  }
  if (norm === 'MEDIUM' || norm === 'MODERATE') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-sky-400 whitespace-nowrap">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        MEDIUM
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-400 whitespace-nowrap">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
      LOW
    </span>
  );
}

export function LoadingState({ label = 'Loading intelligence module...' }: { label?: string }) {
  return (
    <Panel className="p-10 text-center">
      <div className="inline-block w-5 h-5 border-2 border-slate-700 border-t-sky-400 rounded-full animate-spin mb-3" />
      <div className="text-xs text-slate-400">{label}</div>
    </Panel>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="p-3.5 rounded-md bg-rose-950/40 border border-rose-800/70 text-xs text-rose-200 flex items-start gap-2.5">
      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}
