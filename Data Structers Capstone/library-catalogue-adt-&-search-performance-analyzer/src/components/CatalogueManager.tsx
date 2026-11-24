import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Edit3,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { deleteBook, fetchBooks, insertBook, updateBookCopies } from '../api';
import { BENCHMARK_SIZES } from '../types';
import type { BookRecord, CatalogueStats, MutationMetrics, SearchAlgorithm } from '../types';

interface CatalogueManagerProps {
  stats: CatalogueStats;
  onStatsUpdated: () => Promise<void>;
  onGenerateSize: (count: number) => Promise<void>;
  onResetDemo: () => Promise<void>;
  onInspectInVisualizer: (isbn: string, algorithm: SearchAlgorithm) => void;
  busyAction: string | null;
}

export function CatalogueManager({
  stats,
  onStatsUpdated,
  onGenerateSize,
  onResetDemo,
  onInspectInVisualizer,
  busyAction,
}: CatalogueManagerProps) {
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState<'isbn' | 'title' | 'author' | 'copies'>('isbn');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterInput, setFilterInput] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Insert form state
  const [isbn, setIsbn] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [copies, setCopies] = useState('5');
  const [position, setPosition] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Feedback banner for last C ADT operation
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    metrics?: MutationMetrics;
  } | null>(null);

  // Inline copy editor state
  const [editingIsbn, setEditingIsbn] = useState<string | null>(null);
  const [editCopiesVal, setEditCopiesVal] = useState('');

  const loadBooks = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const data = await fetchBooks({
        page,
        limit,
        sortBy,
        sortDir,
        filter: activeFilter,
      });
      setBooks(data.books);
      setTotalFiltered(data.totalFiltered);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load catalogue');
    } finally {
      setLoading(false);
    }
  }, [page, limit, sortBy, sortDir, activeFilter]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks, stats.size, stats.totalCopies]);

  // Debounce live search filter
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setActiveFilter(filterInput.trim());
    }, 180);
    return () => window.clearTimeout(timer);
  }, [filterInput]);

  const handleSort = (col: 'isbn' | 'title' | 'author' | 'copies') => {
    if (sortBy === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
    setPage(1);
  };

  const handleInsert = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const parsedCopies = Number(copies);
      const parsedPos = position.trim() === '' ? null : Number(position.trim());
      const res = await insertBook({
        isbn: isbn.trim(),
        title: title.trim(),
        author: author.trim(),
        copies: parsedCopies,
        position: parsedPos,
      });
      setFeedback({
        type: 'success',
        message: `Inserted ISBN ${isbn.trim()} at index [${res.metrics?.finalIndex ?? 0}] while preserving ascending ISBN order.`,
        metrics: res.metrics,
      });
      setIsbn('');
      setTitle('');
      setAuthor('');
      setCopies('5');
      setPosition('');
      await onStatsUpdated();
      await loadBooks();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Insert failed',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveCopies = async (targetIsbn: string) => {
    const parsed = Number(editCopiesVal);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100000) {
      setFeedback({ type: 'error', message: 'Copies must be an integer between 0 and 100,000.' });
      return;
    }
    try {
      const res = await updateBookCopies(targetIsbn, parsed);
      setEditingIsbn(null);
      setFeedback({
        type: 'success',
        message: `Updated copies for ISBN ${targetIsbn} to ${parsed} in ${(res.elapsedUs ?? 0).toFixed(2)} µs (ISBN order preserved).`,
      });
      await onStatsUpdated();
      await loadBooks();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Update failed',
      });
    }
  };

  const handleDelete = async (targetIsbn: string) => {
    setFeedback(null);
    try {
      const res = await deleteBook(targetIsbn);
      const shrinkNote =
        res.metrics && res.metrics.capacityChanged === -1
          ? ` Capacity automatically shrunk from ${res.metrics.oldCapacity} to ${res.metrics.newCapacity}.`
          : '';
      setFeedback({
        type: 'success',
        message: `Deleted ISBN ${targetIsbn} from index [${res.metrics?.finalIndex ?? 0}]. Shifted ${res.metrics?.shiftCount ?? 0} elements left.${shrinkNote}`,
        metrics: res.metrics,
      });
      await onStatsUpdated();
      await loadBooks();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Delete failed',
      });
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));

  const renderSortIcon = (col: 'isbn' | 'title' | 'author' | 'copies') => {
    if (sortBy !== col) return <ArrowUpDown className="h-3.5 w-3.5 text-slate-600" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-blue-400" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-blue-400" />
    );
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-col gap-4 border-b border-slate-800/80 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            Book Catalogue ADT Manager
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage records stored in the encapsulated C dynamic array. Size: <span className="font-mono text-slate-200 tabular-nums">{stats.size.toLocaleString()}</span> · Capacity: <span className="font-mono text-slate-200 tabular-nums">{stats.capacity.toLocaleString()}</span> · Persistent backend storage
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={async () => {
              await onResetDemo();
              setPage(1);
              setFeedback({ type: 'success', message: 'Catalogue reset to 24 curated university demonstration books.' });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0E172E] px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-[#14203E] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
            Reset 24 Demo Books
          </button>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0E172E] px-2.5 py-1">
            <Database className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            <span className="text-xs text-slate-400 whitespace-nowrap">Generate:</span>
            {BENCHMARK_SIZES.map((sz) => (
              <button
                key={sz}
                type="button"
                disabled={busyAction !== null}
                onClick={async () => {
                  await onGenerateSize(sz);
                  setPage(1);
                  setFeedback({
                    type: 'success',
                    message: `Generated ${sz.toLocaleString()} unique sorted records directly in C ADT memory.`,
                  });
                }}
                className="rounded px-2 py-1 font-mono text-xs text-slate-300 transition-colors hover:bg-blue-600 hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0 tabular-nums"
              >
                {sz >= 1000 ? `${sz / 1000}k` : sz}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Feedback Notification */}
      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`flex flex-col gap-2 rounded-xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${
            feedback.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-200'
              : 'border-red-500/30 bg-red-950/30 text-red-200'
          }`}
        >
          <div className="space-y-1">
            <p className="font-medium">{feedback.message}</p>
            {feedback.metrics && (
              <p className="font-mono text-xs opacity-85 tabular-nums">
                Index: {feedback.metrics.finalIndex} · Shifted: {feedback.metrics.shiftCount.toLocaleString()} elements · Capacity: {feedback.metrics.oldCapacity.toLocaleString()} → {feedback.metrics.newCapacity.toLocaleString()} · Elapsed: {feedback.metrics.elapsedUs.toFixed(2)} µs
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss message"
            className="self-end text-slate-400 hover:text-slate-200 sm:self-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Insert New Book Form */}
      <section className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-slate-100">
            Insert Book Record (Ascending ISBN Order)
          </h2>
          <p className="text-xs text-slate-400">
            Leave Target Index blank for automatic sorted placement, or specify an index to test order enforcement.
          </p>
        </div>

        <form onSubmit={handleInsert} className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <label htmlFor="book-isbn" className="mb-1 block text-xs font-medium text-slate-400">
              ISBN (Unique Key)
            </label>
            <input
              id="book-isbn"
              type="text"
              required
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              placeholder="978-0-13-449416-6"
              className="w-full rounded-lg border border-slate-700/80 bg-[#080E1E] px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="md:col-span-3">
            <label htmlFor="book-title" className="mb-1 block text-xs font-medium text-slate-400">
              Book Title
            </label>
            <input
              id="book-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Clean Architecture"
              className="w-full rounded-lg border border-slate-700/80 bg-[#080E1E] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="book-author" className="mb-1 block text-xs font-medium text-slate-400">
              Author Name
            </label>
            <input
              id="book-author"
              type="text"
              required
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Robert C. Martin"
              className="w-full rounded-lg border border-slate-700/80 bg-[#080E1E] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="md:col-span-1">
            <label htmlFor="book-copies" className="mb-1 block text-xs font-medium text-slate-400">
              Copies
            </label>
            <input
              id="book-copies"
              type="number"
              min={0}
              max={100000}
              required
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
              className="w-full rounded-lg border border-slate-700/80 bg-[#080E1E] px-3 py-2 font-mono text-sm text-slate-100 focus:border-blue-500 focus:outline-none tabular-nums"
            />
          </div>

          <div className="md:col-span-1">
            <label htmlFor="book-pos" className="mb-1 block text-xs font-medium text-slate-400">
              Index (Opt.)
            </label>
            <input
              id="book-pos"
              type="number"
              min={0}
              max={stats.size}
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="Auto"
              className="w-full rounded-lg border border-slate-700/80 bg-[#080E1E] px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none tabular-nums"
            />
          </div>

          <div className="flex items-end md:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              {submitting ? 'Inserting...' : 'Insert Book'}
            </button>
          </div>
        </form>
      </section>

      {/* Catalogue Traverse Table */}
      <section className="rounded-xl border border-slate-800/90 bg-[#0E172E]">
        <div className="flex flex-col gap-3 border-b border-slate-800/80 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filterInput}
              onChange={(e) => setFilterInput(e.target.value)}
              placeholder="Filter by ISBN, title, or author..."
              className="w-full rounded-lg border border-slate-700/80 bg-[#080E1E] py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="tabular-nums">
              Showing {totalFiltered === 0 ? 0 : (page - 1) * limit + 1}–{Math.min(page * limit, totalFiltered)} of {totalFiltered.toLocaleString()}
            </span>
            <select
              aria-label="Rows per page"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-md border border-slate-700 bg-[#080E1E] px-2.5 py-1.5 font-mono text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value={15}>15 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        </div>

        {listError && (
          <div className="p-6 text-center text-sm text-red-400">{listError}</div>
        )}

        {!listError && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-[#13203D]/60 text-xs font-medium text-slate-400">
                  <th className="py-3 pl-4 pr-3 w-16 font-mono">Idx</th>
                  <th className="py-3 px-3">
                    <button
                      type="button"
                      onClick={() => handleSort('isbn')}
                      className="inline-flex items-center gap-1.5 hover:text-slate-100"
                    >
                      ISBN {renderSortIcon('isbn')}
                    </button>
                  </th>
                  <th className="py-3 px-3">
                    <button
                      type="button"
                      onClick={() => handleSort('title')}
                      className="inline-flex items-center gap-1.5 hover:text-slate-100"
                    >
                      Book Title {renderSortIcon('title')}
                    </button>
                  </th>
                  <th className="py-3 px-3">
                    <button
                      type="button"
                      onClick={() => handleSort('author')}
                      className="inline-flex items-center gap-1.5 hover:text-slate-100"
                    >
                      Author {renderSortIcon('author')}
                    </button>
                  </th>
                  <th className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('copies')}
                      className="inline-flex items-center gap-1.5 hover:text-slate-100"
                    >
                      Copies {renderSortIcon('copies')}
                    </button>
                  </th>
                  <th className="py-3 pl-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {loading && books.length === 0 ? (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={idx}>
                      <td colSpan={6} className="px-4 py-3">
                        <div className="h-5 w-full animate-pulse rounded bg-slate-800/70" />
                      </td>
                    </tr>
                  ))
                ) : books.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <p className="text-sm font-medium text-slate-300">
                        {stats.size === 0
                          ? 'The catalogue ADT is currently empty.'
                          : 'No books match your current filter.'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Insert a new book above or reload the demonstration dataset.
                      </p>
                    </td>
                  </tr>
                ) : (
                  books.map((book) => {
                    const isEditing = editingIsbn === book.isbn;
                    return (
                      <tr
                        key={book.isbn}
                        className="transition-colors hover:bg-[#13203D]/45"
                      >
                        <td className="py-2.5 pl-4 pr-3 font-mono text-xs text-slate-500 tabular-nums">
                          {book.index}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs font-medium text-sky-300 whitespace-nowrap tabular-nums">
                          {book.isbn}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-100 max-w-xs truncate">
                          {book.title}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 max-w-[200px] truncate">
                          {book.author}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {isEditing ? (
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <input
                                type="number"
                                min={0}
                                max={100000}
                                value={editCopiesVal}
                                onChange={(e) => setEditCopiesVal(e.target.value)}
                                className="w-20 rounded border border-blue-500 bg-[#080E1E] px-2 py-1 text-right font-mono text-xs text-slate-100 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => void handleSaveCopies(book.isbn)}
                                aria-label="Save copies"
                                className="rounded p-1 text-emerald-400 hover:bg-emerald-500/15"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingIsbn(null)}
                                aria-label="Cancel edit"
                                className="rounded p-1 text-slate-400 hover:bg-slate-700/50"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-100">{book.copies}</span>
                          )}
                        </td>
                        <td className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onInspectInVisualizer(book.isbn, 'binary_iterative')}
                              title="Trace search for this ISBN"
                              className="rounded px-2 py-1 text-xs text-blue-400 hover:bg-blue-500/15 hover:text-blue-300"
                            >
                              Trace
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingIsbn(book.isbn);
                                setEditCopiesVal(String(book.copies));
                              }}
                              title="Update copies"
                              aria-label={`Update copies for ${book.isbn}`}
                              className="rounded p-1.5 text-slate-400 hover:bg-slate-700/60 hover:text-slate-100"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(book.isbn)}
                              title="Delete book by ISBN"
                              aria-label={`Delete ${book.isbn}`}
                              className="rounded p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 px-4 py-3 text-xs text-slate-400">
          <div className="font-mono tabular-nums">
            Page {page} of {totalPages.toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(1)}
              className="rounded-md border border-slate-700 bg-[#080E1E] px-2.5 py-1.5 text-slate-300 hover:bg-[#13203D] disabled:opacity-40"
            >
              First
            </button>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-[#080E1E] px-2.5 py-1.5 text-slate-300 hover:bg-[#13203D] disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-[#080E1E] px-2.5 py-1.5 text-slate-300 hover:bg-[#13203D] disabled:opacity-40"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
              className="rounded-md border border-slate-700 bg-[#080E1E] px-2.5 py-1.5 text-slate-300 hover:bg-[#13203D] disabled:opacity-40"
            >
              Last
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
