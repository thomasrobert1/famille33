// Export CSV compatible Excel en français : séparateur « ; » et BOM UTF-8.
export function toCsv(rows, columns) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    // Neutralise les formules (=, +, -, @) pour éviter l'injection dans le tableur
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = columns.map((c) => escape(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => escape(c.get ? c.get(r) : r[c.key])).join(';'));
  return `\ufeff${[header, ...body].join('\r\n')}\r\n`;
}
