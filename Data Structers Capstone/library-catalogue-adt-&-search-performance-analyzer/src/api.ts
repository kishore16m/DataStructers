import type {
  BenchmarkRow,
  BookRecord,
  CatalogueStats,
  MutationMetrics,
  QuickTargets,
  SearchAlgorithm,
  SearchResponse,
} from './types';

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? `Request failed with status ${res.status}`);
  }
  return data;
}

export interface StatsResponse {
  ok: boolean;
  stats: CatalogueStats;
  quickTargets: QuickTargets;
  engineMode: string;
  compiler: string;
  persistenceFile: string;
}

export interface BooksListResponse {
  ok: boolean;
  stats: CatalogueStats;
  totalFiltered: number;
  page: number;
  limit: number;
  books: BookRecord[];
}

export interface BookWindowResponse {
  ok: boolean;
  size: number;
  items: BookRecord[];
}

export interface MutationResponse {
  ok: boolean;
  metrics?: MutationMetrics;
  elapsedUs?: number;
  stats: CatalogueStats;
}

export interface BenchmarkApiResponse {
  ok: boolean;
  results: BenchmarkRow[];
  measuredAt: string;
  engineMode: string;
}

export interface SourceFilesResponse {
  ok: boolean;
  files: Record<string, string>;
}

export async function fetchStats(): Promise<StatsResponse> {
  return parseJson<StatsResponse>(await fetch('/api/stats'));
}

export async function fetchBooks(params: {
  page: number;
  limit: number;
  sortBy: 'isbn' | 'title' | 'author' | 'copies';
  sortDir: 'asc' | 'desc';
  filter: string;
}): Promise<BooksListResponse> {
  const qs = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sortBy: params.sortBy,
    sortDir: params.sortDir,
    filter: params.filter,
  });
  return parseJson<BooksListResponse>(await fetch(`/api/books?${qs.toString()}`));
}

export async function fetchBookWindow(): Promise<BookWindowResponse> {
  return parseJson<BookWindowResponse>(await fetch('/api/books/window'));
}

export async function insertBook(payload: {
  isbn: string;
  title: string;
  author: string;
  copies: number;
  position?: number | null;
}): Promise<MutationResponse> {
  return parseJson<MutationResponse>(
    await fetch('/api/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  );
}

export async function updateBookCopies(isbn: string, copies: number): Promise<MutationResponse> {
  return parseJson<MutationResponse>(
    await fetch(`/api/books/${encodeURIComponent(isbn)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ copies }),
    })
  );
}

export async function deleteBook(isbn: string): Promise<MutationResponse> {
  return parseJson<MutationResponse>(
    await fetch(`/api/books/${encodeURIComponent(isbn)}`, {
      method: 'DELETE',
    })
  );
}

export async function searchCatalogue(payload: {
  algorithm: SearchAlgorithm;
  isbn: string;
  captureTrace?: boolean;
}): Promise<SearchResponse> {
  return parseJson<SearchResponse>(
    await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  );
}

export async function resetDemoDataset(): Promise<{ ok: boolean; stats: CatalogueStats }> {
  return parseJson<{ ok: boolean; stats: CatalogueStats }>(
    await fetch('/api/dataset/reset', { method: 'POST' })
  );
}

export async function generateDataset(count: number): Promise<{ ok: boolean; stats: CatalogueStats }> {
  return parseJson<{ ok: boolean; stats: CatalogueStats }>(
    await fetch('/api/dataset/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count }),
    })
  );
}

export async function runBenchmark(sizes: number[]): Promise<BenchmarkApiResponse> {
  return parseJson<BenchmarkApiResponse>(
    await fetch('/api/benchmark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sizes }),
    })
  );
}

export async function fetchSourceFiles(): Promise<SourceFilesResponse> {
  return parseJson<SourceFilesResponse>(await fetch('/api/source-files'));
}
