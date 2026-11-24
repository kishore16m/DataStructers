import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Cpu,
  Database,
  HardDrive,
  Layers,
  Play,
  RotateCcw,
  Search,
} from 'lucide-react';
import { searchCatalogue } from '../api';
import { ALGORITHM_META, STUDENT_INFO } from '../types';
import type {
  ActiveTab,
  CatalogueStats,
  QuickTargets,
  SearchAlgorithm,
  SearchResponse,
} from '../types';

interface OverviewSectionProps {
  stats: CatalogueStats;
  quickTargets: QuickTargets;
  compilerInfo: string;
  onNavigate: (tab: ActiveTab) => void;
  onLaunchVisualizer: (isbn: string, algorithm: SearchAlgorithm) => void;
  onGenerateSize: (count: number) => Promise<void>;
  onResetDemo: () => Promise<void>;
  busyAction: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function OverviewSection({
  stats,
  quickTargets,
  compilerInfo,
  onNavigate,
  onLaunchVisualizer,
  onGenerateSize,
  onResetDemo,
  busyAction,
}: OverviewSectionProps) {
  const [isbnInput, setIsbnInput] = useState(quickTargets.mid ?? '978-0-262-03384-8');
  const [quickResults, setQuickResults] = useState<SearchResponse[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleQuickCompare = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = isbnInput.trim();
    if (!target) {
      setSearchError('Enter an ISBN to compare search algorithms.');
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const algos: SearchAlgorithm[] = ['linear', 'binary_iterative', 'binary_recursive'];
      const results = await Promise.all(
        algos.map((algorithm) => searchCatalogue({ algorithm, isbn: target, captureTrace: false }))
      );
      setQuickResults(results);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const loadPercent = Math.round(stats.loadFactor * 100);

  return (
    <div className="space-y-8">
      {/* Header / Academic Identification Strip */}
      <div className="flex flex-col gap-4 border-b border-slate-800/80 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium text-blue-400">
            {STUDENT_INFO.courseCode} · {STUDENT_INFO.course} Capstone · Single-Module Project
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
            {STUDENT_INFO.projectTitle}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
            <span className="font-medium text-slate-200">{STUDENT_INFO.name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-xs text-slate-300 tabular-nums">
              Reg. No: {STUDENT_INFO.regNumber}
            </span>
            <span aria-hidden="true">·</span>
            <span>Execution Backend: Native Compiled C ADT ({compilerInfo})</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => void onResetDemo()}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0E172E] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-[#14203E] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-4 w-4 text-slate-400" />
            Reset Demo Dataset
          </button>
          <button
            type="button"
            onClick={() => onNavigate('benchmark')}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap shrink-0"
          >
            <Play className="h-4 w-4" />
            Open Performance Analyzer
          </button>
        </div>
      </div>

      {/* Real-Time ADT Statistics Grid (Single Elevation) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Catalogue Size (n)</span>
            <Database className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-3 font-mono text-3xl font-semibold text-slate-50 tabular-nums">
            {stats.size.toLocaleString()}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Sorted ascending by unique ISBN
          </p>
        </div>

        <div className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Dynamic Array Capacity</span>
            <Layers className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-3 font-mono text-3xl font-semibold text-slate-50 tabular-nums">
            {stats.capacity.toLocaleString()}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>Utilization: {loadPercent}%</span>
            <span className="font-mono tabular-nums">2x grow / 0.25x shrink</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Heap Memory Allocated</span>
            <HardDrive className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-3 font-mono text-3xl font-semibold text-slate-50 tabular-nums">
            {formatBytes(stats.memoryBytes)}
          </div>
          <p className="mt-1.5 text-xs text-slate-400 font-mono tabular-nums">
            {stats.memoryBytes.toLocaleString()} bytes via malloc/realloc
          </p>
        </div>

        <div className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Total Available Copies</span>
            <BookOpen className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-3 font-mono text-3xl font-semibold text-slate-50 tabular-nums">
            {stats.totalCopies.toLocaleString()}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Across {stats.size.toLocaleString()} indexed titles
          </p>
        </div>
      </div>

      {/* Quick Multi-Algorithm ISBN Lookup */}
      <section className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">
              Instant ISBN Lookup Across All Three C Algorithms
            </h2>
            <p className="text-sm text-slate-400">
              Execute Linear Search, Iterative Binary Search, and Recursive Binary Search simultaneously on the active catalogue.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 text-xs">
            <span className="text-slate-500">Quick targets:</span>
            {quickTargets.first && (
              <button
                type="button"
                onClick={() => setIsbnInput(quickTargets.first!)}
                className="font-mono text-blue-400 hover:text-blue-300 underline-offset-4 hover:underline whitespace-nowrap shrink-0"
              >
                First ({quickTargets.first})
              </button>
            )}
            {quickTargets.mid && (
              <button
                type="button"
                onClick={() => setIsbnInput(quickTargets.mid!)}
                className="font-mono text-sky-400 hover:text-sky-300 underline-offset-4 hover:underline whitespace-nowrap shrink-0"
              >
                Midpoint
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsbnInput(quickTargets.missing)}
              className="font-mono text-amber-400 hover:text-amber-300 underline-offset-4 hover:underline whitespace-nowrap shrink-0"
            >
              Missing ISBN
            </button>
          </div>
        </div>

        <form onSubmit={handleQuickCompare} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={isbnInput}
              onChange={(e) => setIsbnInput(e.target.value)}
              placeholder="Enter ISBN (e.g. 978-0-262-03384-8)"
              className="w-full rounded-lg border border-slate-700/80 bg-[#080E1E] py-2.5 pl-10 pr-4 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Cpu className="h-4 w-4" />
            {searching ? 'Executing C Search...' : 'Compare All 3 Algorithms'}
          </button>
        </form>

        {searchError && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {searchError}
          </p>
        )}

        {quickResults && (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-4 text-sm">
              {quickResults[0].found && quickResults[0].book ? (
                <div className="text-slate-200">
                  <span className="font-semibold text-emerald-400">Book Found</span>
                  <span className="mx-2 text-slate-600">·</span>
                  <span className="font-medium">{quickResults[0].book.title}</span>
                  <span className="mx-2 text-slate-600">·</span>
                  <span className="text-slate-400">{quickResults[0].book.author}</span>
                  <span className="mx-2 text-slate-600">·</span>
                  <span className="font-mono text-xs text-slate-300 tabular-nums">
                    Index [{quickResults[0].index}] · {quickResults[0].book.copies} copies
                  </span>
                </div>
              ) : (
                <div className="text-slate-300">
                  <span className="font-semibold text-red-400">Book Not Found</span>
                  <span className="mx-2 text-slate-600">·</span>
                  <span className="font-mono text-xs text-slate-400">
                    ISBN {quickResults[0].queryIsbn} does not exist in the current {stats.size.toLocaleString()}-record catalogue.
                  </span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-medium text-slate-400">
                    <th className="py-2.5 pr-4">Algorithm</th>
                    <th className="py-2.5 px-4 text-right">Key Comparisons</th>
                    <th className="py-2.5 px-4 text-right">Execution Time</th>
                    <th className="py-2.5 px-4 text-right">Recursion Calls / Depth</th>
                    <th className="py-2.5 px-4">Complexity</th>
                    <th className="py-2.5 pl-4 text-right">Visualize</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {quickResults.map((res) => {
                    const meta = ALGORITHM_META[res.algorithm];
                    return (
                      <tr key={res.algorithm} className="hover:bg-[#13203D]/50 transition-colors">
                        <td className="py-3 pr-4 font-medium text-slate-100">{meta.label}</td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-100 tabular-nums">
                          {res.comparisons.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-sky-300 tabular-nums">
                          {res.elapsedUs.toFixed(2)} µs
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300 tabular-nums">
                          {res.algorithm === 'binary_recursive'
                            ? `${res.recursiveCalls} calls / depth ${res.maxRecursionDepth}`
                            : 'Iterative (0)'}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-400">
                          {meta.avgTime} · Space {meta.space}
                        </td>
                        <td className="py-3 pl-4 text-right">
                          <button
                            type="button"
                            onClick={() => onLaunchVisualizer(res.queryIsbn, res.algorithm)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap"
                          >
                            Step Trace <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Guided Academic Evaluation Walkthrough */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">
            Guided Project Demonstration Workflow
          </h2>
          <p className="text-sm text-slate-400">
            Follow these five steps during academic evaluation to demonstrate every ADT invariant, search trace, and empirical benchmark.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col justify-between rounded-xl border border-slate-800/90 bg-[#0E172E] p-5">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-blue-400">01. Dynamic Array ADT &amp; Mutations</div>
              <h3 className="text-base font-semibold text-slate-100">
                Insert, Update, Delete &amp; Traverse
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Demonstrate ascending ISBN ordering, element shifting via <code className="font-mono text-xs text-slate-300">memmove</code>, duplicate ISBN rejection, and automatic capacity doubling/shrinking.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('catalogue')}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300 self-start"
            >
              Open Catalogue Manager <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-slate-800/90 bg-[#0E172E] p-5">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-blue-400">02. Interactive Algorithm Trace</div>
              <h3 className="text-base font-semibold text-slate-100">
                Visualize Linear &amp; Binary Search
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Step through real C execution traces highlighting sequential probes, <code className="font-mono text-xs text-slate-300">low / mid / high</code> pointers, and the live recursive call stack.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onLaunchVisualizer(quickTargets.mid ?? '978-0-262-03384-8', 'binary_recursive')
              }
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300 self-start"
            >
              Launch Search Visualizer <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-slate-800/90 bg-[#0E172E] p-5">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-blue-400">03. Large-Scale Dataset Scaling</div>
              <h3 className="text-base font-semibold text-slate-100">
                Stress-Test up to 100,000 Records
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Populate the C ADT with 10,000 or 100,000 unique sorted books in milliseconds and observe heap capacity growth and instant paginated traversal.
              </p>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void onGenerateSize(10000)}
                className="rounded-md border border-slate-700 bg-[#13203D] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500/60 hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                Load 10,000
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void onGenerateSize(100000)}
                className="rounded-md border border-slate-700 bg-[#13203D] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500/60 hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                Load 100,000
              </button>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-slate-800/90 bg-[#0E172E] p-5">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-blue-400">04. Empirical Benchmark Suite</div>
              <h3 className="text-base font-semibold text-slate-100">
                Compare O(n) vs O(log n) in Native C
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Execute multi-trial Best, Average, and Worst case benchmarks across 1,000 to 100,000 identical datasets and export CSV or full HTML reports.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('benchmark')}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300 self-start"
            >
              Run Performance Suite <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-slate-800/90 bg-[#0E172E] p-5 md:col-span-2">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-blue-400">05. Encapsulated C Implementation</div>
              <h3 className="text-base font-semibold text-slate-100">
                Inspect book_catalogue.h, book_catalogue.c &amp; main.c
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Review the opaque <code className="font-mono text-xs text-slate-300">typedef struct Catalogue Catalogue</code> encapsulation boundary, pointer-safe memory reallocation, and standalone GCC compilation commands.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('source')}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300 self-start"
            >
              Inspect C Source Files &amp; Build Commands <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
