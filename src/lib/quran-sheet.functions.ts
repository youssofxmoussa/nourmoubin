import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { TABLE_COLUMN_COUNT, withCalculatedAttendance } from "@/lib/attendance";

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

    // خانات التسميع (C..G) تعيد حساب عمود الحضور (H) تلقائياً.
    const parsed = /^([A-Z])(\d+)$/.exec(data.cell);
    const column = parsed?.[1] ?? "";
    const rowNumber = Number(parsed?.[2] ?? 0);
    let attendance: string | null = null;
    if (rowNumber >= 3 && ["C", "D", "E", "F", "G"].includes(column)) {
      const rowRange = `${quoteSheet(data.sheet)}!A${rowNumber}:J${rowNumber}`;
      const rowData = (await request(`/spreadsheets/${SPREADSHEET_ID}/values/${rowRange}`)) as { values?: string[][] };
      const row = withCalculatedAttendance(rowData.values?.[0] ?? []);
      attendance = row[7] ?? "";
      const attendanceRange = `${quoteSheet(data.sheet)}!H${rowNumber}`;
      await request(`/spreadsheets/${SPREADSHEET_ID}/values/${attendanceRange}?valueInputOption=USER_ENTERED`, {
        method: "PUT",
        body: JSON.stringify({ range: attendanceRange, majorDimension: "ROWS", values: [[attendance]] }),
      });
      cache.clear();
    }
    return { ok: true, attendance };
  });

export const deleteQuranStudentRow = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      sheet: z.string().min(1).max(100),
      rowNumber: z.number().int().min(3).max(1000),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const current = await loadSheet(data.sheet, { fresh: true });
    const rows = current.values
      .slice(2)
      .map((row, index) => ({ row: Array.from({ length: TABLE_COLUMN_COUNT }, (_, column) => String(row[column] ?? "")), rowNumber: index + 3 }))
      .filter(({ row }) => Boolean(row[1]?.trim()));
    const target = rows.find(({ rowNumber }) => rowNumber === data.rowNumber);
    if (!target) throw new Error("الطالب غير موجود");

    const remaining = rows
      .filter(({ rowNumber }) => rowNumber !== data.rowNumber)
      .map(({ row }, index) => row.map((value, column) => column === 0 ? String(index + 1) : value));
    const clearEnd = Math.max(3, current.values.length);
    const clearRange = `${quoteSheet(data.sheet)}!A3:J${clearEnd}`;
    await request(`/spreadsheets/${SPREADSHEET_ID}/values/${clearRange}:clear`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (remaining.length) {
      const writeRange = `${quoteSheet(data.sheet)}!A3:J${remaining.length + 2}`;
      await request(`/spreadsheets/${SPREADSHEET_ID}/values/${writeRange}?valueInputOption=USER_ENTERED`, {
        method: "PUT",
        body: JSON.stringify({ range: writeRange, majorDimension: "ROWS", values: remaining }),
      });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: affectedPhotos } = await supabaseAdmin
      .from("student_photos")
      .select("id, sheet_row, storage_path")
      .eq("sheet_name", data.sheet)
      .gte("sheet_row", data.rowNumber)
      .order("sheet_row", { ascending: true });
    const deletedPhoto = affectedPhotos?.find((photo) => photo.sheet_row === data.rowNumber);
    if (affectedPhotos?.length) {
      const { error: deleteLinksError } = await supabaseAdmin
        .from("student_photos")
        .delete()
        .in("id", affectedPhotos.map((photo) => photo.id));
      if (deleteLinksError) throw deleteLinksError;
      const shifted = affectedPhotos
        .filter((photo) => photo.sheet_row > data.rowNumber)
        .map((photo) => ({
          sheet_name: data.sheet,
          sheet_row: photo.sheet_row - 1,
          student_name: remaining[photo.sheet_row - 4]?.[1] ?? "طالب",
          storage_path: photo.storage_path,
        }));
      if (shifted.length) {
        const { error: shiftError } = await supabaseAdmin.from("student_photos").insert(shifted);
        if (shiftError) throw shiftError;
      }
    }
    if (deletedPhoto?.storage_path) {
      await supabaseAdmin.storage.from("student-photos").remove([deletedPhoto.storage_path]);
    }
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
        values: z.array(z.string().max(1000)).min(2).max(TABLE_COLUMN_COUNT),
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
    const row = withCalculatedAttendance(Array.from({ length: TABLE_COLUMN_COUNT }, (_, index) => data.values[index] ?? ""));
    row[0] = String(number);
    const rowNumber = target + 1;
    const range = `${quoteSheet(data.sheet)}!A${rowNumber}:J${rowNumber}`;
    await request(`/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      body: JSON.stringify({ range, majorDimension: "ROWS", values: [row] }),
    });
    cache.clear();
    return { ok: true, number, rowNumber };
  });

export const saveQuranStudentPhoto = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      sheet: z.string().min(1).max(100),
      rowNumber: z.number().int().min(3).max(1000),
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: uploadError } = await supabaseAdmin.storage
      .from("student-photos")
      .upload(path, bytes, { contentType: match[1], upsert: false });
    if (uploadError) throw uploadError;

    const { data: previous } = await supabaseAdmin
      .from("student_photos")
      .select("storage_path")
      .eq("sheet_name", data.sheet)
      .eq("sheet_row", data.rowNumber)
      .maybeSingle();
    const { error: linkError } = await supabaseAdmin
      .from("student_photos")
      .upsert({
        sheet_name: data.sheet,
        sheet_row: data.rowNumber,
        student_name: data.studentName,
        storage_path: path,
      }, { onConflict: "sheet_name,sheet_row" });
    if (linkError) {
      await supabaseAdmin.storage.from("student-photos").remove([path]);
      throw linkError;
    }
    if (previous?.storage_path && previous.storage_path !== path) {
      await supabaseAdmin.storage.from("student-photos").remove([previous.storage_path]);
    }
    cache.clear();
    return { ok: true };
  });
