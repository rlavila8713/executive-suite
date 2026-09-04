/** Download a UTF-8 CSV (Excel-friendly BOM). */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]): void {
  const escape = (value: string | number): string => {
    const s = String(value);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = [header.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Open a print-ready table in a new window (Save as PDF from the browser dialog). */
export function printTableDocument(
  title: string,
  subtitle: string,
  columns: string[],
  rows: string[][],
): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  const thead = columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const tbody = rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  @page { margin: 12mm; }
  body { margin: 0; font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; color: #1a1a1a; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 0 0 16px; color: #555; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 12px; }
  th { text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px; color: #555; }
  td.num, th.num { text-align: right; }
</style></head><body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(subtitle)}</p>
  <table><thead><tr>${thead}</tr></thead><tbody>${tbody || `<tr><td colspan="${columns.length}">—</td></tr>`}</tbody></table>
</body></html>`);
  w.document.close();
  const triggerPrint = () => {
    w.focus();
    try {
      w.print();
    } catch {
      /* ignore */
    }
  };
  if (w.document.readyState === 'complete') {
    setTimeout(triggerPrint, 150);
  } else {
    w.addEventListener('load', () => setTimeout(triggerPrint, 150));
  }
  return true;
}
