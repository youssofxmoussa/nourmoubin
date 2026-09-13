import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpenText,
  Check,
  ChevronDown,
  CirclePlus,
  Columns3,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { appendQuranStudent, getQuranSheet, updateQuranCell } from "@/lib/quran-sheet.functions";

type Workbook = Awaited<ReturnType<typeof getQuranSheet>>;
type Props = { initialData?: Workbook | null };

const EMPTY_WORKBOOK = {
  title: "سجل طلاب القرآن",
  sheets: [] as string[],
  activeSheet: "",
  values: [] as string[][],
};

const columnLetter = (index: number) => String.fromCharCode(65 + index);

export function QuranDashboard({ initialData }: Props) {
  const loadSheet = useServerFn(getQuranSheet);
  const saveCell = useServerFn(updateQuranCell);
  const appendStudent = useServerFn(appendQuranStudent);
  const [data, setData] = useState<Workbook>((initialData ?? EMPTY_WORKBOOK) as Workbook);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [savedCell, setSavedCell] = useState<string | null>(null);
  const [visible, setVisible] = useState<boolean[]>(Array(9).fill(true));

  const values = data?.values ?? [];
  const headings = values[0]?.slice(0, 9) ?? [];
  const subheadings = values[1]?.slice(0, 9) ?? [];
  const labels = headings.map((heading, index) => heading || subheadings[index] || `عمود ${index + 1}`);
  const rows = useMemo(() => {
    const all = values.slice(2).filter((row) => row.some((cell) => String(cell ?? "").trim()));
    if (!query.trim()) return all;
    return all.filter((row) => row.some((cell) => String(cell ?? "").includes(query.trim())));
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

  async function addStudent() {
    setLoading(true);
    try {
      const nextNumber = Math.max(0, ...data.values.slice(2).map((row) => Number(row[0]) || 0)) + 1;
      await appendStudent({ data: { sheet: data.activeSheet, number: nextNumber } });
      setData(await loadSheet({ data: { sheet: data.activeSheet } }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground" dir="rtl">
      <svg aria-hidden="true" className="pointer-events-none absolute h-0 w-0">
        <filter id="goo"><feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" /><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="goo" /><feBlend in="SourceGraphic" in2="goo" /></filter>
      </svg>

      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className={`fixed inset-y-0 right-0 z-40 w-[286px] border-l border-border bg-sidebar p-5 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "translate-x-full"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-md bg-primary text-primary-foreground"><BookOpenText /></span><div><p className="text-lg font-black">النور المبين</p><p className="text-xs text-muted-foreground">متابعة طلاب القرآن</p></div></div>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="إغلاق القائمة"><X /></Button>
          </div>
          <div className="mt-10 flex items-center justify-between"><p className="text-xs text-muted-foreground">دفاتر المتابعة</p><span className="text-xs text-muted-foreground">{data.sheets.length}</span></div>
          <nav className="mt-3 space-y-3" aria-label="الأشهر">
            {data.sheets.map((sheet, index) => {
              const active = sheet === data.activeSheet;
              return <button key={sheet} onClick={() => chooseSheet(sheet)} className={`folder-button group w-full text-right ${active ? "is-active" : ""}`}><span className="folder-back" /><span className="folder-paper" /><span className="folder-front"><span>{sheet}</span><small>{index + 1}</small></span></button>;
            })}
          </nav>
          <div className="absolute inset-x-5 bottom-6 border-t border-border pt-5"><p className="text-xs leading-6 text-muted-foreground">كل تعديل تحفظه هنا ينعكس مباشرةً في ملف Google Sheets.</p></div>
        </aside>
        {sidebarOpen && <button className="fixed inset-0 z-30 bg-overlay lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="إغلاق القائمة" />}

        <section className="min-w-0 flex-1 px-4 py-4 sm:px-7 lg:px-10 lg:py-7">
          <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
            <div className="flex min-w-0 items-center gap-3"><Button variant="outline" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="فتح القائمة"><Menu /></Button><div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{data.title}</p><h1 className="truncate text-2xl font-black sm:text-3xl">سجل الطلاب</h1></div></div>
            <Button onClick={addStudent} disabled={loading}><CirclePlus /> <span className="hidden sm:inline">طالب جديد</span></Button>
          </header>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-success" /><p className="text-sm text-muted-foreground">دفتر مفتوح</p></div><h2 className="mt-1 text-xl font-black">{data.activeSheet}</h2></div>
            <div className="flex gap-2"><div className="relative min-w-0 flex-1 sm:w-72"><Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن طالب أو ملاحظة..." className="h-10 pr-10" /></div><DropdownMenu dir="rtl"><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="تخصيص الأعمدة"><Columns3 /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><p className="px-2 py-1.5 text-xs text-muted-foreground">الأعمدة الظاهرة</p>{labels.map((label, index) => <DropdownMenuCheckboxItem key={index} checked={Boolean(visible[index])} onCheckedChange={(checked) => setVisible((current) => current.map((value, itemIndex) => itemIndex === index ? Boolean(checked) : value))}>{label}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu></div>
          </div>

          <div className="notebook mt-5">
            {loading && <div className="absolute inset-0 z-20 grid place-items-center bg-paper/80"><LoaderCircle className="size-7 animate-spin text-primary" /></div>}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[920px] border-collapse text-sm">
                <thead><tr>{labels.map((label, index) => visible[index] && <th key={index} className="border-b border-l border-line bg-note px-3 py-3 text-right text-xs font-black last:border-l-0">{label}</th>)}</tr></thead>
                <tbody>{rows.map((row, rowIndex) => <tr key={`${row[0]}-${rowIndex}`} className="group hover:bg-note/50">{labels.map((_, columnIndex) => visible[columnIndex] && <td key={columnIndex} className="relative min-w-28 border-b border-l border-line p-0 last:border-l-0 first:min-w-14"><input aria-label={`${labels[columnIndex]}، الصف ${rowIndex + 1}`} defaultValue={row[columnIndex] ?? ""} onBlur={(event) => { if (event.target.value !== (row[columnIndex] ?? "")) void commitCell(rowIndex, columnIndex, event.target.value); }} className="h-12 w-full bg-transparent px-3 outline-none focus:bg-focus" />{savingCell === `${columnLetter(columnIndex)}${rowIndex + 3}` && <LoaderCircle className="absolute left-2 top-1/2 size-3 -translate-y-1/2 animate-spin text-muted-foreground" />}{savedCell === `${columnLetter(columnIndex)}${rowIndex + 3}` && <Check className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-success" />}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <div className="divide-y divide-line md:hidden">{rows.map((row, rowIndex) => <article key={`${row[0]}-${rowIndex}`} className="p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-note text-xs">{row[0] || rowIndex + 1}</span><strong>{row[1] || "طالب بدون اسم"}</strong></div><MoreHorizontal className="size-4 text-muted-foreground" /></div><div className="grid grid-cols-2 gap-x-4 gap-y-3">{labels.slice(2).map((label, offset) => { const columnIndex = offset + 2; if (!visible[columnIndex]) return null; return <label key={columnIndex} className={columnIndex === 8 ? "col-span-2" : ""}><span className="block text-[11px] text-muted-foreground">{label}</span><input defaultValue={row[columnIndex] ?? ""} onBlur={(event) => { if (event.target.value !== (row[columnIndex] ?? "")) void commitCell(rowIndex, columnIndex, event.target.value); }} className="mt-1 h-9 w-full border-b border-line bg-transparent outline-none focus:border-primary" /></label>; })}</div></article>)}</div>
            {!rows.length && <div className="grid min-h-64 place-items-center text-center"><div><Sparkles className="mx-auto mb-3 text-primary" /><p className="font-black">لا توجد نتائج</p><p className="mt-1 text-sm text-muted-foreground">جرّب عبارة بحث أخرى.</p></div></div>}
          </div>
          <footer className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{rows.length} طالباً</span><span className="flex items-center gap-1">آخر التعديلات تحفظ تلقائياً <ChevronDown className="size-3" /></span></footer>
        </section>
      </div>
    </main>
  );
}