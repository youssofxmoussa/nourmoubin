import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ATTENDANCE_COLUMN, TABLE_COLUMN_COUNT, TOTAL_COLUMN, calculateAttendance, isManualTotal, normalizeTotalText, totalLabel, withCalculatedAttendance } from "@/lib/attendance";

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

type Workbook = {
  title: string;
  sheets: string[];
  activeSheet: string;
  values: string[][];
  photos: Record<number, string>;
};
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
  if (!activeSheet) return { title: metadata.properties?.title ?? "سجل الطلاب", sheets, activeSheet, values: [], photos: {} };
  const range = `${quoteSheet(activeSheet)}!A1:Z100`;
  const data = (await request(`/spreadsheets/${SPREADSHEET_ID}/values/${range}`)) as {
    values?: string[][];
  };
  const photos: Record<number, string> = {};
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: photoRows } = await supabaseAdmin
      .from("student_photos")
      .select("sheet_row, storage_path")
      .eq("sheet_name", activeSheet);
    await Promise.all((photoRows ?? []).map(async (photo) => {
      const { data: signed } = await supabaseAdmin.storage
        .from("student-photos")
        .createSignedUrl(photo.storage_path, 60 * 60);
      if (signed?.signedUrl) photos[photo.sheet_row] = signed.signedUrl;
    }));
  } catch (error) {
    console.error("Student photos could not be loaded", error);
  }
  return {
    title: metadata.properties?.title ?? "سجل الطلاب",
    sheets,
    activeSheet,
    values: data.values ?? [],
    photos,
  };
}

export const getQuranSheet = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ sheet: z.string().max(100).optional() }).parse(data ?? {}))
  .handler(async ({ data }) => loadSheet(data.sheet));

type CellWrite = { range: string; values: string[][] };

async function batchGetRows(sheets: string[]) {
  if (!sheets.length) return [] as string[][][];
  const query = sheets.map((name) => `ranges=${encodeURIComponent(`${quoteSheet(name)}!A1:J300`)}`).join("&");
  const result = (await request(`/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${query}`)) as {
    valueRanges?: { values?: string[][] }[];
  };
  return sheets.map((_, index) => result.valueRanges?.[index]?.values ?? []);
}

async function batchWrite(writes: CellWrite[]) {
  if (!writes.length) return;
  await request(`/spreadsheets/${SPREADSHEET_ID}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: writes.map((write) => ({ range: write.range, majorDimension: "ROWS", values: write.values })),
    }),
  });
}

async function batchClear(ranges: string[]) {
  if (!ranges.length) return;
  await request(`/spreadsheets/${SPREADSHEET_ID}/values:batchClear`, {
    method: "POST",
    body: JSON.stringify({ ranges }),
  });
}

/** الشهر المختار وكل الأشهر التي تليه بترتيب الدفاتر. */
function fromSheetOnward(sheets: string[], sheet: string) {
  const index = sheets.indexOf(sheet);
  return index >= 0 ? sheets.slice(index) : [sheet];
}

const cleanName = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");

function padRow(row: readonly unknown[] | undefined) {
  return Array.from({ length: TABLE_COLUMN_COUNT }, (_, column) => String(row?.[column] ?? ""));
}

export const updateQuranCell = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ sheet: z.string().min(1).max(100), cell: z.string().regex(/^[A-Z]+\d+$/), value: z.string().max(1000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const parsed = /^([A-Z]+)(\d+)$/.exec(data.cell);
    const column = parsed?.[1] ?? "";
    const rowNumber = Number(parsed?.[2] ?? 0);
    const isWeek = rowNumber >= 3 && ["C", "D", "E", "F", "G"].includes(column);
    const isTotal = rowNumber >= 3 && column === "I";
    const cellRange = `${quoteSheet(data.sheet)}!${data.cell}`;

    if (!isWeek && !isTotal) {
      await batchWrite([{ range: cellRange, values: [[data.value]] }]);
      cache.clear();
      return { ok: true, attendance: null as string | null, total: null as string | null };
    }

    // نقرأ الصف قبل التعديل لنعرف إن كان المجموع مكتوباً يدوياً فنحافظ عليه.
    const rowRange = `${quoteSheet(data.sheet)}!A${rowNumber}:J${rowNumber}`;
    const rowData = (await request(`/spreadsheets/${SPREADSHEET_ID}/values/${rowRange}`)) as { values?: string[][] };
    const before = padRow(rowData.values?.[0]);
    const manual = isManualTotal(before);
    const after = [...before];
    after[column.charCodeAt(0) - 65] = data.value;
    const attendance = calculateAttendance(after).label;
    const total = isTotal
      ? normalizeTotalText(data.value) || totalLabel(after)
      : manual
        ? normalizeTotalText(before[TOTAL_COLUMN] ?? "")
        : totalLabel(after);
    const computedRange = `${quoteSheet(data.sheet)}!H${rowNumber}:I${rowNumber}`;
    await batchWrite([
      ...(isWeek ? [{ range: cellRange, values: [[data.value]] }] : []),
      { range: computedRange, values: [[attendance, total]] },
    ]);
    cache.clear();
    return { ok: true, attendance, total };
  });

// الحذف من شهر معيّن يحذف الطالب من هذا الشهر وكل الأشهر التالية، ويبقى في الأشهر السابقة.
export const deleteQuranStudentRow = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      sheet: z.string().min(1).max(100),
      rowNumber: z.number().int().min(3).max(1000),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const meta = await loadSheet(data.sheet, { fresh: true });
    const targets = fromSheetOnward(meta.sheets, data.sheet);
    const allValues = await batchGetRows(targets);
    const name = cleanName(allValues[0]?.[data.rowNumber - 1]?.[1]);
    if (!name) throw new Error("الطالب غير موجود");

    const clears: string[] = [];
    const writes: CellWrite[] = [];
    const affected: { sheet: string; deletedRow: number; moves: Map<number, number>; names: Map<number, string> }[] = [];

    targets.forEach((sheetName, sheetIndex) => {
      const values = allValues[sheetIndex] ?? [];
      const rows = values
        .slice(2)
        .map((row, index) => ({ row: padRow(row), rowNumber: index + 3 }))
        .filter(({ row }) => Boolean(cleanName(row[1])));
      const target = sheetIndex === 0
        ? rows.find(({ rowNumber }) => rowNumber === data.rowNumber)
        : rows.find(({ row }) => cleanName(row[1]) === name);
      if (!target) return;
      const kept = rows.filter(({ rowNumber }) => rowNumber !== target.rowNumber);
      const remaining = kept.map(({ row }, index) => row.map((value, column) => (column === 0 ? String(index + 1) : value)));
      clears.push(`${quoteSheet(sheetName)}!A3:J${Math.max(3, values.length)}`);
      if (remaining.length) {
        writes.push({ range: `${quoteSheet(sheetName)}!A3:J${remaining.length + 2}`, values: remaining });
      }
      affected.push({
        sheet: sheetName,
        deletedRow: target.rowNumber,
        moves: new Map(kept.map(({ rowNumber }, index) => [rowNumber, index + 3])),
        names: new Map(kept.map(({ row }, index) => [index + 3, cleanName(row[1])])),
      });
    });

    await batchClear(clears);
    await batchWrite(writes);
    cache.clear();

    // نعيد ربط صور الطلاب بأرقام صفوفهم الجديدة في كل شهر تأثّر.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const releasedPaths = new Set<string>();
    for (const item of affected) {
      const { data: links, error } = await supabaseAdmin
        .from("student_photos")
        .select("id, sheet_row, storage_path")
        .eq("sheet_name", item.sheet);
      if (error) throw error;
      if (!links?.length) continue;
      const relinked = links.flatMap((link) => {
        const nextRow = item.moves.get(link.sheet_row);
        if (link.sheet_row === item.deletedRow || !nextRow) {
          releasedPaths.add(link.storage_path);
          return [];
        }
        return [{ sheet_name: item.sheet, sheet_row: nextRow, student_name: item.names.get(nextRow) || "طالب", storage_path: link.storage_path }];
      });
      const { error: deleteError } = await supabaseAdmin.from("student_photos").delete().in("id", links.map((link) => link.id));
      if (deleteError) throw deleteError;
      if (relinked.length) {
        const { error: insertError } = await supabaseAdmin.from("student_photos").insert(relinked);
        if (insertError) throw insertError;
      }
    }
    // نحذف ملف الصورة فقط إذا لم يعد أي شهر سابق يستعمله.
    for (const path of releasedPaths) {
      const { count } = await supabaseAdmin
        .from("student_photos")
        .select("id", { count: "exact", head: true })
        .eq("storage_path", path);
      if (!count) await supabaseAdmin.storage.from("student-photos").remove([path]);
    }
    cache.clear();
    return { ok: true, months: affected.map((item) => item.sheet) };
  });

// الجدول يبدأ من الصف 3. الطالب الجديد ينضاف إلى الشهر المختار وكل الأشهر التالية:
// بياناته في الشهر المختار فقط، والأشهر التالية تبدأ فارغة باسمه.
export const addQuranStudentRow = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        sheet: z.string().min(1).max(100),
        values: z.array(z.string().max(1000)).min(2).max(TABLE_COLUMN_COUNT),
      })
      .refine((input) => Boolean(input.values[1]?.trim()), { message: "اسم الطالب مطلوب", path: ["values", 1] })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const meta = await loadSheet(data.sheet, { fresh: true });
    const targets = fromSheetOnward(meta.sheets, data.sheet);
    const allValues = await batchGetRows(targets);
    const name = cleanName(data.values[1]);
    const writes: CellWrite[] = [];
    const placements: { sheet: string; rowNumber: number }[] = [];
    let primary = { number: 1, rowNumber: 3 };

    targets.forEach((sheetName, sheetIndex) => {
      const values = allValues[sheetIndex] ?? [];
      const isPrimary = sheetIndex === 0;
      // في الأشهر التالية لا نكرّر الطالب إن كان اسمه موجوداً أصلاً.
      if (!isPrimary && values.slice(2).some((row) => cleanName(row?.[1]) === name)) return;
      let target = -1;
      let count = 0;
      for (let index = 2; index < Math.max(values.length, 3); index += 1) {
        if (cleanName(values[index]?.[1])) count += 1;
        else if (target === -1) target = index;
      }
      if (target === -1) target = Math.max(values.length, 2);
      const source = isPrimary ? data.values : ["", name];
      const row = withCalculatedAttendance(Array.from({ length: TABLE_COLUMN_COUNT }, (_, index) => String(source[index] ?? "").trim()));
      row[0] = String(count + 1);
      row[1] = name;
      if (!isPrimary) {
        row[ATTENDANCE_COLUMN] = "";
        row[TOTAL_COLUMN] = "";
      }
      const rowNumber = target + 1;
      writes.push({ range: `${quoteSheet(sheetName)}!A${rowNumber}:J${rowNumber}`, values: [row] });
      placements.push({ sheet: sheetName, rowNumber });
      if (isPrimary) primary = { number: count + 1, rowNumber };
    });

    await batchWrite(writes);
    cache.clear();
    return { ok: true, ...primary, placements };
  });

const placementSchema = z.object({ sheet: z.string().min(1).max(100), rowNumber: z.number().int().min(3).max(1000) });

// الصورة تُرفع مرة واحدة وتُربط بالطالب في كل شهر أُضيف إليه.
export const saveQuranStudentPhoto = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      sheet: z.string().min(1).max(100),
      rowNumber: z.number().int().min(3).max(1000),
      placements: z.array(placementSchema).max(60).optional(),
      studentName: z.string().min(1).max(500),
      imageData: z.string().max(3_000_000),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data.imageData);
    if (!match?.[1] || !match[2]) throw new Error("صيغة الصورة غير مدعومة");
    const extension = match[1] === "image/png" ? "png" : match[1] === "image/webp" ? "webp" : "jpg";
    const path = `${crypto.randomUUID()}.${extension}`;
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.byteLength > 2_000_000) throw new Error("حجم الصورة كبير جداً");

    const placements = [{ sheet: data.sheet, rowNumber: data.rowNumber }, ...(data.placements ?? [])]
      .filter((item, index, all) => all.findIndex((other) => other.sheet === item.sheet && other.rowNumber === item.rowNumber) === index);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: uploadError } = await supabaseAdmin.storage
      .from("student-photos")
      .upload(path, bytes, { contentType: match[1], upsert: false });
    if (uploadError) throw uploadError;

    const previousPaths = new Set<string>();
    for (const placement of placements) {
      const { data: previous } = await supabaseAdmin
        .from("student_photos")
        .select("storage_path")
        .eq("sheet_name", placement.sheet)
        .eq("sheet_row", placement.rowNumber)
        .maybeSingle();
      if (previous?.storage_path) previousPaths.add(previous.storage_path);
    }
    const { error: linkError } = await supabaseAdmin
      .from("student_photos")
      .upsert(placements.map((placement) => ({
        sheet_name: placement.sheet,
        sheet_row: placement.rowNumber,
        student_name: data.studentName,
        storage_path: path,
      })), { onConflict: "sheet_name,sheet_row" });
    if (linkError) {
      await supabaseAdmin.storage.from("student-photos").remove([path]);
      throw linkError;
    }
    for (const oldPath of previousPaths) {
      if (oldPath === path) continue;
      const { count } = await supabaseAdmin
        .from("student_photos")
        .select("id", { count: "exact", head: true })
        .eq("storage_path", oldPath);
      if (!count) await supabaseAdmin.storage.from("student-photos").remove([oldPath]);
    }
    cache.clear();
    return { ok: true };
  });
