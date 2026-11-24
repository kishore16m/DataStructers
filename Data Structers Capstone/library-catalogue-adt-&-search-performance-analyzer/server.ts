import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const ROOT_DIR = process.cwd();
const C_SRC_DIR = path.resolve(ROOT_DIR, 'c_src');
const DATA_DIR = path.resolve(ROOT_DIR, 'data');
const DATA_FILE = path.resolve(DATA_DIR, 'catalogue.tsv');
const BINARY_PATH = path.resolve(C_SRC_DIR, 'catalogue_engine');

const ALLOWED_BENCHMARK_SIZES = new Set([1000, 5000, 10000, 25000, 50000, 75000, 100000]);
const ALLOWED_ALGORITHMS = new Set(['linear', 'binary_iterative', 'binary_recursive']);
const ALLOWED_SORT_BY = new Set(['isbn', 'title', 'author', 'copies']);
const ALLOWED_SORT_DIR = new Set(['asc', 'desc']);

function sanitizeField(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\t\r\n\0]/g, ' ').trim();
  if (cleaned.length === 0 || cleaned.length >= maxLen) return null;
  return cleaned;
}

function ensureCompiledBinary(): void {
  const headerPath = path.resolve(C_SRC_DIR, 'book_catalogue.h');
  const implPath = path.resolve(C_SRC_DIR, 'book_catalogue.c');
  const mainPath = path.resolve(C_SRC_DIR, 'main.c');

  let needsCompile = !fs.existsSync(BINARY_PATH);
  if (!needsCompile) {
    const binMtime = fs.statSync(BINARY_PATH).mtimeMs;
    const srcMtime = Math.max(
      fs.statSync(headerPath).mtimeMs,
      fs.statSync(implPath).mtimeMs,
      fs.statSync(mainPath).mtimeMs
    );
    if (srcMtime > binMtime) {
      needsCompile = true;
    }
  }

  if (needsCompile) {
    execFileSync(
      'gcc',
      ['-O2', '-Wall', '-Wextra', '-std=c11', '-o', BINARY_PATH, mainPath, implPath],
      { cwd: C_SRC_DIR, stdio: 'pipe' }
    );
  }
}

interface PendingCommand {
  command: string;
  resolve: (value: Record<string, unknown>) => void;
  reject: (err: Error) => void;
}

class NativeCatalogueEngine {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: readline.Interface | null = null;
  private ready = false;
  private queue: PendingCommand[] = [];
  private active: PendingCommand | null = null;

  async start(): Promise<void> {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    ensureCompiledBinary();

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(BINARY_PATH, ['--server', DATA_FILE], {
        cwd: ROOT_DIR,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.proc = proc;

      const rl = readline.createInterface({ input: proc.stdout });
      this.rl = rl;

      let settled = false;

      rl.on('line', (line: string) => {
        if (!settled) {
          settled = true;
          try {
            const handshake = JSON.parse(line) as { ready?: boolean };
            if (handshake.ready) {
              this.ready = true;
              resolve();
              this.drainQueue();
              return;
            }
          } catch {
            // Fall through to reject
          }
          reject(new Error('C engine failed startup handshake'));
          return;
        }

        const current = this.active;
        this.active = null;
        if (current) {
          try {
            const parsed = JSON.parse(line) as Record<string, unknown>;
            current.resolve(parsed);
          } catch (err) {
            current.reject(
              err instanceof Error ? err : new Error('Invalid JSON response from C engine')
            );
          }
        }
        this.drainQueue();
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        console.error('[C Engine stderr]', chunk.toString());
      });

      proc.on('exit', (code) => {
        this.ready = false;
        this.proc = null;
        this.rl?.close();
        this.rl = null;
        if (!settled) {
          settled = true;
          reject(new Error(`C engine exited during startup with code ${code ?? -1}`));
        }
        if (this.active) {
          this.active.reject(new Error('C engine process restarted unexpectedly'));
          this.active = null;
        }
      });

      proc.on('error', (err) => {
        this.ready = false;
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
    });
  }

  private drainQueue(): void {
    if (!this.ready || !this.proc || this.active || this.queue.length === 0) {
      return;
    }
    const next = this.queue.shift()!;
    this.active = next;
    this.proc.stdin.write(`${next.command}\n`);
  }

  async send(command: string): Promise<Record<string, unknown>> {
    if (!this.ready || !this.proc) {
      await this.start();
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ command, resolve, reject });
      this.drainQueue();
    });
  }

  stop(): void {
    if (this.proc) {
      try {
        this.proc.stdin.write('QUIT\n');
      } catch {
        // Ignore write error during shutdown
      }
      this.proc.kill();
      this.proc = null;
    }
  }
}

async function startServer(): Promise<void> {
  const engine = new NativeCatalogueEngine();
  await engine.start();

  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/stats', async (_req: Request, res: Response) => {
    try {
      const data = await engine.send('STATS');
      res.json({
        ...data,
        engineMode: 'native-c-adt',
        compiler: 'GCC (C11 -O2)',
        persistenceFile: 'data/catalogue.tsv',
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Engine error' });
    }
  });

  app.get('/api/books', async (req: Request, res: Response) => {
    try {
      const pageRaw = Number(req.query.page ?? 1);
      const limitRaw = Number(req.query.limit ?? 20);
      const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
      const limit = Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= 200 ? limitRaw : 20;

      const sortBy =
        typeof req.query.sortBy === 'string' && ALLOWED_SORT_BY.has(req.query.sortBy)
          ? req.query.sortBy
          : 'isbn';
      const sortDir =
        typeof req.query.sortDir === 'string' && ALLOWED_SORT_DIR.has(req.query.sortDir)
          ? req.query.sortDir
          : 'asc';
      const filter =
        typeof req.query.filter === 'string'
          ? req.query.filter.replace(/[\t\r\n\0]/g, ' ').trim().slice(0, 80)
          : '';

      const data = await engine.send(`LIST\t${page}\t${limit}\t${sortBy}\t${sortDir}\t${filter}`);
      res.json(data);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Engine error' });
    }
  });

  app.get('/api/books/window', async (_req: Request, res: Response) => {
    try {
      const data = await engine.send('WINDOW');
      res.json(data);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Engine error' });
    }
  });

  app.post('/api/books', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const isbn = sanitizeField(body.isbn, 32);
      const title = sanitizeField(body.title, 128);
      const author = sanitizeField(body.author, 96);
      const copies = Number(body.copies);

      if (!isbn || !title || !author) {
        res.status(400).json({
          ok: false,
          error: 'ISBN, Book Title, and Author Name are required valid text fields.',
        });
        return;
      }
      if (!Number.isInteger(copies) || copies < 0 || copies > 100000) {
        res.status(400).json({
          ok: false,
          error: 'Number of copies must be an integer between 0 and 100,000.',
        });
        return;
      }

      let posArg = '';
      if (body.position !== undefined && body.position !== null && body.position !== '') {
        const pos = Number(body.position);
        if (!Number.isInteger(pos) || pos < 0) {
          res.status(400).json({
            ok: false,
            error: 'Target insertion position must be a non-negative integer.',
          });
          return;
        }
        posArg = String(pos);
      }

      const cmd = posArg
        ? `INSERT\t${isbn}\t${title}\t${author}\t${copies}\t${posArg}`
        : `INSERT\t${isbn}\t${title}\t${author}\t${copies}`;
      const data = await engine.send(cmd);
      if (!data.ok) {
        res.status(400).json(data);
        return;
      }
      res.status(201).json(data);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Engine error' });
    }
  });

  app.put('/api/books/:isbn', async (req: Request, res: Response) => {
    try {
      const isbn = sanitizeField(decodeURIComponent(req.params.isbn ?? ''), 32);
      const body = req.body as Record<string, unknown>;
      const copies = Number(body.copies);

      if (!isbn) {
        res.status(400).json({ ok: false, error: 'Valid ISBN is required.' });
        return;
      }
      if (!Number.isInteger(copies) || copies < 0 || copies > 100000) {
        res.status(400).json({
          ok: false,
          error: 'Copies must be an integer between 0 and 100,000.',
        });
        return;
      }

      const data = await engine.send(`UPDATE\t${isbn}\t${copies}`);
      if (!data.ok) {
        res.status(404).json(data);
        return;
      }
      res.json(data);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Engine error' });
    }
  });

  app.delete('/api/books/:isbn', async (req: Request, res: Response) => {
    try {
      const isbn = sanitizeField(decodeURIComponent(req.params.isbn ?? ''), 32);
      if (!isbn) {
        res.status(400).json({ ok: false, error: 'Valid ISBN is required.' });
        return;
      }

      const data = await engine.send(`DELETE\t${isbn}`);
      if (!data.ok) {
        res.status(404).json(data);
        return;
      }
      res.json(data);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Engine error' });
    }
  });

  app.post('/api/search', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const algorithm =
        typeof body.algorithm === 'string' && ALLOWED_ALGORITHMS.has(body.algorithm)
          ? body.algorithm
          : null;
      const isbn = sanitizeField(body.isbn, 32);
      const captureTrace = body.captureTrace === false ? 0 : 1;

      if (!algorithm) {
        res.status(400).json({
          ok: false,
          error: 'Algorithm must be linear, binary_iterative, or binary_recursive.',
        });
        return;
      }
      if (!isbn) {
        res.status(400).json({ ok: false, error: 'Please enter a valid ISBN to search.' });
        return;
      }

      const data = await engine.send(`SEARCH\t${algorithm}\t${isbn}\t${captureTrace}`);
      if (!data.ok) {
        res.status(400).json(data);
        return;
      }
      res.json(data);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Engine error' });
    }
  });

  app.post('/api/dataset/reset', async (_req: Request, res: Response) => {
    try {
      const data = await engine.send('RESET_DEMO');
      res.json(data);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Engine error' });
    }
  });

  app.post('/api/dataset/generate', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const count = Number(body.count);
      if (!Number.isInteger(count) || count < 1 || count > 100000) {
        res.status(400).json({
          ok: false,
          error: 'Dataset size must be an integer between 1 and 100,000.',
        });
        return;
      }

      const data = await engine.send(`GENERATE\t${count}`);
      res.json(data);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Engine error' });
    }
  });

  app.post('/api/benchmark', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const requested = Array.isArray(body.sizes) ? body.sizes : [];
      const validSizes = requested
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && ALLOWED_BENCHMARK_SIZES.has(n));

      const uniqueSorted = Array.from(new Set(validSizes)).sort((a, b) => a - b);
      if (uniqueSorted.length === 0) {
        res.status(400).json({
          ok: false,
          error: 'Select at least one valid benchmark size (1,000 to 100,000).',
        });
        return;
      }

      const data = await engine.send(`BENCHMARK\t${uniqueSorted.join(',')}`);
      res.json({
        ...data,
        measuredAt: new Date().toISOString(),
        engineMode: 'native-c-adt',
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Engine error' });
    }
  });

  app.get('/api/source-files', (_req: Request, res: Response) => {
    const allowedFiles = ['book_catalogue.h', 'book_catalogue.c', 'main.c', 'Makefile'];
    const files: Record<string, string> = {};
    for (const name of allowedFiles) {
      const fullPath = path.resolve(C_SRC_DIR, name);
      if (!fullPath.startsWith(C_SRC_DIR + path.sep)) continue;
      if (fs.existsSync(fullPath)) {
        files[name] = fs.readFileSync(fullPath, 'utf-8');
      }
    }
    res.json({ ok: true, files });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Library Catalogue ADT Server listening on http://localhost:${PORT}`);
  });

  const cleanup = () => {
    engine.stop();
    server.close();
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
