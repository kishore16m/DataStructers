import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, Terminal } from 'lucide-react';
import { fetchSourceFiles } from '../api';

const FILE_ORDER = ['book_catalogue.h', 'book_catalogue.c', 'main.c', 'Makefile'] as const;

const FILE_DESCRIPTIONS: Record<string, string> = {
  'book_catalogue.h':
    'Public ADT interface declaring Book struct, opaque Catalogue handle, and all public function prototypes.',
  'book_catalogue.c':
    'Private ADT implementation containing the encapsulated dynamic array, realloc grow/shrink, shifting, all 3 search algorithms, and CLOCK_MONOTONIC benchmarking.',
  'main.c':
    'Client driver strictly obeying ADT encapsulation; supports both standalone CLI evaluation mode and persistent JSON-RPC engine mode.',
  Makefile: 'Standard GNU Make build script compiling with gcc -O2 -Wall -Wextra -std=c11.',
};

export function CSourceExplorer() {
  const [files, setFiles] = useState<Record<string, string>>({});
  const [activeFile, setActiveFile] = useState<string>('book_catalogue.h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchSourceFiles()
      .then((res) => {
        if (mounted) {
          setFiles(res.files);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unable to load C source files');
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const code = files[activeFile] ?? '';
  const lines = code.split('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800/80 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">
          C ADT Source Code &amp; Compilation Guide
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Live source files compiled by GCC and executed natively by this dashboard. Inspect the opaque ADT boundary and standalone terminal build commands.
        </p>
      </div>

      {/* Compilation & Execution Instructions */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Terminal className="h-4 w-4 text-blue-400" />
            Compile &amp; Execute Standalone C Program
          </div>
          <p className="text-xs text-slate-400">
            Run from the <code className="font-mono text-slate-300">c_src/</code> directory on any Linux/macOS/WSL terminal with GCC installed:
          </p>
          <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-[#080E1E] p-3.5 font-mono text-xs text-sky-300 leading-relaxed">
{`# Option 1: Using Makefile
make -C c_src run

# Option 2: Direct GCC invocation
gcc -O2 -Wall -Wextra -std=c11 -o catalogue_engine c_src/main.c c_src/book_catalogue.c
./catalogue_engine`}
          </pre>
        </div>

        <div className="rounded-xl border border-slate-800/90 bg-[#0E172E] p-5 space-y-3">
          <div className="text-sm font-semibold text-slate-100">
            ADT Encapsulation &amp; Memory Architecture
          </div>
          <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
            <li>
              <span className="font-semibold text-sky-300">Opaque Pointer Encapsulation:</span>{' '}
              <code className="font-mono">book_catalogue.h</code> declares only{' '}
              <code className="font-mono">typedef struct Catalogue Catalogue;</code>. The struct body lives strictly in{' '}
              <code className="font-mono">book_catalogue.c</code>, so <code className="font-mono">main.c</code> cannot touch internal array pointers directly.
            </li>
            <li>
              <span className="font-semibold text-sky-300">Dynamic Growth &amp; Shrinkage:</span>{' '}
              Capacity doubles via <code className="font-mono">realloc</code> when full and halves when utilization falls to &le;25% (minimum 16 slots), avoiding thrashing.
            </li>
            <li>
              <span className="font-semibold text-sky-300">Sorted Invariant:</span>{' '}
              Insertion locates the exact ascending ISBN slot via binary lower-bound, rejects duplicates, and shifts trailing records with <code className="font-mono">memmove</code>.
            </li>
          </ul>
        </div>
      </section>

      {/* File Viewer */}
      <section className="rounded-xl border border-slate-800/90 bg-[#0E172E] overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-800 bg-[#13203D]/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILE_ORDER.map((fname) => (
              <button
                key={fname}
                type="button"
                onClick={() => setActiveFile(fname)}
                className={`rounded-md px-3 py-1.5 font-mono text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeFile === fname
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {fname}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              disabled={!code}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#080E1E] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-[#14203E] disabled:opacity-40 whitespace-nowrap"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!code}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#080E1E] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-[#14203E] disabled:opacity-40 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
          </div>
        </div>

        <div className="border-b border-slate-800/80 px-4 py-2.5 text-xs text-slate-400">
          {FILE_DESCRIPTIONS[activeFile]} · <span className="font-mono tabular-nums">{lines.length} lines</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading C source files...</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-400">{error}</div>
        ) : (
          <div className="max-h-[600px] overflow-auto bg-[#070C1A] p-4">
            <pre className="font-mono text-xs leading-6 text-slate-200">
              {lines.map((line, i) => (
                <div key={i} className="table-row">
                  <span className="table-cell select-none pr-4 text-right text-slate-600 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="table-cell whitespace-pre">{line}</span>
                </div>
              ))}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
}
