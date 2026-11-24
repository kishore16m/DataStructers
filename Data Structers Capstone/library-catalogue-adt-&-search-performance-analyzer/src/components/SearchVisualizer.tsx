import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Search,
} from 'lucide-react';
import { fetchBookWindow, searchCatalogue } from '../api';
import { ALGORITHM_META } from '../types';
import type {
  BookRecord,
  CatalogueStats,
  QuickTargets,
  SearchAlgorithm,
  SearchResponse,
} from '../types';

interface SearchVisualizerProps {
  stats: CatalogueStats;
  quickTargets: QuickTargets;
  initialIsbn?: string | null;
  initialAlgorithm?: SearchAlgorithm | null;
}

const SPEED_OPTIONS = [
  { label: '0.25x', ms: 1600 },
  { label: '0.5x', ms: 1000 },
  { label: '1x', ms: 600 },
  { label: '2x', ms: 280 },
  { label: '4x', ms: 120 },
] as const;

export function SearchVisualizer({
  stats,
  quickTargets,
  initialIsbn,
  initialAlgorithm,
}: SearchVisualizerProps) {
  const [algorithm, setAlgorithm] = useState<SearchAlgorithm>(
    initialAlgorithm ?? 'binary_iterative'
  );
  const [isbnInput, setIsbnInput] = useState(
    initialIsbn ?? quickTargets.mid ?? '978-0-262-03384-8'
  );
  const [windowItems, setWindowItems] = useState<BookRecord[]>([]);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Playback state
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState<number>(600);

  const loadWindow = useCallback(async () => {
    try {
      const data = await fetchBookWindow();
      setWindowItems(data.items);
    } catch {
      // Non-fatal; visualization still renders trace steps
    }
  }, []);

  useEffect(() => {
    void loadWindow();
  }, [loadWindow, stats.size]);

  const executeSearch = useCallback(
    async (targetIsbn: string, algo: SearchAlgorithm) => {
      const cleaned = targetIsbn.trim();
      if (!cleaned) {
        setError('Please enter an ISBN to execute the search.');
        return;
      }
      setLoading(true);
      setError(null);
      setIsPlaying(false);
      try {
        const res = await searchCatalogue({
          algorithm: algo,
          isbn: cleaned,
          captureTrace: true,
        });
        setResult(res);
        setStepIndex(0);
        if (res.steps.length > 0) {
          setIsPlaying(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Run automatically if launched with an initial ISBN or on first load
  useEffect(() => {
    const target = initialIsbn ?? quickTargets.mid ?? quickTargets.first;
    const algo = initialAlgorithm ?? algorithm;
    if (initialAlgorithm) setAlgorithm(initialAlgorithm);
    if (initialIsbn) setIsbnInput(initialIsbn);
    if (target) {
      void executeSearch(target, algo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIsbn, initialAlgorithm]);

  // Step timer
  useEffect(() => {
    if (!isPlaying || !result || result.steps.length === 0) return;
    if (stepIndex >= result.steps.length - 1) {
      setIsPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setStepIndex((prev) => Math.min(prev + 1, result.steps.length - 1));
    }, speedMs);
    return () => window.clearTimeout(timer);
  }, [isPlaying, stepIndex, result, speedMs]);

  const currentStep = result && result.steps.length > 0 ? result.steps[stepIndex] : null;
  const isFinalStep = result ? stepIndex >= result.steps.length - 1 : false;
  const meta = ALGORITHM_META[result?.algorithm ?? algorithm];

  // Track previously examined indices up to current step
  const visitedSet = useMemo(() => {
    const set = new Set<number>();
    if (!result) return set;
    for (let i = 0; i < stepIndex; i++) {
      set.add(result.steps[i].index);
    }
    return set;
  }, [result, stepIndex]);

  // Active recursion stack frames up to currentStep
  const callStackFrames = useMemo(() => {
    if (!result || result.algorithm !== 'binary_recursive') return [];
    return result.steps.slice(0, stepIndex + 1);
  }, [result, stepIndex]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeSearch(isbnInput, algorithm);
  };

  const showFullArrayGrid = stats.size > 0 && stats.size <= 64 && windowItems.length === stats.size;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800/80 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">
          Search Algorithms &amp; Execution Visualizer
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Execute Linear, Iterative Binary, and Recursive Binary searches in native C and step through the exact key comparisons and pointer movements.
        </p>
      </div>

      {/* Controls Bar */}
      <section className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Algorithm Segmented Control */}
          <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-[#080E1E] p-1 border border-slate-800">
            {(['linear', 'binary_iterative', 'binary_recursive'] as const).map((algo) => (
              <button
                key={algo}
                type="button"
                onClick={() => {
                  setAlgorithm(algo);
                  if (isbnInput.trim()) {
                    void executeSearch(isbnInput, algo);
                  }
                }}
                className={`rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  algorithm === algo
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {ALGORITHM_META[algo].label}
              </button>
            ))}
          </div>

          {/* Scenario Target Presets */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">Test scenario:</span>
            {quickTargets.first && (
              <button
                type="button"
                onClick={() => {
                  setIsbnInput(quickTargets.first!);
                  void executeSearch(quickTargets.first!, algorithm);
                }}
                className="rounded border border-slate-700/80 bg-[#080E1E] px-2.5 py-1.5 font-medium text-slate-300 hover:border-blue-500/60 hover:text-white whitespace-nowrap shrink-0"
              >
                First Element (Linear Best)
              </button>
            )}
            {quickTargets.mid && (
              <button
                type="button"
                onClick={() => {
                  setIsbnInput(quickTargets.mid!);
                  void executeSearch(quickTargets.mid!, algorithm);
                }}
                className="rounded border border-slate-700/80 bg-[#080E1E] px-2.5 py-1.5 font-medium text-slate-300 hover:border-blue-500/60 hover:text-white whitespace-nowrap shrink-0"
              >
                Midpoint (Binary Best)
              </button>
            )}
            {quickTargets.last && (
              <button
                type="button"
                onClick={() => {
                  setIsbnInput(quickTargets.last!);
                  void executeSearch(quickTargets.last!, algorithm);
                }}
                className="rounded border border-slate-700/80 bg-[#080E1E] px-2.5 py-1.5 font-medium text-slate-300 hover:border-blue-500/60 hover:text-white whitespace-nowrap shrink-0"
              >
                Last Element
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setIsbnInput(quickTargets.missing);
                void executeSearch(quickTargets.missing, algorithm);
              }}
              className="rounded border border-slate-700/80 bg-[#080E1E] px-2.5 py-1.5 font-medium text-amber-300 hover:border-amber-500/60 whitespace-nowrap shrink-0"
            >
              Missing ISBN (Worst Case)
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={isbnInput}
              onChange={(e) => setIsbnInput(e.target.value)}
              placeholder="Enter ISBN to search (e.g. 978-0-262-03384-8)"
              className="w-full rounded-lg border border-slate-700/80 bg-[#080E1E] py-2.5 pl-10 pr-4 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {loading ? 'Running C Search...' : 'Run & Visualize Search'}
          </button>
        </form>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </section>

      {/* Search Result Metrics Summary */}
      {result && (
        <section className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5 space-y-5">
          <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-slate-100">{meta.label}</span>
                <span className="text-slate-600">·</span>
                <span className="font-mono text-xs text-sky-300">Query: {result.queryIsbn}</span>
                <span className="text-slate-600">·</span>
                <span
                  className={`font-semibold ${
                    result.found ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {result.found ? `Found at Index [${result.index}]` : 'Not Found in Catalogue'}
                </span>
              </div>
              {result.found && result.book ? (
                <p className="text-sm text-slate-300">
                  {result.book.title} <span className="text-slate-500">by</span> {result.book.author}{' '}
                  <span className="text-slate-500">·</span>{' '}
                  <span className="font-mono text-xs text-slate-300 tabular-nums">
                    {result.book.copies} available copies
                  </span>
                </p>
              ) : (
                <p className="text-sm text-slate-400">
                  Target ISBN does not exist in the {stats.size.toLocaleString()}-record catalogue.
                </p>
              )}
            </div>
            <div className="text-xs font-mono text-slate-400 whitespace-nowrap">
              Time: {meta.bestTime} / {meta.avgTime} / {meta.worstTime} · Space: {meta.space}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-slate-400">Key Comparisons</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-slate-50 tabular-nums">
                {result.comparisons.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Execution Time (C Clock)</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-sky-300 tabular-nums">
                {result.elapsedUs.toFixed(2)} µs
              </div>
              <div className="font-mono text-xs text-slate-500 tabular-nums">
                {result.elapsedMs.toFixed(5)} ms
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Record Exists</div>
              <div
                className={`mt-1 text-2xl font-semibold ${
                  result.found ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {result.found ? 'Yes' : 'No'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">
                {result.algorithm === 'binary_recursive'
                  ? 'Recursive Calls / Stack Depth'
                  : 'Auxiliary Space'}
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold text-slate-50 tabular-nums">
                {result.algorithm === 'binary_recursive'
                  ? `${result.recursiveCalls} / ${result.maxRecursionDepth}`
                  : 'O(1)'}
              </div>
              {result.algorithm === 'binary_recursive' && (
                <div className="text-xs text-slate-500">O(log n) call-stack frames</div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Interactive Step-by-Step Visualizer */}
      {result && result.steps.length > 0 && currentStep && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <section
            className={`rounded-xl border border-slate-800/90 bg-[#0E172E] p-5 space-y-5 ${
              result.algorithm === 'binary_recursive' ? 'xl:col-span-8' : 'xl:col-span-12'
            }`}
          >
            {/* Playback Controls */}
            <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  Step-by-Step Execution Trace
                </h2>
                <p className="text-xs text-slate-400 font-mono tabular-nums">
                  Step {stepIndex + 1} of {result.steps.length}
                  {result.traceTruncated
                    ? ` (showing first ${result.steps.length} of ${result.comparisons.toLocaleString()} total probes)`
                    : ''}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setStepIndex(0);
                  }}
                  aria-label="Reset playback"
                  className="rounded-lg border border-slate-700 bg-[#080E1E] p-2 text-slate-300 hover:bg-[#13203D]"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={stepIndex <= 0}
                  onClick={() => {
                    setIsPlaying(false);
                    setStepIndex((p) => Math.max(0, p - 1));
                  }}
                  aria-label="Previous step"
                  className="rounded-lg border border-slate-700 bg-[#080E1E] p-2 text-slate-300 hover:bg-[#13203D] disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (stepIndex >= result.steps.length - 1) {
                      setStepIndex(0);
                      setIsPlaying(true);
                    } else {
                      setIsPlaying((p) => !p);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500 whitespace-nowrap shrink-0"
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {isPlaying ? 'Pause' : stepIndex >= result.steps.length - 1 ? 'Replay' : 'Play'}
                </button>
                <button
                  type="button"
                  disabled={stepIndex >= result.steps.length - 1}
                  onClick={() => {
                    setIsPlaying(false);
                    setStepIndex((p) => Math.min(result.steps.length - 1, p + 1));
                  }}
                  aria-label="Next step"
                  className="rounded-lg border border-slate-700 bg-[#080E1E] p-2 text-slate-300 hover:bg-[#13203D] disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                {/* Speed control */}
                <div className="ml-1 inline-flex items-center rounded-lg border border-slate-700 bg-[#080E1E] p-0.5">
                  {SPEED_OPTIONS.map((sp) => (
                    <button
                      key={sp.label}
                      type="button"
                      onClick={() => setSpeedMs(sp.ms)}
                      className={`rounded px-2 py-1 font-mono text-xs transition-colors whitespace-nowrap ${
                        speedMs === sp.ms
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Active Step Narration */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#080E1E] border border-slate-800 px-4 py-3 text-sm">
              <div className="space-y-0.5">
                <div className="font-mono text-xs text-slate-400 tabular-nums">
                  {result.algorithm === 'linear' ? (
                    <>Examining index i = {currentStep.index}</>
                  ) : (
                    <>
                      Bounds: low = {currentStep.low}, mid = {currentStep.mid}, high = {currentStep.high}
                      {result.algorithm === 'binary_recursive'
                        ? ` · recursion depth = ${currentStep.depth}`
                        : ''}
                    </>
                  )}
                </div>
                <div className="font-mono text-sm text-slate-100">
                  strcmp(&quot;{currentStep.isbn}&quot;, &quot;{result.queryIsbn}&quot;) →{' '}
                  {currentStep.cmp === 0 ? (
                    <span className="font-semibold text-emerald-400">0 (Exact Match!)</span>
                  ) : currentStep.cmp < 0 ? (
                    <span className="text-amber-300">
                      &lt; 0 ({result.algorithm === 'linear' ? 'continue to next index' : 'discard left half → low = mid + 1'})
                    </span>
                  ) : (
                    <span className="text-sky-300">
                      &gt; 0 ({result.algorithm === 'linear' ? 'continue to next index' : 'discard right half → high = mid - 1'})
                    </span>
                  )}
                </div>
              </div>
              {isFinalStep && (
                <div
                  className={`text-xs font-semibold ${
                    result.found ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {result.found ? 'Search Completed: Match Confirmed' : 'Search Exhausted: ISBN Absent'}
                </div>
              )}
            </div>

            {/* Array Visualization: Full Interactive Cell Grid for <= 64 records */}
            {showFullArrayGrid ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span>Legend:</span>
                  <span className="text-sky-300 font-medium">Blue = Active Examined / Mid</span>
                  <span className="text-emerald-400 font-medium">Green = Matched ISBN</span>
                  <span className="text-blue-300 font-medium">Outlined = Active Search Window</span>
                  <span className="text-slate-600 font-medium">Dimmed = Pruned / Checked</span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {windowItems.map((item) => {
                    const idx = item.index;
                    const isCurrent = idx === currentStep.index;
                    const isMatch = isCurrent && currentStep.cmp === 0;
                    const inBinaryRange =
                      result.algorithm !== 'linear' &&
                      idx >= currentStep.low &&
                      idx <= currentStep.high;
                    const isVisited = visitedSet.has(idx);
                    const isLow = result.algorithm !== 'linear' && idx === currentStep.low;
                    const isHigh = result.algorithm !== 'linear' && idx === currentStep.high;
                    const isMid = result.algorithm !== 'linear' && idx === currentStep.mid;

                    let cardClass =
                      'border-slate-800 bg-[#080E1E]/60 text-slate-500 opacity-45';
                    if (isMatch) {
                      cardClass =
                        'border-emerald-400 bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/50 opacity-100';
                    } else if (isCurrent) {
                      cardClass =
                        'border-sky-400 bg-blue-600/25 text-white ring-1 ring-sky-400/60 opacity-100';
                    } else if (result.algorithm === 'linear') {
                      cardClass = isVisited
                        ? 'border-amber-500/30 bg-amber-950/20 text-slate-400 opacity-70'
                        : 'border-slate-800 bg-[#0A1328] text-slate-300 opacity-95';
                    } else if (inBinaryRange) {
                      cardClass = 'border-blue-500/40 bg-[#122040] text-slate-100 opacity-100';
                    }

                    const pointers: string[] = [];
                    if (result.algorithm === 'linear' && isCurrent) pointers.push('i');
                    if (isLow) pointers.push('L');
                    if (isMid) pointers.push('M');
                    if (isHigh) pointers.push('H');

                    return (
                      <div
                        key={item.isbn}
                        className={`rounded-lg border p-2.5 transition-all duration-150 ${cardClass}`}
                      >
                        <div className="flex items-center justify-between font-mono text-[11px] tabular-nums">
                          <span>[{idx}]</span>
                          {pointers.length > 0 && (
                            <span className="font-semibold text-sky-300">
                              {pointers.join('/')}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 truncate font-mono text-[11px]" title={item.isbn}>
                          {item.isbn}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] opacity-75" title={item.title}>
                          {item.title}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Proportional Index-Space Visualizer for Large Datasets (> 64 records) */
              <div className="space-y-4">
                <div className="text-xs text-slate-400">
                  Index-Space Search Range across {stats.size.toLocaleString()} sorted records
                </div>
                <div className="relative h-14 w-full rounded-lg border border-slate-800 bg-[#080E1E] overflow-hidden">
                  {/* Active Search Range Bar */}
                  {result.algorithm !== 'linear' ? (
                    <div
                      className="absolute top-0 bottom-0 bg-blue-500/25 border-x border-blue-400/70 transition-all duration-200"
                      style={{
                        left: `${(currentStep.low / Math.max(1, stats.size - 1)) * 100}%`,
                        width: `${Math.max(
                          1.2,
                          ((currentStep.high - currentStep.low + 1) / Math.max(1, stats.size)) * 100
                        )}%`,
                      }}
                    />
                  ) : (
                    <div
                      className="absolute top-0 bottom-0 left-0 bg-amber-500/20 border-r border-amber-400 transition-all duration-200"
                      style={{
                        width: `${Math.max(
                          1.2,
                          ((currentStep.index + 1) / Math.max(1, stats.size)) * 100
                        )}%`,
                      }}
                    />
                  )}
                  {/* Current Examined Marker */}
                  <div
                    className={`absolute top-0 bottom-0 w-1 transition-all duration-200 ${
                      currentStep.cmp === 0 ? 'bg-emerald-400' : 'bg-sky-400'
                    }`}
                    style={{
                      left: `${(currentStep.index / Math.max(1, stats.size - 1)) * 100}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between font-mono text-xs text-slate-400 tabular-nums">
                  <span>0</span>
                  <span>
                    Active window: [{currentStep.low.toLocaleString()} .. {currentStep.high.toLocaleString()}] ({(currentStep.high - currentStep.low + 1).toLocaleString()} records)
                  </span>
                  <span>{(stats.size - 1).toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Step-by-step Comparison Log */}
            <div className="border-t border-slate-800 pt-4">
              <h3 className="mb-2.5 text-xs font-semibold text-slate-400">
                Comparison History (Up to Current Step)
              </h3>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-800 bg-[#080E1E]">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="sticky top-0 bg-[#13203D] text-slate-400">
                    <tr>
                      <th className="py-2 px-3">Step</th>
                      <th className="py-2 px-3">Index</th>
                      <th className="py-2 px-3">Window [low, high]</th>
                      <th className="py-2 px-3">Examined ISBN</th>
                      <th className="py-2 px-3 text-right">strcmp Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {result.steps.slice(0, stepIndex + 1).map((st) => (
                      <tr
                        key={st.step}
                        onClick={() => {
                          setIsPlaying(false);
                          setStepIndex(st.step - 1);
                        }}
                        className={`cursor-pointer transition-colors ${
                          st.step - 1 === stepIndex
                            ? 'bg-blue-600/20 text-slate-50'
                            : 'text-slate-400 hover:bg-[#13203D]/50'
                        }`}
                      >
                        <td className="py-2 px-3 tabular-nums">{st.step}</td>
                        <td className="py-2 px-3 tabular-nums">[{st.index}]</td>
                        <td className="py-2 px-3 tabular-nums">
                          [{st.low.toLocaleString()}, {st.high.toLocaleString()}]
                        </td>
                        <td className="py-2 px-3 text-sky-300">{st.isbn}</td>
                        <td className="py-2 px-3 text-right">
                          {st.cmp === 0 ? (
                            <span className="text-emerald-400">Match (== 0)</span>
                          ) : st.cmp < 0 ? (
                            <span className="text-amber-300">Less (&lt; 0)</span>
                          ) : (
                            <span className="text-sky-300">Greater (&gt; 0)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Recursive Call Stack Visualization Panel */}
          {result.algorithm === 'binary_recursive' && (
            <section className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5 xl:col-span-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-100">
                    Recursive Call Stack
                  </h2>
                  <p className="text-xs text-slate-400">
                    Active stack frames · Space Complexity O(log n)
                  </p>
                </div>
                <Layers className="h-4 w-4 text-emerald-400" />
              </div>

              <div className="space-y-2">
                {callStackFrames
                  .slice()
                  .reverse()
                  .map((frame, i) => {
                    const isTop = i === 0;
                    return (
                      <div
                        key={frame.step}
                        className={`rounded-lg border p-3 font-mono text-xs transition-all ${
                          isTop
                            ? 'border-emerald-400/70 bg-emerald-950/30 text-emerald-100'
                            : 'border-slate-800 bg-[#080E1E] text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">
                            Frame #{frame.depth} {isTop ? '(Active)' : ''}
                          </span>
                          <span className="tabular-nums">mid = {frame.mid}</span>
                        </div>
                        <div className="mt-1 text-[11px] opacity-85 tabular-nums">
                          search(low={frame.low.toLocaleString()}, high={frame.high.toLocaleString()})
                        </div>
                        <div className="mt-0.5 text-[11px] text-sky-300 truncate">
                          mid ISBN: {frame.isbn}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
