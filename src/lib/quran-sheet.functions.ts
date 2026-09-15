import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SPREADSHEET_ID = "1lY68HHLxncLWpZ4TQcKgb5oSRj2M_Msiydb-moxYa8Y";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

type SheetMeta = { properties?: { title?: string; index?: number } };

function headers() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!lovableKey || !sheetsKey) throw new Error("اتصال Google Sheets غير متاح حالياً");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": sheetsKey,
    "Content-Type": "application/json",
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Google Sheets يحدّ عدد الطلبات في الدقيقة، لذلك نعيد المحاولة تدريجياً عند 429/5xx.
async function request(path: string, init?: RequestInit) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${GATEWAY_URL}${path}`, { ...init, headers: headers() });
    if (response.ok) return response.json();
    lastStatus = response.status;
    const detail = await response.text();
    console.error(`Google Sheets request failed [${response.status}]: ${detail}`);
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 3) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 600 * 2 ** attempt);
  }
  throw new Error(`تعذّر الوصول إلى الجدول (${lastStatus})`);
}

function quoteSheet(name: string) {
  return `'${name.replaceAll("'", "''")}'`;
}

type Workbook = { title: string; sheets: string[]; activeSheet: string; values: string[][] };
const cache = new Map<string, { at: number; data: Workbook }>();
const CACHE_MS = 20_000;

async function loadSheet(sheet?: string, options?: { fresh?: boolean }): Promise<Workbook> {
  const key = sheet ?? "";
  const cached = cache.get(key);
  if (!options?.fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.data;
  try {
    const data = await fetchSheet(sheet);
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (error) {
    // عند تجاوز حدّ الطلبات نعرض آخر نسخة محفوظة بدل صفحة خطأ.
    if (cached) return cached.data;
    throw error;
  }
}

async function fetchSheet(sheet?: string): Promise<Workbook> {
  const metadata = (await request(`/spreadsheets/${SPREADSHEET_ID}?includeGridData=false`)) as {
    properties?: { title?: string };
    sheets?: SheetMeta[];
  };
  const sheets = (metadata.sheets ?? [])
    .map((item) => item.properties)
    .filter((item): item is { title: string; index?: number } => Boolean(item?.title))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((item) => item.title);
  const activeSheet = sheet && sheets.includes(sheet) ? sheet : (sheets[0] ?? "");
  if (!activeSheet) return { title: metadata.properties?.title ?? "سجل الطلاب", sheets, activeSheet, values: [] };
  const range = `${quoteSheet(activeSheet)}!A1:Z100`;
  const data = (await request(`/spreadsheets/${SPREADSHEET_ID}/values/${range}`)) as {
    values?: string[][];
  };
  return {
    title: metadata.properties?.title ?? "سجل الطلاب",
    sheets,
    activeSheet,
    values: data.values ?? [],
  };
}

export const getQuranSheet = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ sheet: z.string().max(100).optional() }).parse(data ?? {}))
  .handler(async ({ data }) => loadSheet(data.sheet));

export const updateQuranCell = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ sheet: z.string().min(1).max(100), cell: z.string().regex(/^[A-Z]+\d+$/), value: z.string().max(1000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const range = `${quoteSheet(data.sheet)}!${data.cell}`;
    await request(`/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      body: JSON.stringify({ range, majorDimension: "ROWS", values: [[data.value]] }),
    });
    cache.clear();
    return { ok: true };
  });

// الجدول يبدأ من الصف 3، والخانات تبقى فاضية حتى يُضاف طالب.
// كل طالب جديد يأخذ الرقم التالي (1، 2، 3...) وينكتب في أول صف فاضي.
export const addQuranStudentRow = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        sheet: z.string().min(1).max(100),
        values: z.array(z.string().max(1000)).min(2).max(9),
      })
      .refine((input) => Boolean(input.values[1]?.trim()), { message: "اسم الطالب مطلوب", path: ["values", 1] })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const current = await loadSheet(data.sheet, { fresh: true });
    const values = current.values;
    let target = -1;
    let count = 0;
    for (let index = 2; index < Math.max(values.length, 3); index += 1) {
      if (String(values[index]?.[1] ?? "").trim()) {
        count += 1;
      } else if (target === -1) {
        target = index;
      }
    }
    if (target === -1) target = Math.max(values.length, 2);
    const number = count + 1;
    const row = Array.from({ length: 9 }, (_, index) => data.values[index] ?? "");
    row[0] = String(number);
    const rowNumber = target + 1;
    const range = `${quoteSheet(data.sheet)}!A${rowNumber}:I${rowNumber}`;
    await request(`/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      body: JSON.stringify({ range, majorDimension: "ROWS", values: [row] }),
    });
    cache.clear();
    return { ok: true, number };
  });
