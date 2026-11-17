import React, { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  Building2,
  CheckSquare,
  Database,
  DollarSign,
  FileBarChart,
  FlaskConical,
  GitBranch,
  Home,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  UserCheck,
  X,
} from 'lucide-react';
import { AnalyticsPage } from './pages/AnalyticsPage.tsx';
import { BusinessImpactPage } from './pages/BusinessImpactPage.tsx';
import { DataManagementPage } from './pages/DataManagementPage.tsx';
import { DecisionsPage } from './pages/DecisionsPage.tsx';
import { ExecutivePage } from './pages/ExecutivePage.tsx';
import { InvestigationPage } from './pages/InvestigationPage.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { MlLabPage } from './pages/MlLabPage.tsx';
import { PredictionPage } from './pages/PredictionPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { SimulationPage } from './pages/SimulationPage.tsx';
import { SuppliersPage } from './pages/SuppliersPage.tsx';
import { AuthDialog, type AuthUser } from './ui/AuthDialog.tsx';

const WORKSPACE_GROUPS = [
  {
    label: 'Command & Data',
    items: [
      { id: 'executive', label: 'Executive Centre', icon: LayoutDashboard },
      { id: 'suppliers', label: 'Supplier Intelligence', icon: Building2 },
      { id: 'data', label: 'Data Management', icon: Database },
    ],
  },
  {
    label: 'ML & Analytics',
    items: [
      { id: 'ml-lab', label: 'ML Experiment Lab', icon: FlaskConical },
      { id: 'prediction', label: 'Prediction Centre', icon: Activity },
      { id: 'analytics', label: 'Analytical Intelligence', icon: BarChart3 },
    ],
  },
  {
    label: 'Investigation & Decisions',
    items: [
      { id: 'investigation', label: 'AI Investigation', icon: Bot },
      { id: 'impact', label: 'Business Impact', icon: DollarSign },
      { id: 'simulation', label: 'What-If Simulation', icon: GitBranch },
      { id: 'decisions', label: 'Decision Support', icon: CheckSquare },
      { id: 'reports', label: 'Reports Centre', icon: FileBarChart },
    ],
  },
];

export default function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [activePage, setActivePage] = useState('executive');
  const [drilldownSupplierId, setDrilldownSupplierId] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    fetch('/api/auth/demo-login', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  if (showLanding) {
    return (
      <>
        <LandingPage
          userEmail={user?.email}
          onOpenAuth={() => setAuthOpen(true)}
          onEnterWorkspace={(target) => {
            if (target) setActivePage(target);
            setShowLanding(false);
          }}
        />
        <AuthDialog
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onAuthenticated={(_tok, u) => setUser(u)}
        />
      </>
    );
  }

  const currentNavItem = WORKSPACE_GROUPS.flatMap((g) => g.items).find((i) => i.id === activePage);

  function renderPage() {
    switch (activePage) {
      case 'executive':
        return (
          <ExecutivePage
            onNavigate={setActivePage}
            onSelectSupplierDrilldown={(id) => {
              setDrilldownSupplierId(id);
              setActivePage('suppliers');
            }}
          />
        );
      case 'suppliers':
        return <SuppliersPage initialSupplierId={drilldownSupplierId} />;
      case 'data':
        return <DataManagementPage />;
      case 'ml-lab':
        return <MlLabPage />;
      case 'prediction':
        return <PredictionPage />;
      case 'analytics':
        return <AnalyticsPage />;
      case 'investigation':
        return <InvestigationPage />;
      case 'impact':
        return <BusinessImpactPage />;
      case 'simulation':
        return <SimulationPage />;
      case 'decisions':
        return <DecisionsPage />;
      case 'reports':
        return <ReportsPage />;
      default:
        return (
          <ExecutivePage
            onNavigate={setActivePage}
            onSelectSupplierDrilldown={(id) => {
              setDrilldownSupplierId(id);
              setActivePage('suppliers');
            }}
          />
        );
    }
  }

  return (
    <div className="min-h-screen flex bg-[#090D16] text-slate-100">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Dark Navy Enterprise Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0D1320] border-r border-slate-800/90 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => setShowLanding(true)}
            className="flex items-center gap-2.5 text-left focus:outline-none"
          >
            <Layers className="w-5 h-5 text-sky-400 shrink-0" />
            <div>
              <div className="text-xs font-display font-semibold tracking-tight text-white whitespace-nowrap">
                SUPPLY CHAIN IQ
              </div>
              <div className="text-[10px] font-mono text-teal-400 whitespace-nowrap">
                Risk & Decision Platform
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden text-slate-400 hover:text-white"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {WORKSPACE_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActivePage(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-sky-600/20 text-sky-300 border border-sky-500/30'
                          : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3.5 border-t border-slate-800 space-y-2 text-xs">
          <button
            type="button"
            onClick={() => setShowLanding(true)}
            className="w-full px-3 py-1.5 rounded bg-[#090D16] hover:bg-slate-800 border border-slate-800 text-slate-300 flex items-center gap-2"
          >
            <Home className="w-3.5 h-3.5 text-slate-400" />
            Platform Overview
          </button>
          {user ? (
            <div className="flex items-center justify-between gap-2 px-1 pt-1">
              <div className="min-w-0">
                <div className="font-medium text-white truncate">{user.name}</div>
                <div className="text-[10px] text-slate-400 truncate">{user.role}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUser(null);
                  setAuthOpen(true);
                }}
                title="Switch Account"
                className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="w-full py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium flex items-center justify-center gap-1.5"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Sign In / Register
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-[#0D1320]/90 border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-300 hover:text-white rounded border border-slate-700"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-400 truncate">
              <span className="font-medium text-white whitespace-nowrap">SUPPLY CHAIN IQ</span>
              <span>/</span>
              <span className="text-sky-400 truncate">{currentNavItem?.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setActivePage('reports')}
              className="hidden sm:inline-flex px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#111827] border border-slate-700 hover:bg-slate-800 rounded-md whitespace-nowrap"
            >
              Export Reports
            </button>
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-md whitespace-nowrap"
            >
              {user ? user.name.split(' ')[0] : 'Sign In'}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {renderPage()}
        </main>
      </div>

      <AuthDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={(_tok, u) => setUser(u)}
      />
    </div>
  );
}
