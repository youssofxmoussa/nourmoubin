import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Award,
  BookOpenText,
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
  UsersRound,
  CalendarDays,
  Minus,
  MessageSquare,
  Trophy,
} from "lucide-react";

import { QuranBrand } from "@/components/quran-brand";
import { WorkbookSidebar } from "@/components/workbook-sidebar";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { calculateTotalPages } from "@/lib/attendance";
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
import { ATTENDANCE_COLUMN, TABLE_COLUMN_COUNT, TOTAL_COLUMN, calculateAttendance, withCalculatedAttendance } from "@/lib/attendance";
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
    index === ATTENDANCE_COLUMN
      ? "الحضور"
      : index === TOTAL_COLUMN
        ? "المجموع (صفحات)"
        : headings[index] || subheadings[index] || `عمود ${index + 1}`,
  );
  const rows = useMemo(() => {
    const all = values
      .slice(2)
      .map((row, sourceIndex) => ({ row: withCalculatedAttendance(row), sourceIndex }))
      .filter(({ row }) => Boolean(String(row[1] ?? "").trim()));
    if (!query.trim()) return all;
    return all.filter(({ row }) => row.some((cell) => String(cell ?? "").includes(query.trim())));
  }, [values, query]);

  const attendanceStats = useMemo(() => {
    if (!rows.length) return { attended: 0, expected: 5, full: 0 };
    const all = rows.map(({ row }) => calculateAttendance(row));
    const attended = Math.round(all.reduce((sum, item) => sum + item.attended, 0) / all.length);
    const expected = Math.max(...all.map((item) => item.expected));
    return { attended, expected, full: all.filter((item) => item.complete).length };
  }, [rows]);

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
    if (columnIndex === ATTENDANCE_COLUMN || columnIndex === TOTAL_COLUMN) return;
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
      <div className="app-layout">
        <aside className="desktop-sidebar"><WorkbookSidebar sheets={data.sheets} activeSheet={data.activeSheet} onChoose={chooseSheet} /></aside>
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}><SheetContent side="right" className="w-72 overflow-y-auto p-0" dir="rtl"><SheetTitle className="sr-only">دفاتر المتابعة</SheetTitle><SheetDescription className="sr-only">اختيار دفتر الطلاب</SheetDescription><WorkbookSidebar sheets={data.sheets} activeSheet={data.activeSheet} onChoose={chooseSheet} /></SheetContent></Sheet>
        <section className="register-main">
          <div className="mobile-register-nav"><QuranBrand compact /><Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} aria-label="فتح القائمة"><Menu /></Button></div>
          <header className="register-heading">
            <div><h1><BookOpenText className="size-7 text-primary" /> سجل الطلاب</h1><p>متابعة الحفظ والمراجعة والالتزام اليومي</p></div>
            <div className="flex items-center gap-2"><Button variant="secondary" className="max-w-36 truncate lg:hidden" onClick={() => setSidebarOpen(true)}><span className="truncate">{data.activeSheet}</span><ChevronDown /></Button><Button asChild className="h-10"><Link to="/students/new" search={{ sheet: data.activeSheet || undefined }}><CirclePlus /><span className="hidden lg:inline">طالب جديد</span></Link></Button></div>
          </header>
          <div className="stat-strip">
            <div className="stat-item students"><UsersRound /><div><strong>{arabicDigits(rows.length)}</strong><small>طلاب</small></div></div>
            <div className="stat-item pages"><BookOpenText /><div><strong>{arabicDigits(Math.round(rows.reduce((total, { row }) => total + calculateTotalPages(row), 0) * 100) / 100)}</strong><small>صفحة</small></div></div>
            <div className="stat-item attendance"><CalendarDays /><div><strong>{arabicDigits(attendanceStats.attended)}/{arabicDigits(attendanceStats.expected)}</strong><small>الحضور</small></div></div>
          </div>
          <div className="register-tools"><div className="search-field"><Search /><Input aria-label="البحث عن طالب" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن طالب" /></div><DropdownMenu dir="rtl"><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="تخصيص الأعمدة"><Columns3 /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48">{labels.map((label, index) => <DropdownMenuCheckboxItem key={index} checked={Boolean(visible[index])} onCheckedChange={(checked) => setVisible((current) => current.map((value, itemIndex) => itemIndex === index ? Boolean(checked) : value))}>{label}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu><span className="mr-auto hidden text-xs text-muted-foreground lg:block">{data.activeSheet}</span></div>
          {loading && <div className="flex items-center justify-center gap-2 py-3 text-primary" role="status"><LoaderCircle className="size-4 animate-spin" /> جارٍ الحفظ…</div>}
          <div className="table-frame"><table className="register-table"><thead><tr>{labels.map((label, index) => visible[index] && <th key={index} className={index === 0 ? "number-col" : index === 1 ? "student-col" : ""}>{index === TOTAL_COLUMN ? "الصفحات" : label}</th>)}</tr></thead><tbody>{rows.map(({ row, sourceIndex }) => <tr key={sourceIndex}>{labels.map((label, columnIndex) => visible[columnIndex] && <td key={columnIndex}>
            {columnIndex === 1 ? <div className="student-name"><Avatar className="size-9 shrink-0 border-2 border-accent"><AvatarImage src={data.photos?.[sourceIndex + 3]} alt={`صورة ${row[1]}`} /><AvatarFallback className="bg-note text-primary">{row[1]?.charAt(0)}</AvatarFallback></Avatar><Button variant="ghost" className="name-button" onClick={() => openEditor(sourceIndex, 1, row[1] ?? "", row[1] ?? "")}><span className="line-clamp-2">{row[1]}</span></Button><div className="student-actions"><Button variant="reward" size="icon" onClick={() => printCertificateFor({ row, sourceIndex })} aria-label={`شهادة ${row[1]}`} title="شهادة"><Trophy /></Button><Button variant="ghost" size="icon" onClick={() => printCard({ row, sourceIndex })} aria-label={`طباعة بطاقة ${row[1]}`} title="طباعة بطاقة"><Printer /></Button><Button variant="danger" size="icon" onClick={() => { setDeleting({ row, sourceIndex }); setDeleteError(""); }} aria-label={`حذف ${row[1]}`} title="حذف"><Trash2 /></Button></div></div>
            : columnIndex === ATTENDANCE_COLUMN || columnIndex === TOTAL_COLUMN ? <span className={`cell-pill font-bold ${columnIndex === ATTENDANCE_COLUMN ? "bg-attendance-soft text-attendance" : "bg-reward-soft text-reward"}`}>{row[columnIndex] || "—"}</span>
            : <Button variant="ghost" className={`cell-pill ${columnIndex === 0 ? "bg-cell-number text-reward" : columnIndex === 9 ? "" : "bg-cell-memorization text-primary"}`} onClick={() => openEditor(sourceIndex, columnIndex, row[columnIndex] ?? "", row[1] ?? "")} aria-label={`تعديل ${label} للطالب ${row[1]}`}><span className="line-clamp-2">{row[columnIndex] || "—"}</span>{savingCell === `${columnLetter(columnIndex)}${sourceIndex + 3}` && <LoaderCircle className="size-3 animate-spin" />}</Button>}
          </td>)}</tr>)}</tbody></table></div>
          <div className="student-list">{rows.map(({ row, sourceIndex }) => { const attendance = calculateAttendance(row); return <article key={sourceIndex} className="student-card">
            <div className="student-card-head"><div className={`attendance-ring ${attendance.complete ? "is-complete" : ""}`}><Avatar className="size-full"><AvatarImage src={data.photos?.[sourceIndex + 3]} alt={`صورة ${row[1]}`} className="object-cover" /><AvatarFallback className="bg-accent text-primary text-xl">{row[1]?.charAt(0)}</AvatarFallback></Avatar></div><div className="min-w-0 flex-1"><strong className="flex items-center gap-2"><span className="line-clamp-2">{row[1]}</span><BookOpenText className="size-5 shrink-0 text-reward" /></strong><small>{attendance.complete ? "حضور كامل" : `الحضور ${attendance.label}`}</small></div><Button variant="ghost" size="icon" onClick={() => openEditor(sourceIndex, 1, row[1] ?? "", row[1] ?? "")} aria-label={`تعديل اسم ${row[1]}`}><Pencil className="size-4" /></Button></div>
            <div className="student-card-content"><div className="week-grid">{[2,3,4,5,6].filter((index) => visible[index]).map((index) => <Button key={index} variant="ghost" className="week-tile" onClick={() => openEditor(sourceIndex, index, row[index] ?? "", row[1] ?? "")}><span className={`week-check ${row[index] ? "" : "is-empty"}`}>{row[index] ? <Check className="size-full" /> : <Minus className="size-full" />}</span><span className="min-w-0"><small>الأسبوع {arabicDigits(index - 1)}</small><strong className="line-clamp-2">{row[index] || "—"}</strong></span></Button>)}</div>
            <div className="student-summary">{visible[7] && <div><CalendarDays className="size-5 text-attendance" /><span><strong>{attendance.label}</strong><small>الحضور</small></span></div>}{visible[8] && <div><BookOpenText className="size-5 text-reward" /><span><strong>{row[8]}</strong><small>المحفوظ</small></span></div>}</div>
            {visible[9] && <Button variant="ghost" className="student-notes" onClick={() => openEditor(sourceIndex, 9, row[9] ?? "", row[1] ?? "")}><span className="flex items-center gap-1"><MessageSquare className="size-4 text-primary" /> ملاحظات</span><span className="line-clamp-2">{row[9] || "—"}</span></Button>}
            <div className="card-actions"><Button onClick={() => printCertificateFor({ row, sourceIndex })}><Trophy /> شهادة</Button><Button variant="attendance" onClick={() => printCard({ row, sourceIndex })}><Printer /> بطاقة</Button><Button variant="danger" onClick={() => { setDeleting({ row, sourceIndex }); setDeleteError(""); }}><Trash2 /> حذف</Button></div></div>
          </article>; })}</div>
          {!rows.length && <div className="grid min-h-60 place-items-center text-center"><div><BookOpenText className="mx-auto mb-3 size-9 text-primary" /><p className="font-bold">{query ? "لا توجد نتائج" : "ابدأ بإضافة أول طالب"}</p>{!query && <Button asChild className="mt-4"><Link to="/students/new" search={{ sheet: data.activeSheet || undefined }}><CirclePlus /> إضافة طالب</Link></Button>}</div></div>}
          <footer className="register-footer"><span className="flex items-center gap-2"><UsersRound className="size-4" /> إجمالي الطلاب: {formatStudentCount(rows.length)}</span><div className="export-button"><Button variant="outline" className="lg:h-10" onClick={exportPdf} disabled={!rows.length}><FileDown /> تصدير PDF</Button></div></footer>
        </section>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !loading) setEditing(null); }}>
        <DialogContent dir="rtl" className="max-h-[90dvh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-lg border-border bg-paper p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-line bg-note py-4 ps-5 pe-12 text-right sm:text-right">
            <DialogTitle className="text-xl font-bold">تعديل {editing?.label}</DialogTitle>
            <DialogDescription>{editing?.student ? `الطالب: ${editing.student}` : "عدّل القيمة ثم احفظها."}</DialogDescription>
          </DialogHeader>
          <div className="px-5 py-5">
            <label htmlFor="cell-value" className="mb-2 block text-sm text-muted-foreground">{editing?.label}</label>
            {editing && editing.columnIndex >= 2 && editing.columnIndex <= 6 && <QuranRangePicker onInsert={setEditValue} />}
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