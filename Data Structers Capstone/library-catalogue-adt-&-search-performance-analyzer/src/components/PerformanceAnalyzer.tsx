import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, FileText, Play, RefreshCw } from 'lucide-react';
import { runBenchmark } from '../api';
import { ALGORITHM_META, BENCHMARK_SIZES } from '../types';
import type { BenchmarkRow, SearchAlgorithm } from '../types';
import { exportBenchmarkCsv, exportHtmlReport } from '../utils/reportExport';

interface PerformanceAnalyzerProps {
  benchmarkRows: BenchmarkRow[];
  measuredAt: string | null;
  onBenchmarkComplete: (rows: BenchmarkRow[], measuredAt: string) => void;
}

type ScenarioCase = 'best' | 'average' | 'worst';

const THEORETICAL_TABLE = [
  {
    algorithm: 'Linear Search',
    best: 'O(1)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    notes: 'Sequential scan; works on unsorted or sorted arrays.',
  },
  {
    algorithm: 'Iterative Binary',
    best: 'O(1)',
    average: 'O(log n)',
    worst: 'O(log n)',
    space: 'O(1)',
    notes: 'Halves sorted ISBN range using low/high/mid in a constant-space loop.',
  },
  {
    algorithm: 'Recursive Binary',
    best: 'O(1)',
    average: 'O(log n)',
    worst: 'O(log n)',
    space: 'O(log n)',
    notes: 'Halves sorted ISBN range recursively; consumes O(log n) call-stack frames.',
  },
] as const;

export function PerformanceAnalyzer({
  benchmarkRows,
  measuredAt,
  onBenchmarkComplete,
}: PerformanceAnalyzerProps) {
  const [selectedSizes, setSelectedSizes] = useState<number[]>([...BENCHMARK_SIZES]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [trendCase, setTrendCase] = useState<ScenarioCase>('worst');
  const [scaleMode, setScaleMode] = useState<'linear' | 'log'>('linear');
  const [barMetric, setBarMetric] = useState<'time' | 'comparisons'>('time');
  const [inspectSize, setInspectSize] = useState<number>(100000);

  const executeSuite = useCallback(
    async (sizesToRun: number[]) => {
      if (sizesToRun.length === 0) {
        setError('Select at least one dataset size to benchmark.');
        return;
      }
      setRunning(true);
      setError(null);
      try {
        const data = await runBenchmark(sizesToRun);
        onBenchmarkComplete(data.results, data.measuredAt);
        const maxSize = Math.max(...sizesToRun);
        setInspectSize(maxSize);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Benchmark failed');
      } finally {
        setRunning(false);
      }
    },
    [onBenchmarkComplete]
  );

  // Auto-run full benchmark suite on first visit if empty
  useEffect(() => {
    if (benchmarkRows.length === 0 && !running) {
      void executeSuite([...BENCHMARK_SIZES]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSize = (sz: number) => {
    setSelectedSizes((prev) =>
      prev.includes(sz) ? prev.filter((s) => s !== sz) : [...prev, sz].sort((a, b) => a - b)
    );
  };

  const availableSizes = useMemo(
    () => Array.from(new Set(benchmarkRows.map((r) => r.size))).sort((a, b) => a - b),
    [benchmarkRows]
  );

  useEffect(() => {
    if (availableSizes.length > 0 && !availableSizes.includes(inspectSize)) {
      setInspectSize(availableSizes[availableSizes.length - 1]);
    }
  }, [availableSizes, inspectSize]);

  // 1 & 2. Time & Comparisons vs Catalogue Size chart series
  const sizeSeriesData = useMemo(() => {
    return availableSizes.map((sz) => {
      const getVal = (algo: SearchAlgorithm, field: 'timeUs' | 'comparisons') => {
        const row = benchmarkRows.find((r) => r.size === sz && r.algorithm === algo);
        if (!row) return 0;
        const raw = row[trendCase][field];
        if (scaleMode === 'log') {
          return Math.max(raw, 0.01);
        }
        return raw;
      };
      return {
        size: sz,
        label: `${(sz / 1000).toFixed(0)}k`,
        linearTime: Number(getVal('linear', 'timeUs').toFixed(4)),
        iterTime: Number(getVal('binary_iterative', 'timeUs').toFixed(4)),
        recTime: Number(getVal('binary_recursive', 'timeUs').toFixed(4)),
        linearCmp: Number(getVal('linear', 'comparisons').toFixed(2)),
        iterCmp: Number(getVal('binary_iterative', 'comparisons').toFixed(2)),
        recCmp: Number(getVal('binary_recursive', 'comparisons').toFixed(2)),
      };
    });
  }, [availableSizes, benchmarkRows, trendCase, scaleMode]);

  // 3. Algorithm comparison at selected dataset size
  const algoComparisonData = useMemo(() => {
    const rowsForSize = benchmarkRows.filter((r) => r.size === inspectSize);
    return (['linear', 'binary_iterative', 'binary_recursive'] as const).map((algo) => {
      const row = rowsForSize.find((r) => r.algorithm === algo);
      return {
        name: ALGORITHM_META[algo].shortLabel,
        best: row ? Number((barMetric === 'time' ? row.best.timeUs : row.best.comparisons).toFixed(3)) : 0,
        average: row
          ? Number((barMetric === 'time' ? row.average.timeUs : row.average.comparisons).toFixed(3))
          : 0,
        worst: row ? Number((barMetric === 'time' ? row.worst.timeUs : row.worst.comparisons).toFixed(3)) : 0,
      };
    });
  }, [benchmarkRows, inspectSize, barMetric]);

  // 4. Case comparison (Best vs Average vs Worst) across algorithms
  const caseComparisonData = useMemo(() => {
    const rowsForSize = benchmarkRows.filter((r) => r.size === inspectSize);
    const getRow = (algo: SearchAlgorithm) => rowsForSize.find((r) => r.algorithm === algo);
    const lin = getRow('linear');
    const iter = getRow('binary_iterative');
    const rec = getRow('binary_recursive');

    const pick = (r: BenchmarkRow | undefined, sc: ScenarioCase) =>
      r ? Number((barMetric === 'time' ? r[sc].timeUs : r[sc].comparisons).toFixed(3)) : 0;

    return [
      {
        scenario: 'Best Case',
        Linear: pick(lin, 'best'),
        'Iterative Binary': pick(iter, 'best'),
        'Recursive Binary': pick(rec, 'best'),
      },
      {
        scenario: 'Average Case',
        Linear: pick(lin, 'average'),
        'Iterative Binary': pick(iter, 'average'),
        'Recursive Binary': pick(rec, 'average'),
      },
      {
        scenario: 'Worst Case',
        Linear: pick(lin, 'worst'),
        'Iterative Binary': pick(iter, 'worst'),
        'Recursive Binary': pick(rec, 'worst'),
      },
    ];
  }, [benchmarkRows, inspectSize, barMetric]);

  // Speedup summary at largest measured size
  const speedupSummary = useMemo(() => {
    if (availableSizes.length === 0) return null;
    const maxSz = availableSizes[availableSizes.length - 1];
    const lin = benchmarkRows.find((r) => r.size === maxSz && r.algorithm === 'linear');
    const iter = benchmarkRows.find((r) => r.size === maxSz && r.algorithm === 'binary_iterative');
    const rec = benchmarkRows.find((r) => r.size === maxSz && r.algorithm === 'binary_recursive');
    if (!lin || !iter || !rec) return null;
    return {
      size: maxSz,
      cmpReduction: Math.round(lin.worst.comparisons / Math.max(1, iter.worst.comparisons)),
      timeSpeedup: Math.round(lin.worst.timeUs / Math.max(0.001, iter.worst.timeUs)),
      linWorstCmp: lin.worst.comparisons,
      iterWorstCmp: iter.worst.comparisons,
      recDepth: rec.worst.stackDepth,
    };
  }, [availableSizes, benchmarkRows]);

  return (
    <div className="space-y-6">
      {/* Header & Exports */}
      <div className="flex flex-col gap-4 border-b border-slate-800/80 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            Search Performance Analyzer
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Native C multi-trial empirical benchmarks using <code className="font-mono text-xs text-slate-300">CLOCK_MONOTONIC</code> on identical sorted datasets across 1,000 to 100,000 records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={benchmarkRows.length === 0}
            onClick={() => exportBenchmarkCsv(benchmarkRows, measuredAt)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0E172E] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-[#13203D] disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4 text-sky-400" />
            Export CSV Report
          </button>
          <button
            type="button"
            disabled={benchmarkRows.length === 0}
            onClick={() => exportHtmlReport(benchmarkRows, measuredAt)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0E172E] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-[#13203D] disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <FileText className="h-4 w-4 text-emerald-400" />
            Download Full Report
          </button>
        </div>
      </div>

      {/* Benchmark Configuration Panel */}
      <section className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-300">
                Select Catalogue Sizes to Benchmark:
              </span>
              <button
                type="button"
                onClick={() => setSelectedSizes([...BENCHMARK_SIZES])}
                className="text-xs text-blue-400 hover:text-blue-300 underline-offset-4 hover:underline"
              >
                Select All 7
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {BENCHMARK_SIZES.map((sz) => {
                const active = selectedSizes.includes(sz);
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => toggleSize(sz)}
                    className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-medium transition-colors tabular-nums whitespace-nowrap shrink-0 ${
                      active
                        ? 'border-blue-500 bg-blue-600/20 text-blue-200'
                        : 'border-slate-700/80 bg-[#080E1E] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sz.toLocaleString()}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            disabled={running || selectedSizes.length === 0}
            onClick={() => void executeSuite(selectedSizes)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {running ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Running Native C Suite...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run Benchmark Suite
              </>
            )}
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {/* Measured Empirical Headline Proof */}
        {speedupSummary && (
          <div className="grid grid-cols-1 gap-4 border-t border-slate-800 pt-4 sm:grid-cols-3">
            <div>
              <div className="text-xs text-slate-400">
                Worst-Case Comparisons at {speedupSummary.size.toLocaleString()} Records
              </div>
              <div className="mt-1 font-mono text-lg font-semibold text-slate-100 tabular-nums">
                {speedupSummary.linWorstCmp.toLocaleString()} vs {speedupSummary.iterWorstCmp}
              </div>
              <div className="text-xs text-emerald-400 font-mono tabular-nums">
                {speedupSummary.cmpReduction.toLocaleString()}x fewer key comparisons
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">
                Measured Latency Speedup (Worst Case)
              </div>
              <div className="mt-1 font-mono text-lg font-semibold text-sky-300 tabular-nums">
                {speedupSummary.timeSpeedup.toLocaleString()}x faster
              </div>
              <div className="text-xs text-slate-400">
                Iterative Binary vs Linear Search in C (-O2)
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">
                Recursive Binary Max Stack Depth
              </div>
              <div className="mt-1 font-mono text-lg font-semibold text-slate-100 tabular-nums">
                {speedupSummary.recDepth} frames
              </div>
              <div className="text-xs text-slate-400">
                Matches ⌊log₂({speedupSummary.size.toLocaleString()})⌋ + 1 space complexity
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Chart Display Controls */}
      {benchmarkRows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-slate-400">Growth Curve Scenario:</span>
              <div className="inline-flex rounded-lg border border-slate-800 bg-[#0E172E] p-1">
                {(['best', 'average', 'worst'] as const).map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => setTrendCase(sc)}
                    className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                      trendCase === sc
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {sc} Case
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-slate-400">Y-Axis Scale:</span>
              <div className="inline-flex rounded-lg border border-slate-800 bg-[#0E172E] p-1">
                {(['linear', 'log'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setScaleMode(mode)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      scaleMode === mode
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {mode === 'linear' ? 'Linear Scale' : 'Logarithmic Scale'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Charts 1 & 2: Growth Curves vs Catalogue Size */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {/* Chart 1: Catalogue Size vs Execution Time */}
            <section className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-slate-100">
                  1. Catalogue Size vs Execution Time ({trendCase} case)
                </h2>
                <p className="text-xs text-slate-400">
                  Measured mean native C execution time in microseconds (µs)
                </p>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sizeSeriesData} margin={{ top: 10, right: 16, left: 6, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="label" stroke="#94A3B8" fontSize={12} />
                    <YAxis
                      scale={scaleMode}
                      domain={scaleMode === 'log' ? [0.01, 'auto'] : [0, 'auto']}
                      allowDataOverflow
                      stroke="#94A3B8"
                      fontSize={12}
                      unit=" µs"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#080E1E',
                        borderColor: '#334155',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(val) => [
                        `${typeof val === 'number' ? val.toFixed(3) : String(val ?? 0)} µs`,
                        '',
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line
                      type="monotone"
                      dataKey="linearTime"
                      name="Linear Search"
                      stroke="#F59E0B"
                      strokeWidth={2.5}
                      dot={{ r: 3.5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="iterTime"
                      name="Iterative Binary"
                      stroke="#3B82F6"
                      strokeWidth={2.5}
                      dot={{ r: 3.5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="recTime"
                      name="Recursive Binary"
                      stroke="#10B981"
                      strokeWidth={2.5}
                      strokeDasharray="5 3"
                      dot={{ r: 3.5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Chart 2: Catalogue Size vs Number of Comparisons */}
            <section className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-slate-100">
                  2. Catalogue Size vs Key Comparisons ({trendCase} case)
                </h2>
                <p className="text-xs text-slate-400">
                  Exact <code className="font-mono">strcmp()</code> evaluations counted inside C ADT
                </p>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sizeSeriesData} margin={{ top: 10, right: 16, left: 10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="label" stroke="#94A3B8" fontSize={12} />
                    <YAxis
                      scale={scaleMode}
                      domain={scaleMode === 'log' ? [1, 'auto'] : [0, 'auto']}
                      allowDataOverflow
                      stroke="#94A3B8"
                      fontSize={12}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#080E1E',
                        borderColor: '#334155',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(val) => [
                        typeof val === 'number' ? val.toLocaleString() : String(val ?? 0),
                        'comparisons',
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line
                      type="monotone"
                      dataKey="linearCmp"
                      name="Linear Search"
                      stroke="#F59E0B"
                      strokeWidth={2.5}
                      dot={{ r: 3.5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="iterCmp"
                      name="Iterative Binary"
                      stroke="#3B82F6"
                      strokeWidth={2.5}
                      dot={{ r: 3.5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="recCmp"
                      name="Recursive Binary"
                      stroke="#10B981"
                      strokeWidth={2.5}
                      strokeDasharray="5 3"
                      dot={{ r: 3.5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {/* Bar Chart Controls for Charts 3 & 4 */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-slate-400">Inspect Dataset Size:</span>
              <select
                aria-label="Inspect dataset size"
                value={inspectSize}
                onChange={(e) => setInspectSize(Number(e.target.value))}
                className="rounded-lg border border-slate-700 bg-[#0E172E] px-3 py-1.5 font-mono text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
              >
                {availableSizes.map((sz) => (
                  <option key={sz} value={sz}>
                    {sz.toLocaleString()} records
                  </option>
                ))}
              </select>
            </div>

            <div className="inline-flex rounded-lg border border-slate-800 bg-[#0E172E] p-1">
              <button
                type="button"
                onClick={() => setBarMetric('time')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  barMetric === 'time' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                Execution Time (µs)
              </button>
              <button
                type="button"
                onClick={() => setBarMetric('comparisons')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  barMetric === 'comparisons'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                Key Comparisons
              </button>
            </div>
          </div>

          {/* Charts 3 & 4: Direct Algorithm & Case Comparisons */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {/* Chart 3: Linear vs Iterative Binary vs Recursive Binary */}
            <section className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-slate-100">
                  3. Linear vs Iterative Binary vs Recursive Binary
                </h2>
                <p className="text-xs text-slate-400 font-mono tabular-nums">
                  Dataset n = {inspectSize.toLocaleString()} · Metric: {barMetric === 'time' ? 'Execution Time (µs)' : 'Comparisons'}
                </p>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={algoComparisonData} margin={{ top: 10, right: 16, left: 10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} />
                    <YAxis stroke="#94A3B8" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#080E1E',
                        borderColor: '#334155',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="best" name="Best Case" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="average" name="Average Case" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="worst" name="Worst Case" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Chart 4: Best Case vs Average Case vs Worst Case */}
            <section className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-slate-100">
                  4. Best Case vs Average Case vs Worst Case
                </h2>
                <p className="text-xs text-slate-400 font-mono tabular-nums">
                  Dataset n = {inspectSize.toLocaleString()} · Scenario breakdown across algorithms
                </p>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={caseComparisonData} margin={{ top: 10, right: 16, left: 10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="scenario" stroke="#94A3B8" fontSize={12} />
                    <YAxis stroke="#94A3B8" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#080E1E',
                        borderColor: '#334155',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="Linear" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Iterative Binary" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Recursive Binary" fill="#10B981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
        </>
      )}

      {/* Theoretical Asymptotic Complexity Table (Explicitly Distinguished) */}
      <section className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-100">
            Theoretical Asymptotic Complexity Reference
          </h2>
          <p className="text-xs text-slate-400">
            Mathematical Big-O bounds (distinct from the empirical C timings measured below).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-[#13203D]/60 text-xs font-medium text-slate-400">
                <th className="py-3 px-4">Algorithm</th>
                <th className="py-3 px-4 font-mono">Best Case</th>
                <th className="py-3 px-4 font-mono">Average Case</th>
                <th className="py-3 px-4 font-mono">Worst Case</th>
                <th className="py-3 px-4 font-mono">Space</th>
                <th className="py-3 px-4">Characteristics</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {THEORETICAL_TABLE.map((row) => (
                <tr key={row.algorithm} className="hover:bg-[#13203D]/40">
                  <td className="py-3 px-4 font-semibold text-slate-100">{row.algorithm}</td>
                  <td className="py-3 px-4 font-mono text-emerald-400">{row.best}</td>
                  <td className="py-3 px-4 font-mono text-sky-300">{row.average}</td>
                  <td className="py-3 px-4 font-mono text-amber-300">{row.worst}</td>
                  <td className="py-3 px-4 font-mono text-slate-200">{row.space}</td>
                  <td className="py-3 px-4 text-xs text-slate-400">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Measured Native C Benchmark Results Table */}
      {benchmarkRows.length > 0 && (
        <section className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Measured Empirical Results (Native C CLOCK_MONOTONIC)
              </h2>
              <p className="text-xs text-slate-400">
                Actual key comparison counts and multi-trial average execution times measured directly in compiled C.
              </p>
            </div>
            {measuredAt && (
              <div className="font-mono text-xs text-slate-500">
                Measured: {new Date(measuredAt).toLocaleTimeString()}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-[#13203D]/60 text-slate-400">
                  <th className="py-3 px-3">Size (n)</th>
                  <th className="py-3 px-3">Algorithm</th>
                  <th className="py-3 px-3 text-right">Best Cmp</th>
                  <th className="py-3 px-3 text-right">Avg Cmp</th>
                  <th className="py-3 px-3 text-right">Worst Cmp</th>
                  <th className="py-3 px-3 text-right">Best Time (µs)</th>
                  <th className="py-3 px-3 text-right">Avg Time (µs)</th>
                  <th className="py-3 px-3 text-right">Worst Time (µs)</th>
                  <th className="py-3 px-3 text-right">Trials (B/A/W)</th>
                  <th className="py-3 px-3 text-right">Max Depth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                {benchmarkRows.map((row) => (
                  <tr
                    key={`${row.size}-${row.algorithm}`}
                    className="hover:bg-[#13203D]/40 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-semibold text-slate-100">
                      {row.size.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-200">
                      {ALGORITHM_META[row.algorithm].label}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400">
                      {row.best.comparisons}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-200">
                      {row.average.comparisons.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-300">
                      {row.worst.comparisons.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {row.best.timeUs.toFixed(3)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-sky-300">
                      {row.average.timeUs.toFixed(3)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-sky-200 font-semibold">
                      {row.worst.timeUs.toFixed(3)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-500">
                      {row.best.trials}/{row.average.trials}/{row.worst.trials}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-400">
                      {row.algorithm === 'binary_recursive' ? row.worst.stackDepth : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
