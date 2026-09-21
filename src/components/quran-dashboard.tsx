import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Award,
  BookOpenText,
  Calculator,
  Check,
  ChevronDown,
  CirclePlus,
  Columns3,
  FileDown,
  LoaderCircle,
  Menu,
  Pencil,
  Printer,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteQuranStudentRow,
  getQuranSheet,
  updateQuranCell,
} from "@/lib/quran-sheet.functions";
import { exportTableToPdf, printCertificate, printStudentCard } from "@/lib/export-table-pdf";
import { QuranRangePicker } from "@/components/quran-picker";
import { arabicDigits } from "@/lib/quran-surahs";
import { ATTENDANCE_COLUMN, TABLE_COLUMN_COUNT, calculateAttendance } from "@/lib/attendance";
import { formatStudentCount } from "@/lib/student-count";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


type Workbook = Awaited<ReturnType<typeof getQuranSheet>>;
type Props = { initialData?: Workbook | null };

const EMPTY_WORKBOOK = {
  title: "سجل طلاب القرآن",
  sheets: [] as string[],
  activeSheet: "",
  values: [] as string[][],
  photos: {} as Record<number, string>,
};

const columnLetter = (index: number) => String.fromCharCode(65 + index);
const cellCategory = (index: number) => index === 0
  ? "bg-cell-number"
  : index === 1
    ? "bg-cell-name"
    : index >= 2 && index <= 6
      ? "bg-cell-memorization"
      : "bg-cell-memorization";

type EditableCell = {
  rowIndex: number;
  columnIndex: number;
  label: string;
  student: string;
  value: string;
};

type StudentRow = { row: string[]; sourceIndex: number };

export function QuranDashboard({ initialData }: Props) {
  const loadSheet = useServerFn(getQuranSheet);
  const saveCell = useServerFn(updateQuranCell);
  const deleteStudent = useServerFn(deleteQuranStudentRow);
  const [data, setData] = useState<Workbook>((initialData ?? EMPTY_WORKBOOK) as Workbook);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [savedCell, setSavedCell] = useState<string | null>(null);
  const [visible, setVisible] = useState<boolean[]>(Array(TABLE_COLUMN_COUNT).fill(true));
  const [editing, setEditing] = useState<EditableCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saveError, setSaveError] = useState("");
  const [deleting, setDeleting] = useState<StudentRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const values = data?.values ?? [];
  const headings = values[0]?.slice(0, TABLE_COLUMN_COUNT) ?? [];
  const subheadings = values[1]?.slice(0, TABLE_COLUMN_COUNT) ?? [];
  const labels = Array.from({ length: TABLE_COLUMN_COUNT }, (_, index) =>
    index === ATTENDANCE_COLUMN ? "الحضور" : headings[index] || subheadings[index] || `عمود ${index + 1}`,
  );
  const rows = useMemo(() => {
    const all = values
      .slice(2)
      .map((row, sourceIndex) => ({ row, sourceIndex }))
      .filter(({ row }) => Boolean(String(row[1] ?? "").trim()));
    if (!query.trim()) return all;
    return all.filter(({ row }) => row.some((cell) => String(cell ?? "").includes(query.trim())));
  }, [values, query]);

  async function chooseSheet(sheet: string) {
    if (sheet === data.activeSheet) return;
    setLoading(true);
    setSidebarOpen(false);
    try {
      const next = await loadSheet({ data: { sheet } });
      setData(next);
    } finally {
      setLoading(false);
    }
  }

  async function commitCell(rowIndex: number, columnIndex: number, value: string) {
    const absoluteRow = rowIndex + 3;
    const cell = `${columnLetter(columnIndex)}${absoluteRow}`;
    const next = data.values.map((row) => [...row]);
    const targetRow = next[rowIndex + 2] ?? [];
    targetRow[columnIndex] = value;
    next[rowIndex + 2] = targetRow;
    setData({ ...data, values: next });
    setSavingCell(cell);
    setSavedCell(null);
    try {
      await saveCell({ data: { sheet: data.activeSheet, cell, value } });
      setSavedCell(cell);
      window.setTimeout(() => setSavedCell((current) => (current === cell ? null : current)), 1600);
    } finally {
      setSavingCell(null);
    }
  }

  function openEditor(rowIndex: number, columnIndex: number, value: string, student: string) {
    setEditing({ rowIndex, columnIndex, value, student, label: labels[columnIndex] ?? `عمود ${columnIndex + 1}` });
    setEditValue(value);
    setSaveError("");
  }

  async function saveEdit() {
    if (!editing) return;
    const isName = editing.columnIndex === 1;
    if (isName && !editValue.trim()) {
      setSaveError("لا يمكن حفظ طالب بدون اسم");
      return;
    }
    setLoading(true);
    setSaveError("");
    try {
      await commitCell(editing.rowIndex, editing.columnIndex, editValue.trim());
      setEditing(null);
    } catch {
      setSaveError("تعذّر حفظ التعديل. جرّب مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }

  async function exportPdf() {
    const columns = labels.map((_, index) => index).filter((index) => visible[index]);
    await exportTableToPdf({
      title: data.title || "سجل طلاب القرآن",
      sheet: data.activeSheet,
      labels: columns.map((index) => labels[index] ?? `عمود ${index + 1}`),
      categories: columns.map((index) => index === 0 ? "num" : index === 1 ? "name" : "memorization"),
      rows: rows.map(({ row, sourceIndex }) =>
        columns.map((index) => String(row[index] ?? (index === 0 ? sourceIndex + 1 : ""))),
      ),
      photos: rows.map(({ sourceIndex }) => data.photos?.[sourceIndex + 3]),
    });
  }

  async function printCard(student: StudentRow) {
    const photo = data.photos?.[student.sourceIndex + 3];
    await printStudentCard({
      title: data.title || "سجل طلاب القرآن",
      sheet: data.activeSheet,
      labels,
      row: student.row.map((value, index) => String(value ?? (index === 0 ? student.sourceIndex + 1 : ""))),
      ...(photo ? { photo } : {}),
    });
  }

  function completedWeeks(rowIndex: number) {
    const row = data.values[rowIndex + 2] ?? [];
    return [2, 3, 4, 5, 6].filter((column) => String(row[column] ?? "").trim()).length;
  }

  async function printCertificateFor(student: StudentRow) {
    const photo = data.photos?.[student.sourceIndex + 3];
    await printCertificate({
      title: data.title || "سجل طلاب القرآن",
      sheet: data.activeSheet,
      row: student.row.map((value, index) => String(value ?? (index === 0 ? student.sourceIndex + 1 : ""))),
      ...(photo ? { photo } : {}),
    });
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await deleteStudent({ data: { sheet: data.activeSheet, rowNumber: deleting.sourceIndex + 3 } });
      const next = await loadSheet({ data: { sheet: data.activeSheet } });
      setData(next);
      setDeleting(null);
    } catch {
      setDeleteError("تعذّر حذف الطالب. جرّب مرة أخرى.");
    } finally {
      setDeleteBusy(false);
    }
  }


  return (
    <main className="min-h-screen bg-background text-foreground" dir="rtl">
      <svg aria-hidden="true" className="pointer-events-none absolute h-0 w-0">
        <filter id="goo"><feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" /><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="goo" /><feBlend in="SourceGraphic" in2="goo" /></filter>
      </svg>

      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className={`fixed inset-y-0 right-0 z-40 flex w-[286px] flex-col overflow-y-auto overscroll-contain border-l border-border bg-sidebar p-5 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "translate-x-full"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-md bg-primary text-primary-foreground"><BookOpenText /></span><div><p className="text-lg font-black">النور المبين</p><p className="text-xs text-muted-foreground">متابعة طلاب القرآن</p></div></div>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="إغلاق القائمة"><X /></Button>
          </div>
          <div className="mt-10 flex items-center justify-between"><p className="text-xs text-muted-foreground">دفاتر المتابعة</p><span className="text-xs text-muted-foreground">{data.sheets.length}</span></div>
          <nav className="mt-3 flex-1 space-y-3 pb-8" aria-label="الأشهر">
            {data.sheets.map((sheet, index) => {
              const active = sheet === data.activeSheet;
              return <button key={sheet} onClick={() => chooseSheet(sheet)} className={`folder-button group w-full text-right ${active ? "is-active" : ""}`}><span className="folder-back" /><span className="folder-paper" /><span className="folder-front"><span>{sheet}</span><small>{index + 1}</small></span></button>;
            })}
          </nav>
          <div className="mt-auto border-t border-border pt-5"><p className="text-xs leading-6 text-muted-foreground">كل تعديل تحفظه هنا ينعكس مباشرةً في ملف Google Sheets.</p></div>
        </aside>
        {sidebarOpen && <button className="fixed inset-0 z-30 bg-overlay lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="إغلاق القائمة" />}

        <section className="min-w-0 flex-1 px-4 py-4 sm:px-7 lg:px-10 lg:py-7">
          <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
            <div className="flex min-w-0 items-center gap-3"><Button variant="outline" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="فتح القائمة"><Menu /></Button><div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{data.title}</p><h1 className="truncate text-2xl font-black sm:text-3xl">سجل الطلاب</h1></div></div>
            <Button asChild>
              <Link to="/students/new" search={{ sheet: data.activeSheet || undefined }}><CirclePlus /> <span className="hidden sm:inline">طالب جديد</span></Link>
            </Button>
          </header>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-success" /><p className="text-sm text-muted-foreground">دفتر مفتوح</p></div><h2 className="mt-1 text-xl font-black">{data.activeSheet}</h2></div>
            <div className="flex gap-2"><div className="relative min-w-0 flex-1 sm:w-72"><Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن طالب أو ملاحظة..." className="h-10 pr-10" /></div><DropdownMenu dir="rtl"><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="تخصيص الأعمدة"><Columns3 /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><p className="px-2 py-1.5 text-xs text-muted-foreground">الأعمدة الظاهرة</p>{labels.map((label, index) => <DropdownMenuCheckboxItem key={index} checked={Boolean(visible[index])} onCheckedChange={(checked) => setVisible((current) => current.map((value, itemIndex) => itemIndex === index ? Boolean(checked) : value))}>{label}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu></div>
          </div>

          <div className="notebook mt-5">
            {loading && <div className="absolute inset-0 z-20 grid place-items-center bg-paper/80"><LoaderCircle className="size-7 animate-spin text-primary" /></div>}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full table-fixed border-collapse text-sm">
                <thead><tr>{labels.map((label, index) => visible[index] && <th key={index} className={`border-b border-l border-line px-3 py-3 text-right text-xs font-black last:border-l-0 ${cellCategory(index)} ${index === 0 ? "w-12" : index === 1 ? "w-60" : ""}`}>{label}</th>)}</tr></thead>

                 <tbody>{rows.map(({ row, sourceIndex }) => <tr key={`${row[0]}-${sourceIndex}`}>{labels.map((label, columnIndex) => visible[columnIndex] && <td key={columnIndex} className={`relative border-b border-l border-line p-0 last:border-l-0 ${cellCategory(columnIndex)}`}><div className="grid grid-cols-[minmax(0,1fr)_auto] items-center"><button type="button" onClick={() => openEditor(sourceIndex, columnIndex, row[columnIndex] ?? "", row[1] ?? "")} className="flex h-14 min-w-0 items-center gap-2 px-3 text-right outline-none transition-[filter] hover:brightness-[0.97] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring" aria-label={`تعديل ${label} للطالب ${row[1] ?? ""}`}>{columnIndex === 1 && <Avatar className="size-9 shrink-0 border border-line"><AvatarImage src={data.photos?.[sourceIndex + 3]} alt={`صورة ${row[1] ?? "الطالب"}`} className="object-cover" /><AvatarFallback className="bg-primary text-xs text-primary-foreground">{String(row[1] ?? "ط").trim().charAt(0) || "ط"}</AvatarFallback></Avatar>}<span className="min-w-0 truncate">{row[columnIndex] || "—"}</span></button>{columnIndex === 1 && <div className="flex shrink-0 items-center pl-1"><Button variant="ghost" size="icon" onClick={() => printCertificateFor({ row, sourceIndex })} aria-label={`شهادة ${row[1]}`}><Award className="size-4" /></Button><Button variant="ghost" size="icon" onClick={() => printCard({ row, sourceIndex })} aria-label={`طباعة بطاقة ${row[1]}`}><Printer className="size-4" /></Button><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => { setDeleting({ row, sourceIndex }); setDeleteError(""); }} aria-label={`حذف ${row[1]}`}><Trash2 className="size-4" /></Button></div>}</div>{savingCell === `${columnLetter(columnIndex)}${sourceIndex + 3}` && <LoaderCircle className="absolute left-2 top-1/2 size-3 -translate-y-1/2 animate-spin text-muted-foreground" />}{savedCell === `${columnLetter(columnIndex)}${sourceIndex + 3}` && <Check className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-success" />}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <div className="divide-y divide-line md:hidden">{rows.map(({ row, sourceIndex }) => <article key={`${row[0]}-${sourceIndex}`} className="p-4"><div className="mb-4 flex items-center justify-between gap-3"><div className="flex min-w-0 flex-1 items-center gap-3 rounded-md bg-cell-name p-2"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-cell-number text-xs">{row[0] || sourceIndex + 1}</span><Avatar className="size-12 border-2 border-paper"><AvatarImage src={data.photos?.[sourceIndex + 3]} alt={`صورة ${row[1] ?? "الطالب"}`} className="object-cover" /><AvatarFallback className="bg-primary text-primary-foreground">{String(row[1] ?? "ط").trim().charAt(0) || "ط"}</AvatarFallback></Avatar><strong className="truncate">{row[1]}</strong></div><Button type="button" variant="ghost" size="icon" onClick={() => openEditor(sourceIndex, 1, row[1] ?? "", row[1] ?? "")} aria-label={`تعديل اسم ${row[1]}`}><Pencil /></Button></div><div className="grid grid-cols-2 gap-3">{labels.slice(2).map((label, offset) => { const columnIndex = offset + 2; if (!visible[columnIndex]) return null; return <button type="button" onClick={() => openEditor(sourceIndex, columnIndex, row[columnIndex] ?? "", row[1] ?? "")} key={columnIndex} className={`min-h-16 rounded-md border border-line p-3 text-right outline-none transition-[filter] hover:brightness-[0.97] focus-visible:ring-1 focus-visible:ring-ring ${cellCategory(columnIndex)} ${columnIndex === 9 ? "col-span-2" : ""}`}><span className="block text-[11px] text-muted-foreground">{label}</span><span className="mt-1 block truncate text-sm">{row[columnIndex] || "اضغط للإضافة"}</span></button>; })}</div><div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3"><Button type="button" variant="outline" className="flex-1 px-0" onClick={() => printCertificateFor({ row, sourceIndex })}><Award /> شهادة</Button><Button type="button" variant="outline" className="flex-1 px-0" onClick={() => printCard({ row, sourceIndex })}><Printer /> بطاقة</Button><Button type="button" variant="outline" className="flex-1 text-destructive hover:text-destructive" onClick={() => { setDeleting({ row, sourceIndex }); setDeleteError(""); }}><Trash2 /> حذف</Button></div></article>)}</div>
            {!rows.length && <div className="grid min-h-80 place-items-center px-5 text-center"><div><Sparkles className="mx-auto mb-3 text-primary" /><p className="font-black">{query ? "لا توجد نتائج" : "ابدأ بإضافة أول طالب"}</p><p className="mt-1 text-sm text-muted-foreground">{query ? "جرّب عبارة بحث أخرى." : "لن يظهر أي طالب قبل كتابة اسمه وحفظه."}</p>{!query && <Button asChild className="mt-5"><Link to="/students/new" search={{ sheet: data.activeSheet || undefined }}><CirclePlus /> إضافة طالب</Link></Button>}</div></div>}
          </div>
           <footer className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
             <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground sm:justify-start"><span>{formatStudentCount(rows.length)}</span><span className="flex items-center gap-1">التعديلات تحفظ مباشرةً <ChevronDown className="size-3" /></span></div>
             <Button variant="outline" onClick={exportPdf} disabled={!rows.length} className="w-full sm:w-auto"><FileDown /> تصدير الجدول PDF</Button>
           </footer>

        </section>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !loading) setEditing(null); }}>
        <DialogContent dir="rtl" className="w-[calc(100%-2rem)] rounded-md border-border bg-paper p-0 sm:max-w-md">
          <DialogHeader className="border-b border-line bg-note px-5 py-4 text-right sm:text-right">
            <DialogTitle className="text-xl font-black">تعديل {editing?.label}</DialogTitle>
            <DialogDescription>{editing?.student ? `الطالب: ${editing.student}` : "عدّل القيمة ثم احفظها."}</DialogDescription>
          </DialogHeader>
          <div className="px-5 py-5">
            <label htmlFor="cell-value" className="mb-2 block text-sm text-muted-foreground">{editing?.label}</label>
            {editing && editing.columnIndex >= 2 && editing.columnIndex <= 6 && <QuranRangePicker onInsert={setEditValue} />}
            {editing?.columnIndex === 8 && (() => {
              const weeks = completedWeeks(editing.rowIndex);
              return (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-line bg-note p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black">حساب تلقائي</p>
                    <p className="text-xs text-muted-foreground">اكتمل {arabicDigits(weeks)} من {arabicDigits(5)} أسابيع لهذا الطالب</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setEditValue(`${arabicDigits(weeks)}/${arabicDigits(5)}`)}><Calculator /> احسب</Button>
                </div>
              );
            })()}
            <Textarea id="cell-value" value={editValue} onChange={(event) => setEditValue(event.target.value)} className="min-h-28 resize-none bg-background text-base" autoFocus />
            {saveError && <p className="mt-3 text-sm text-destructive" role="alert">{saveError}</p>}
          </div>
          <DialogFooter className="flex-row gap-2 border-t border-line px-5 py-4 sm:justify-start sm:space-x-0">
            <Button onClick={saveEdit} disabled={loading} className="flex-1 sm:flex-none">{loading ? <LoaderCircle className="animate-spin" /> : <Check />} حفظ التعديل</Button>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={loading} className="flex-1 sm:flex-none">إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !deleteBusy) setDeleting(null); }}>
        <AlertDialogContent dir="rtl" className="w-[calc(100%-2rem)] sm:max-w-md">
          <AlertDialogHeader className="text-right sm:text-right">
            <AlertDialogTitle>حذف {deleting?.row[1]}؟</AlertDialogTitle>
            <AlertDialogDescription>سيُحذف الطالب وصورته وبياناته من هذا الدفتر، ثم يعاد ترقيم الطلاب تلقائياً. لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive" role="alert">{deleteError}</p>}
          <AlertDialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-start sm:space-x-0">
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void confirmDelete(); }} disabled={deleteBusy} className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto">{deleteBusy ? <LoaderCircle className="animate-spin" /> : <Trash2 />} حذف نهائياً</AlertDialogAction>
            <AlertDialogCancel disabled={deleteBusy} className="mt-0 w-full sm:w-auto">إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}