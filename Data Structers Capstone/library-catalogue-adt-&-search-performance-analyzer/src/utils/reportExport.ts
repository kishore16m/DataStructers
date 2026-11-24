import { ALGORITHM_META, STUDENT_INFO } from '../types';
import type { BenchmarkRow } from '../types';

function escapeCsvCell(val: string | number): string {
  const s = String(val);
  // Neutralize CSV formula injection if cell begins with spreadsheet operator
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function exportBenchmarkCsv(rows: BenchmarkRow[], measuredAt: string | null): void {
  const lines: string[] = [
    [escapeCsvCell('Project Title'), escapeCsvCell(STUDENT_INFO.projectTitle)].join(','),
    [escapeCsvCell('Student Name'), escapeCsvCell(STUDENT_INFO.name)].join(','),
    [escapeCsvCell('Registration Number'), escapeCsvCell(STUDENT_INFO.regNumber)].join(','),
    [escapeCsvCell('Course'), escapeCsvCell(`${STUDENT_INFO.course} (${STUDENT_INFO.courseCode})`)].join(','),
    [escapeCsvCell('Measured Timestamp'), escapeCsvCell(measuredAt ?? new Date().toISOString())].join(','),
    [escapeCsvCell('Execution Backend'), escapeCsvCell('Native Compiled C ADT (GCC -O2, CLOCK_MONOTONIC)')].join(','),
    '',
    [
      'Catalogue Size',
      'Search Algorithm',
      'Best Comparisons',
      'Average Comparisons',
      'Worst Comparisons',
      'Best Time (us)',
      'Average Time (us)',
      'Worst Time (us)',
      'Best Trials',
      'Average Trials',
      'Worst Trials',
      'Worst Recursive Calls',
      'Worst Stack Depth',
      'Time Complexity (Best / Avg / Worst)',
      'Space Complexity',
    ]
      .map(escapeCsvCell)
      .join(','),
  ];

  for (const row of rows) {
    const meta = ALGORITHM_META[row.algorithm];
    lines.push(
      [
        row.size,
        meta.label,
        row.best.comparisons,
        row.average.comparisons.toFixed(2),
        row.worst.comparisons,
        row.best.timeUs.toFixed(4),
        row.average.timeUs.toFixed(4),
        row.worst.timeUs.toFixed(4),
        row.best.trials,
        row.average.trials,
        row.worst.trials,
        row.worst.recursiveCalls,
        row.worst.stackDepth,
        `${meta.bestTime} / ${meta.avgTime} / ${meta.worstTime}`,
        meta.space,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `library-catalogue-benchmark-${STUDENT_INFO.regNumber}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildInlineSvgChart(
  rows: BenchmarkRow[],
  metric: 'time' | 'comparisons',
  title: string,
  unitLabel: string
): string {
  const sizes = Array.from(new Set(rows.map((r) => r.size))).sort((a, b) => a - b);
  if (sizes.length === 0) return '';

  const width = 680;
  const height = 260;
  const padL = 70;
  const padR = 24;
  const padT = 34;
  const padB = 42;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const algos: Array<'linear' | 'binary_iterative' | 'binary_recursive'> = [
    'linear',
    'binary_iterative',
    'binary_recursive',
  ];

  let maxVal = 1;
  for (const r of rows) {
    const v = metric === 'time' ? r.worst.timeUs : r.worst.comparisons;
    if (v > maxVal) maxVal = v;
  }

  const xPos = (i: number) =>
    sizes.length === 1 ? padL + plotW / 2 : padL + (i / (sizes.length - 1)) * plotW;
  const yPos = (val: number) => padT + plotH - (val / maxVal) * plotH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((frac) => {
      const y = padT + plotH - frac * plotH;
      const val = maxVal * frac;
      const label = metric === 'time' ? val.toFixed(1) : Math.round(val).toLocaleString();
      return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="#CBD5E1" stroke-dasharray="3,3" stroke-width="1"/>
      <text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#475569" font-family="monospace">${label}</text>`;
    })
    .join('');

  const xLabels = sizes
    .map(
      (sz, i) =>
        `<text x="${xPos(i).toFixed(1)}" y="${height - 16}" text-anchor="middle" font-size="10" fill="#475569" font-family="monospace">${(sz / 1000).toFixed(0)}k</text>`
    )
    .join('');

  const seriesPaths = algos
    .map((algo) => {
      const color = ALGORITHM_META[algo].color;
      const pts = sizes
        .map((sz, i) => {
          const found = rows.find((r) => r.size === sz && r.algorithm === algo);
          const v = found ? (metric === 'time' ? found.worst.timeUs : found.worst.comparisons) : 0;
          return `${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`;
        })
        .join(' ');
      const dots = sizes
        .map((sz, i) => {
          const found = rows.find((r) => r.size === sz && r.algorithm === algo);
          const v = found ? (metric === 'time' ? found.worst.timeUs : found.worst.comparisons) : 0;
          return `<circle cx="${xPos(i).toFixed(1)}" cy="${yPos(v).toFixed(1)}" r="3.5" fill="${color}"/>`;
        })
        .join('');
      return `<polyline fill="none" stroke="${color}" stroke-width="2.2" points="${pts}"/>${dots}`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:8px;">
    <text x="${padL}" y="20" font-size="12" font-weight="600" fill="#0F172A" font-family="sans-serif">${escapeHtml(title)} (${escapeHtml(unitLabel)})</text>
    ${gridLines}
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#64748B" stroke-width="1"/>
    <line x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}" stroke="#64748B" stroke-width="1"/>
    ${xLabels}
    ${seriesPaths}
  </svg>`;
}

export function exportHtmlReport(rows: BenchmarkRow[], measuredAt: string | null): void {
  const timeChart = buildInlineSvgChart(
    rows,
    'time',
    'Catalogue Size vs Worst-Case Execution Time',
    'microseconds'
  );
  const cmpChart = buildInlineSvgChart(
    rows,
    'comparisons',
    'Catalogue Size vs Worst-Case Key Comparisons',
    'comparisons'
  );

  const tableRows = rows
    .map((r) => {
      const meta = ALGORITHM_META[r.algorithm];
      return `<tr>
        <td>${r.size.toLocaleString()}</td>
        <td>${escapeHtml(meta.label)}</td>
        <td class="num">${r.best.comparisons}</td>
        <td class="num">${r.average.comparisons.toFixed(1)}</td>
        <td class="num">${r.worst.comparisons.toLocaleString()}</td>
        <td class="num">${r.best.timeUs.toFixed(3)} µs</td>
        <td class="num">${r.average.timeUs.toFixed(3)} µs</td>
        <td class="num">${r.worst.timeUs.toFixed(3)} µs</td>
        <td>${meta.bestTime} / ${meta.avgTime} / ${meta.worstTime}</td>
        <td>${meta.space}</td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(STUDENT_INFO.projectTitle)} — Performance Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0F172A; margin: 32px auto; max-width: 1020px; padding: 0 24px; line-height: 1.5; }
  h1 { margin: 0 0 6px; font-size: 24px; color: #0B1936; }
  h2 { margin-top: 28px; font-size: 16px; color: #1E3A8A; border-bottom: 1px solid #CBD5E1; padding-bottom: 6px; }
  .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 24px; background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 8px; padding: 14px 18px; margin: 16px 0 24px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
  th, td { border: 1px solid #CBD5E1; padding: 7px 10px; text-align: left; }
  th { background: #0F172A; color: #FFFFFF; font-weight: 600; }
  tr:nth-child(even) { background: #F8FAFC; }
  .num { text-align: right; font-family: ui-monospace, monospace; }
  .charts { display: grid; grid-template-columns: 1fr; gap: 18px; margin-top: 14px; }
  .legend { display: flex; gap: 20px; font-size: 12px; margin-top: 8px; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
  .footer { margin-top: 32px; font-size: 12px; color: #64748B; border-top: 1px solid #E2E8F0; padding-top: 12px; }
</style>
</head>
<body>
  <h1>${escapeHtml(STUDENT_INFO.projectTitle)}</h1>
  <div style="color:#475569;font-size:14px;">Measured Native C ADT Search Performance Analysis Report</div>
  <div class="meta">
    <div><strong>Student Name:</strong> ${escapeHtml(STUDENT_INFO.name)}</div>
    <div><strong>Registration Number:</strong> ${escapeHtml(STUDENT_INFO.regNumber)}</div>
    <div><strong>Course:</strong> ${escapeHtml(STUDENT_INFO.course)} (${escapeHtml(STUDENT_INFO.courseCode)})</div>
    <div><strong>Measured Timestamp:</strong> ${escapeHtml(measuredAt ?? new Date().toISOString())}</div>
    <div><strong>Implementation:</strong> Encapsulated C ADT (book_catalogue.h / book_catalogue.c)</div>
    <div><strong>Timing Method:</strong> POSIX CLOCK_MONOTONIC (Multi-Trial Mean)</div>
  </div>

  <h2>1. Theoretical Time &amp; Space Complexity</h2>
  <table>
    <thead>
      <tr><th>Algorithm</th><th>Best Case</th><th>Average Case</th><th>Worst Case</th><th>Auxiliary Space</th></tr>
    </thead>
    <tbody>
      <tr><td>Linear Search</td><td>O(1)</td><td>O(n)</td><td>O(n)</td><td>O(1)</td></tr>
      <tr><td>Iterative Binary Search</td><td>O(1)</td><td>O(log n)</td><td>O(log n)</td><td>O(1)</td></tr>
      <tr><td>Recursive Binary Search</td><td>O(1)</td><td>O(log n)</td><td>O(log n)</td><td>O(log n)</td></tr>
    </tbody>
  </table>

  <h2>2. Empirical Performance Comparison Charts (Worst Case)</h2>
  <div class="legend">
    <span><span class="dot" style="background:#F59E0B"></span>Linear Search</span>
    <span><span class="dot" style="background:#3B82F6"></span>Iterative Binary Search</span>
    <span><span class="dot" style="background:#10B981"></span>Recursive Binary Search</span>
  </div>
  <div class="charts">
    ${timeChart}
    ${cmpChart}
  </div>

  <h2>3. Measured Benchmark Data (Identical Sorted Datasets)</h2>
  <table>
    <thead>
      <tr>
        <th>Catalogue Size</th>
        <th>Search Algorithm</th>
        <th class="num">Best Cmp</th>
        <th class="num">Avg Cmp</th>
        <th class="num">Worst Cmp</th>
        <th class="num">Best Time</th>
        <th class="num">Avg Time</th>
        <th class="num">Worst Time</th>
        <th>Time Complexity</th>
        <th>Space</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div class="footer">
    Generated directly from native compiled C ADT execution (GCC -O2). Open in any browser and press Ctrl/Cmd+P to save as PDF.
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `library-catalogue-report-${STUDENT_INFO.regNumber}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
