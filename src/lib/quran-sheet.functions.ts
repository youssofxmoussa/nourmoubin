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

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${GATEWAY_URL}${path}`, { ...init, headers: headers() });
  if (!response.ok) {
    const detail = await response.text();
    console.error(`Google Sheets request failed [${response.status}]: ${detail}`);
    throw new Error(`تعذّر الوصول إلى الجدول (${response.status})`);
  }
  return response.json();
}

function quoteSheet(name: string) {
  return `'${name.replaceAll("'", "''")}'`;
}

async function loadSheet(sheet?: string) {
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
    return { ok: true };
  });

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
    const current = await loadSheet(data.sheet);
    const nextNumber = Math.max(0, ...current.values.slice(2).map((row) => Number(row?.[0]) || 0)) + 1;
    const row = Array.from({ length: 9 }, (_, index) => data.values[index] ?? "");
    row[0] = String(nextNumber);
    const range = `${quoteSheet(data.sheet)}!A:I`;
    await request(`/spreadsheets/${SPREADSHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ range, majorDimension: "ROWS", values: [row] }),
    });
    return { ok: true, number: nextNumber };
  });