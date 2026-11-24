export type SearchAlgorithm = 'linear' | 'binary_iterative' | 'binary_recursive';

export interface BookRecord {
  index: number;
  isbn: string;
  title: string;
  author: string;
  copies: number;
}

export interface CatalogueStats {
  size: number;
  capacity: number;
  totalCopies: number;
  memoryBytes: number;
  loadFactor: number;
}

export interface QuickTargets {
  first: string | null;
  mid: string | null;
  last: string | null;
  missing: string;
}

export interface MutationMetrics {
  finalIndex: number;
  shiftCount: number;
  capacityChanged: number; // 1 = expanded, -1 = shrunk, 0 = unchanged
  oldCapacity: number;
  newCapacity: number;
  elapsedUs: number;
}

export interface SearchStep {
  step: number;
  index: number;
  low: number;
  high: number;
  mid: number;
  depth: number;
  cmp: number;
  isbn: string;
}

export interface SearchResponse {
  ok: boolean;
  algorithm: SearchAlgorithm;
  queryIsbn: string;
  found: boolean;
  index: number;
  comparisons: number;
  recursiveCalls: number;
  maxRecursionDepth: number;
  elapsedUs: number;
  elapsedMs: number;
  book: BookRecord | null;
  traceTruncated: boolean;
  steps: SearchStep[];
  error?: string;
}

export interface BenchmarkCaseMetrics {
  trials: number;
  comparisons: number;
  timeUs: number;
  recursiveCalls: number;
  stackDepth: number;
}

export interface BenchmarkRow {
  size: number;
  algorithm: SearchAlgorithm;
  best: BenchmarkCaseMetrics;
  average: BenchmarkCaseMetrics;
  worst: BenchmarkCaseMetrics;
}

export type ActiveTab =
  | 'overview'
  | 'catalogue'
  | 'visualizer'
  | 'benchmark'
  | 'source';

export const STUDENT_INFO = {
  name: 'MOLAGAMODI KISHORE',
  regNumber: '192411062',
  course: 'Data Structures',
  courseCode: 'CSA 0306',
  projectTitle: 'Library Catalogue ADT and Search Performance Analyzer',
} as const;

export const ALGORITHM_META: Record<
  SearchAlgorithm,
  {
    label: string;
    shortLabel: string;
    bestTime: string;
    avgTime: string;
    worstTime: string;
    space: string;
    color: string;
  }
> = {
  linear: {
    label: 'Linear Search',
    shortLabel: 'Linear',
    bestTime: 'O(1)',
    avgTime: 'O(n)',
    worstTime: 'O(n)',
    space: 'O(1)',
    color: '#F59E0B',
  },
  binary_iterative: {
    label: 'Iterative Binary Search',
    shortLabel: 'Iterative Binary',
    bestTime: 'O(1)',
    avgTime: 'O(log n)',
    worstTime: 'O(log n)',
    space: 'O(1)',
    color: '#3B82F6',
  },
  binary_recursive: {
    label: 'Recursive Binary Search',
    shortLabel: 'Recursive Binary',
    bestTime: 'O(1)',
    avgTime: 'O(log n)',
    worstTime: 'O(log n)',
    space: 'O(log n)',
    color: '#10B981',
  },
};

export const BENCHMARK_SIZES = [1000, 5000, 10000, 25000, 50000, 75000, 100000] as const;
