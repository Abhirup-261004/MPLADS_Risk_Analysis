export function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadCsv(filename, columns, rows) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  downloadFile(filename, [columns.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n'), 'text/csv;charset=utf-8');
}

export function downloadSvg(filename, title, points) {
  const width = 720;
  const height = 360;
  const max = Math.max(...points.map((point) => point.value), 1);
  const polyline = points.map((point, index) => `${55 + (index * 600) / Math.max(points.length - 1, 1)},${300 - (point.value / max) * 210}`).join(' ');
  const labels = points.map((point, index) => `<text x="${55 + (index * 600) / Math.max(points.length - 1, 1)}" y="330" text-anchor="middle">${point.label}</text>`).join('');
  downloadFile(filename, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f6f7f9"/><text x="40" y="45" font-family="Arial" font-size="22" font-weight="700" fill="#152b4b">${title}</text><line x1="55" y1="300" x2="655" y2="300" stroke="#aeb8c5"/><polyline points="${polyline}" fill="none" stroke="#152b4b" stroke-width="4"/>${labels}</svg>`, 'image/svg+xml');
}

export function downloadPdf(filename, title, lines) {
  const escape = (value) => String(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const body = [`BT /F1 18 Tf 54 760 Td (${escape(title)}) Tj /F1 10 Tf 0 -30 Td`, ...lines.slice(0, 34).map((line) => `0 -16 Td (${escape(line)}) Tj`), 'ET'].join('\n');
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${body.length} >>\nstream\n${body}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  downloadFile(filename, pdf, 'application/pdf');
}
