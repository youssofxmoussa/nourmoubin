const FONT_URL = "/__l5e/assets-v1/29e4c353-d377-469e-b18a-5d9316313f4d/thmanyahsans-Black.otf";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

type ExportInput = {
  title: string;
  sheet: string;
  labels: string[];
  rows: string[][];
};

/**
 * Renders the table into a hidden same-origin iframe sized to a 16:9
 * landscape page and triggers the browser print / save-as-PDF dialog.
 */
export function exportTableToPdf({ title, sheet, labels, rows }: ExportInput) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;inset:auto 0 0 auto;width:0;height:0;border:0;opacity:0;";
  document.body.appendChild(iframe);

  const head = labels.map((label) => `<th>${escapeHtml(label)}</th>`).join("");
  const body = rows
    .map(
      (row, index) =>
        `<tr class="${index % 2 ? "alt" : ""}">${labels
          .map((_, columnIndex) => `<td class="${columnIndex === 0 ? "num" : columnIndex === 1 ? "name" : ""}">${escapeHtml(row[columnIndex] ?? "")}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8" /><title>${escapeHtml(`${title} — ${sheet}`)}</title>
<style>
@font-face{font-family:"Thmanyah";src:url("${FONT_URL}") format("opentype");font-weight:900;font-display:block;}
@page{size:320mm 180mm;margin:9mm;}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
html,body{margin:0;padding:0;font-family:"Thmanyah","Tahoma",sans-serif;color:oklch(0.24 0.025 65);background:oklch(0.995 0.006 92);}
.page{width:302mm;height:162mm;display:flex;flex-direction:column;gap:5mm;}
header{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid oklch(0.48 0.105 164);padding-bottom:3mm;}
h1{margin:0;font-size:20pt;}
.meta{font-size:9.5pt;color:oklch(0.52 0.025 65);text-align:left;}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9.5pt;}
th,td{border:0.6pt solid oklch(0.88 0.028 88);padding:2.1mm 2.4mm;text-align:right;vertical-align:middle;word-wrap:break-word;}
thead th{background:oklch(0.48 0.105 164);color:oklch(0.99 0.005 92);font-size:9.5pt;}
tr.alt td{background:oklch(0.975 0.012 93);}
td.num{background:oklch(0.94 0.055 88);text-align:center;width:14mm;}
td.name{width:44mm;}
tfoot td{border:0;padding-top:3mm;font-size:8.5pt;color:oklch(0.52 0.025 65);}
</style></head>
<body><div class="page">
<header><h1>${escapeHtml(title)}</h1><div class="meta"><div>${escapeHtml(sheet)}</div><div>${escapeHtml(String(rows.length))} طالباً</div></div></header>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</div></body></html>`;

  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 800);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    const start = () => {
      win.focus();
      win.print();
      cleanup();
    };
    const fonts = (win.document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) {
      fonts.ready.then(start).catch(start);
    } else {
      window.setTimeout(start, 400);
    }
  };

  iframe.srcdoc = html;
}
