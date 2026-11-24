import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Code2,
  Database,
  LayoutDashboard,
  Menu,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { fetchStats, generateDataset, resetDemoDataset } from './api';
import { CatalogueManager } from './components/CatalogueManager';
import { CSourceExplorer } from './components/CSourceExplorer';
import { OverviewSection } from './components/OverviewSection';
import { PerformanceAnalyzer } from './components/PerformanceAnalyzer';
import { SearchVisualizer } from './components/SearchVisualizer';
import { STUDENT_INFO } from './types';
import type {
  ActiveTab,
  BenchmarkRow,
  CatalogueStats,
  QuickTargets,
  SearchAlgorithm,
} from './types';

const NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview & Demo', icon: LayoutDashboard },
  { id: 'catalogue', label: 'Catalogue ADT', icon: Database },
  { id: 'visualizer', label: 'Search Visualizer', icon: Activity },
  { id: 'benchmark', label: 'Performance Analyzer', icon: BarChart3 },
  { id: 'source', label: 'C Source & Build', icon: Code2 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [stats, setStats] = useState<CatalogueStats>({
    size: 0,
    capacity: 32,
    totalCopies: 0,
    memoryBytes: 0,
    loadFactor: 0,
  });
  const [quickTargets, setQuickTargets] = useState<QuickTargets>({
    first: null,
    mid: null,
    last: null,
    missing: '978-9-999999-9',
  });
  const [compilerInfo, setCompilerInfo] = useState('GCC C11 -O2');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Visualizer deep-link state
  const [visualizerTarget, setVisualizerTarget] = useState<{
    isbn: string | null;
    algorithm: SearchAlgorithm | null;
  }>({ isbn: null, algorithm: null });

  // Cached benchmark state across tab switches
  const [benchmarkRows, setBenchmarkRows] = useState<BenchmarkRow[]>([]);
  const [measuredAt, setMeasuredAt] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    try {
      const data = await fetchStats();
      setStats(data.stats);
      setQuickTargets(data.quickTargets);
      setCompilerInfo(data.compiler);
      setGlobalError(null);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Unable to reach C ADT backend');
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const handleGenerateSize = async (count: number) => {
    setBusyAction(`Generating ${count.toLocaleString()} records...`);
    setGlobalError(null);
    try {
      await generateDataset(count);
      await refreshStats();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to generate dataset');
    } finally {
      setBusyAction(null);
    }
  };

  const handleResetDemo = async () => {
    setBusyAction('Resetting demonstration dataset...');
    setGlobalError(null);
    try {
      await resetDemoDataset();
      await refreshStats();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to reset dataset');
    } finally {
      setBusyAction(null);
    }
  };

  const handleLaunchVisualizer = (isbn: string, algorithm: SearchAlgorithm) => {
    setVisualizerTarget({ isbn, algorithm });
    setActiveTab('visualizer');
    setMobileNavOpen(false);
  };

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-[#0B1226] border-r border-slate-800/90">
      <div>
        {/* Dashboard Brand Title */}
        <div className="border-b border-slate-800/80 px-5 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold tracking-tight text-slate-50 truncate">
                LIBRARY CATALOGUE ADT
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                Search Performance Analyzer
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1 p-3" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-600/20 text-blue-200 border border-blue-500/35'
                    : 'text-slate-400 hover:bg-[#13203D]/60 hover:text-slate-100 border border-transparent'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-400' : 'text-slate-500'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Compact Live ADT Memory Readout */}
        <div className="mx-3 mt-4 rounded-lg border border-slate-800/80 bg-[#080E1E] p-3.5 space-y-2 text-xs">
          <div className="font-medium text-slate-300">Active C ADT State</div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Records (n)</span>
            <span className="font-mono text-slate-100 tabular-nums">
              {stats.size.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Capacity</span>
            <span className="font-mono text-slate-100 tabular-nums">
              {stats.capacity.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.round(stats.loadFactor * 100))}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-500">
            Load factor: {Math.round(stats.loadFactor * 100)}%
          </div>
        </div>
      </div>

      {/* Student Attribution Footer */}
      <div className="border-t border-slate-800/80 px-5 py-4 text-xs space-y-0.5">
        <div className="font-semibold text-slate-200">{STUDENT_INFO.name}</div>
        <div className="font-mono text-[11px] text-slate-400 tabular-nums">
          Reg: {STUDENT_INFO.regNumber} · {STUDENT_INFO.courseCode}
        </div>
        <div className="text-[11px] text-slate-500">{STUDENT_INFO.course} Project</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080E1E] text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-64 max-w-[80vw] h-full">
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-4 rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-800/80 bg-[#080E1E]/95 px-4 py-3.5 backdrop-blur-sm sm:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg border border-slate-800 p-2 text-slate-300 hover:bg-[#13203D] lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-400 truncate">
                <span className="font-semibold text-slate-100 whitespace-nowrap">
                  LIBRARY CATALOGUE ADT
                </span>
                <span aria-hidden="true">/</span>
                <span className="truncate">
                  Search Performance Analyzer | Data Structures Project
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {busyAction && (
              <span className="hidden sm:inline text-xs font-medium text-sky-300 whitespace-nowrap">
                {busyAction}
              </span>
            )}
            <button
              type="button"
              onClick={() => handleSelectTab('benchmark')}
              className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap shrink-0"
            >
              Run Benchmark
            </button>
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {globalError && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200"
            >
              {globalError}
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeTab === 'overview' && (
                <OverviewSection
                  stats={stats}
                  quickTargets={quickTargets}
                  compilerInfo={compilerInfo}
                  onNavigate={handleSelectTab}
                  onLaunchVisualizer={handleLaunchVisualizer}
                  onGenerateSize={handleGenerateSize}
                  onResetDemo={handleResetDemo}
                  busyAction={busyAction}
                />
              )}

              {activeTab === 'catalogue' && (
                <CatalogueManager
                  stats={stats}
                  onStatsUpdated={refreshStats}
                  onGenerateSize={handleGenerateSize}
                  onResetDemo={handleResetDemo}
                  onInspectInVisualizer={handleLaunchVisualizer}
                  busyAction={busyAction}
                />
              )}

              {activeTab === 'visualizer' && (
                <SearchVisualizer
                  stats={stats}
                  quickTargets={quickTargets}
                  initialIsbn={visualizerTarget.isbn}
                  initialAlgorithm={visualizerTarget.algorithm}
                />
              )}

              {activeTab === 'benchmark' && (
                <PerformanceAnalyzer
                  benchmarkRows={benchmarkRows}
                  measuredAt={measuredAt}
                  onBenchmarkComplete={(rows, ts) => {
                    setBenchmarkRows(rows);
                    setMeasuredAt(ts);
                  }}
                />
              )}

              {activeTab === 'source' && <CSourceExplorer />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
