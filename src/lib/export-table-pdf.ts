const FONT_URL = "/__l5e/assets-v1/29e4c353-d377-469e-b18a-5d9316313f4d/thmanyahsans-Black.otf";

import { formatStudentCount } from "@/lib/student-count";

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type ExportInput = { title: string; sheet: string; labels: string[]; rows: string[][]; categories: ("num" | "name" | "memorization")[]; photos?: (string | undefined)[] };
type CardInput = { title: string; sheet: string; labels: string[]; row: string[]; photo?: string };

async function embedImage(url?: string) {
  if (!url) return "";
  try {
    const response = await fetch(url);
    if (!response.ok) return "";
    const blob = await response.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

function printHtml(html: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;inset:auto 0 0 auto;width:0;height:0;border:0;opacity:0;";
  document.body.appendChild(iframe);
  const cleanup = () => window.setTimeout(() => iframe.remove(), 800);
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    const start = () => { win.focus(); win.print(); cleanup(); };
    const fonts = (win.document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) fonts.ready.then(start).catch(start); else window.setTimeout(start, 400);
  };
  iframe.srcdoc = html;
}

export async function exportTableToPdf({ title, sheet, labels, rows, categories, photos = [] }: ExportInput) {
  const embeddedPhotos = await Promise.all(photos.map(embedImage));
  const head = labels.map((label) => `<th>${escapeHtml(label)}</th>`).join("");
  const body = rows.map((row, rowIndex) => `<tr>${labels.map((_, columnIndex) => {
    const category = categories[columnIndex] ?? "memorization";
    const photo = category === "name" && embeddedPhotos[rowIndex] ? `<img src="${embeddedPhotos[rowIndex]}" alt="" />` : "";
    return `<td class="${category}"><div class="cell">${photo}<span>${escapeHtml(row[columnIndex] ?? "")}</span></div></td>`;
  }).join("")}</tr>`).join("");
  printHtml(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(`${title} — ${sheet}`)}</title><style>
 @font-face{font-family:Thmanyah;src:url("${FONT_URL}") format("opentype");font-weight:900}@page{size:320mm 180mm;margin:9mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{min-height:100%;background:#e6f3e8}body{margin:0;font-family:Thmanyah,Tahoma,sans-serif;color:#35312b}.page{width:302mm;min-height:162mm;display:flex;flex-direction:column;background:#e6f3e8}header{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #357d63;padding:0 0 3mm;margin-bottom:5mm;background:#fff}h1{margin:0;font-size:20pt}.meta{font-size:9.5pt;color:#756e64;text-align:left}table{width:100%;min-height:140mm;border-collapse:collapse;table-layout:fixed;font-size:9pt;background:#e6f3e8}thead{height:10mm}tbody tr{height:1px}th,td{border:.6pt solid #ddd5c5;padding:0;text-align:right;vertical-align:middle;overflow-wrap:anywhere}th{padding:2mm;background:#357d63;color:#fff}td.num{background:#f2dfad;text-align:center}td.name{background:#faf7ef}td.memorization{background:#e6f3e8}.cell{width:100%;height:100%;min-height:9mm;display:flex;align-items:center;gap:2mm;padding:2mm;background:inherit}.num .cell{justify-content:center}td img{width:9mm;height:9mm;border-radius:50%;object-fit:cover;flex:none}
 </style></head><body><div class="page"><header><h1>${escapeHtml(title)}</h1><div class="meta"><div>${escapeHtml(sheet)}</div><div>${escapeHtml(formatStudentCount(rows.length))}</div></div></header><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></body></html>`);
}

export async function printStudentCard({ title, sheet, labels, row, photo }: CardInput) {
  const embeddedPhoto = await embedImage(photo);
  const name = row[1] || "طالب";
  const fields = labels.slice(2).map((label, index) => `<div class="field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(row[index + 2] || "—")}</strong></div>`).join("");
  printHtml(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(name)}</title><style>
@font-face{font-family:Thmanyah;src:url("${FONT_URL}") format("opentype");font-weight:900}@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;font-family:Thmanyah,Tahoma,sans-serif;color:#35312b}.sheet{min-height:269mm;border:1px solid #ddd5c5;padding:14mm;background:#fff}header{display:flex;align-items:center;gap:8mm;border-bottom:2px solid #357d63;padding-bottom:8mm}.photo{width:35mm;height:35mm;border-radius:50%;object-fit:cover;border:2mm solid #e6f3e8;background:#f2dfad}.fallback{display:grid;place-items:center;font-size:28pt}.eyebrow{color:#756e64;font-size:10pt}h1{margin:2mm 0 0;font-size:24pt}.meta{margin-right:auto;text-align:left;color:#756e64}.grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:10mm}.field{min-height:28mm;border:1px solid #ddd5c5;background:#e6f3e8;padding:5mm}.field span{display:block;color:#756e64;font-size:9pt;margin-bottom:2mm}.field strong{font-size:14pt}.field:last-child:nth-child(odd){grid-column:1/-1}
</style></head><body><main class="sheet"><header>${embeddedPhoto ? `<img class="photo" src="${embeddedPhoto}" alt="">` : `<div class="photo fallback">${escapeHtml(name.charAt(0))}</div>`}<div><div class="eyebrow">بطاقة الطالب</div><h1>${escapeHtml(name)}</h1></div><div class="meta"><div>${escapeHtml(title)}</div><div>${escapeHtml(sheet)}</div><div>الرقم: ${escapeHtml(row[0] || "—")}</div></div></header><section class="grid">${fields}</section></main></body></html>`);
}