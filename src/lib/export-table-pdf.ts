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
type CertificateInput = { title: string; sheet: string; row: string[]; photo?: string };

export async function printCertificate({ title, sheet, row, photo }: CertificateInput) {
  const embeddedPhoto = await embedImage(photo);
  const name = row[1] || "طالب";
  const total = String(row[8] ?? "").trim();
  const date = new Intl.DateTimeFormat("ar", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const chips = total ? `<div class="chip"><span>المحفوظ خلال الشهر</span><strong>${escapeHtml(total)}</strong></div>` : "";
  printHtml(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>شهادة ${escapeHtml(name)}</title><style>
@font-face{font-family:Thmanyah;src:url("${FONT_URL}") format("opentype");font-weight:900}@page{size:180mm 320mm;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{margin:0;height:100%}body{font-family:Thmanyah,Tahoma,sans-serif;color:#35312b;background:#fffdf6}
.sheet{position:relative;width:180mm;height:320mm;padding:14mm;display:flex;flex-direction:column;align-items:center;text-align:center;background:radial-gradient(120% 60% at 50% 0,#eef8f0 0,#fffdf6 60%)}
.frame{position:absolute;inset:6mm;border:2.4mm solid #357d63}.frame::after{content:"";position:absolute;inset:2.2mm;border:.8mm solid #c9a24b}
.corner{position:absolute;width:22mm;height:22mm;border:.9mm solid #c9a24b}.c1{top:10mm;right:10mm;border-left:0;border-bottom:0}.c2{top:10mm;left:10mm;border-right:0;border-bottom:0}.c3{bottom:10mm;right:10mm;border-left:0;border-top:0}.c4{bottom:10mm;left:10mm;border-right:0;border-top:0}
.inner{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;width:100%;height:100%;padding:6mm 6mm 4mm}
.orn{font-size:20pt;color:#c9a24b;letter-spacing:4mm}.bismillah{margin:2mm 0 0;font-size:14pt;color:#756e64}
.org{margin-top:5mm;font-size:11pt;color:#357d63}h1{margin:4mm 0 0;font-size:40pt;color:#357d63;line-height:1.1}
.rule{width:60mm;height:.8mm;background:#c9a24b;margin:5mm 0}
.photo{width:56mm;height:56mm;border-radius:50%;object-fit:cover;border:2mm solid #c9a24b;box-shadow:0 0 0 1.4mm #e6f3e8}
.photo.fallback{display:grid;place-items:center;font-size:44pt;color:#357d63;background:#f2dfad}
.grant{margin-top:8mm;font-size:13pt;color:#756e64}
.name{margin-top:3mm;font-size:34pt;color:#35312b;border-bottom:.8mm solid #357d63;padding:0 12mm 3mm}
.body{margin-top:8mm;max-width:130mm;font-size:13pt;line-height:2.1;color:#4a443c}
.chips{margin-top:9mm;display:flex;gap:6mm;justify-content:center;flex-wrap:wrap}
.chip{min-width:52mm;border:.6mm solid #357d63;border-radius:4mm;background:#e6f3e8;padding:4mm 6mm}
.chip span{display:block;font-size:10pt;color:#756e64}.chip strong{display:block;margin-top:2mm;font-size:15pt}
.footer{margin-top:auto;width:100%;display:flex;align-items:flex-end;justify-content:space-between;gap:6mm}
.sig{font-size:10.5pt;color:#756e64;flex:1}.sig strong{display:block;margin-top:14mm;border-top:.5mm solid #c9a24b;padding-top:2.5mm;font-size:12pt;color:#35312b}
.date{font-size:10.5pt;color:#756e64;padding-bottom:2mm}
</style></head><body><main class="sheet"><div class="frame"></div><span class="corner c1"></span><span class="corner c2"></span><span class="corner c3"></span><span class="corner c4"></span><div class="inner"><div class="orn">﴿ ❋ ﴾</div><p class="bismillah">بسم الله الرحمن الرحيم</p><p class="org">${escapeHtml(title)} — ${escapeHtml(sheet)}</p><h1>شهادة تقدير</h1><div class="rule"></div>${embeddedPhoto ? `<img class="photo" src="${embeddedPhoto}" alt="">` : `<div class="photo fallback">${escapeHtml(name.charAt(0))}</div>`}<p class="grant">تُمنح هذه الشهادة بكل فخر واعتزاز إلى الطالب</p><div class="name">${escapeHtml(name)}</div><p class="body">تقديراً لاجتهاده في متابعة الحفظ والمراجعة وحُسن مواظبته، سائلين الله أن يجعله من أهل القرآن وخاصّته.</p>${chips ? `<div class="chips">${chips}</div>` : ""}<div class="footer"><div class="sig">التوقيع<strong>معلم الحلقة</strong></div><div class="date">${escapeHtml(date)}</div><div class="sig">التوقيع<strong>إدارة المركز</strong></div></div></div></main></body></html>`);
}
