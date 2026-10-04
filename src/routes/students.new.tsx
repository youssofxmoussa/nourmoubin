import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BookOpenText, Camera, Check, ImagePlus, LoaderCircle, Move, Trash2, UserRoundPlus, ZoomIn, ChevronDown, CalendarDays, UserRound, MessageSquare } from "lucide-react";
import emblem from "@/assets/quran-emblem.png";
import { QuranBrand } from "@/components/quran-brand";
import { WorkbookSidebar } from "@/components/workbook-sidebar";
import { QuranRangePicker } from "@/components/quran-picker";
import { useIsMobile } from "@/hooks/use-mobile";
import { arabicDigits } from "@/lib/quran-surahs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addQuranStudentRow, getQuranSheet, saveQuranStudentPhoto } from "@/lib/quran-sheet.functions";
import { ATTENDANCE_COLUMN, TABLE_COLUMN_COUNT, TOTAL_COLUMN } from "@/lib/attendance";

async function readPhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("اختر ملف صورة");
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("تعذّرت قراءة الصورة"));
    reader.onerror = () => reject(new Error("تعذّرت قراءة الصورة"));
    reader.readAsDataURL(file);
  });
}

async function cropPhoto(sourceUrl: string, zoom: number, offsetX: number, offsetY: number) {
  const source = await createImageBitmap(await (await fetch(sourceUrl)).blob());
  const outputSize = 800;
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذّرت معالجة الصورة");
  const baseScale = Math.max(outputSize / source.width, outputSize / source.height);
  const scale = baseScale * zoom;
  const width = source.width * scale;
  const height = source.height * scale;
  const travelX = Math.max(0, (width - outputSize) / 2);
  const travelY = Math.max(0, (height - outputSize) / 2);
  const x = (outputSize - width) / 2 + (offsetX / 100) * travelX;
  const y = (outputSize - height) / 2 + (offsetY / 100) * travelY;
  context.drawImage(source, x, y, width, height);
  source.close();
  return canvas.toDataURL("image/jpeg", 0.78);
}

export const Route = createFileRoute("/students/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    sheet: typeof search["sheet"] === "string" ? search["sheet"] : undefined,
  }),
  loaderDeps: ({ search }) => ({ sheet: search.sheet }),
  loader: ({ deps }) => getQuranSheet({ data: { sheet: deps.sheet } }),
  head: () => ({
    meta: [
      { title: "إضافة طالب جديد | النور المبين" },
      { name: "description", content: "إضافة طالب جديد إلى سجل دورة القرآن." },
      { property: "og:title", content: "إضافة طالب جديد | النور المبين" },
      { property: "og:description", content: "إضافة طالب جديد إلى سجل دورة القرآن." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewStudentPage,
});

function NewStudentPage() {
  const workbook = Route.useLoaderData();
  const isMobile = useIsMobile();
  const [activeWeek, setActiveWeek] = useState<number | null>(null);
  const addStudent = useServerFn(addQuranStudentRow);
  const savePhoto = useServerFn(saveQuranStudentPhoto);
  const navigate = useNavigate();
  const headings = workbook.values[0]?.slice(0, TABLE_COLUMN_COUNT) ?? [];
  const subheadings = workbook.values[1]?.slice(0, TABLE_COLUMN_COUNT) ?? [];
  const labels = headings.map((heading, index) => heading || subheadings[index] || `عمود ${index + 1}`);
  const [sheet, setSheet] = useState(workbook.activeSheet);
  const [values, setValues] = useState<string[]>(Array(TABLE_COLUMN_COUNT).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState("");
  const [cropSource, setCropSource] = useState("");
  const [cropSize, setCropSize] = useState({ width: 1, height: 1 });
  const [cropZoom, setCropZoom] = useState(1);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (photo.startsWith("blob:")) URL.revokeObjectURL(photo);
  }, [photo]);

  function changeValue(index: number, value: string) {
    setValues((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    setError("");
    try {
      setCropSource(await readPhoto(file));
      const dimensions = await createImageBitmap(file);
      setCropSize({ width: dimensions.width, height: dimensions.height });
      dimensions.close();
      setCropZoom(1);
      setCropX(0);
      setCropY(0);
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "تعذّرت معالجة الصورة");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function applyCrop() {
    if (!cropSource) return;
    setPhotoBusy(true);
    setError("");
    try {
      setPhoto(await cropPhoto(cropSource, cropZoom, cropX, cropY));
      setCropSource("");
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : "تعذّر قص الصورة");
    } finally {
      setPhotoBusy(false);
    }
  }

  const cropBaseScale = Math.max(256 / cropSize.width, 256 / cropSize.height);
  const cropWidth = cropSize.width * cropBaseScale * cropZoom;
  const cropHeight = cropSize.height * cropBaseScale * cropZoom;
  const cropTravelX = Math.max(0, (cropWidth - 256) / 2);
  const cropTravelY = Math.max(0, (cropHeight - 256) / 2);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = values[1]?.trim();
    if (!name) {
      setError("اكتب اسم الطالب أولاً");
      return;
    }
    if (!sheet) {
      setError("اختر دفتر المتابعة");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const created = await addStudent({ data: { sheet, values: values.map((value) => value.trim()) } });
      if (photo) {
        await savePhoto({ data: { sheet, rowNumber: created.rowNumber, studentName: name, imageData: photo } });
      }
      await navigate({ to: "/", search: { sheet } });
    } catch {
      setError("تعذّر حفظ الطالب. جرّب مرة أخرى.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="app-layout"><aside className="desktop-sidebar"><WorkbookSidebar studentPage sheets={workbook.sheets} activeSheet={sheet} onChoose={setSheet} /></aside><div className="new-student-main">
        <header className="new-topbar"><QuranBrand compact /><span className="topbar-caption text-xs text-muted-foreground">سجل طلاب القرآن</span><Button variant="ghost" asChild><Link to="/" search={{ sheet }}><ArrowRight /> عودة</Link></Button></header>
        <form onSubmit={submit} className="new-student-body"><div className="new-title"><img src={emblem} alt="" width={64} height={64} /><div><h1>طالب جديد</h1><p>إضافة طالب جديد إلى دفتر المتابعة</p></div></div>
          <div className="new-student-columns"><section className="form-section information-section"><h2><UserRound /> معلومات الطالب</h2><p>البيانات الأساسية للطالب</p><Label className="hidden text-center lg:block">صورة الطالب</Label>
            <div className="photo-preview">{photo ? <img src={photo} alt="معاينة صورة الطالب" className="size-full object-cover" /> : <UserRound className="size-12 text-primary" />}</div>
            <div className="photo-actions"><Button type="button" variant="outline" onClick={() => cameraInput.current?.click()} disabled={photoBusy}><Camera /> التقاط صورة</Button><Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={photoBusy}><ImagePlus /> اختيار صورة</Button>{photo && <Button type="button" variant="danger" size="icon" className="flex-none" onClick={() => setPhoto("")} aria-label="حذف الصورة"><Trash2 /></Button>}</div>
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={choosePhoto} className="sr-only" aria-label="التقاط صورة الطالب" /><input ref={fileInput} type="file" accept="image/*" onChange={choosePhoto} className="sr-only" aria-label="اختيار صورة الطالب من الملفات" />
            <div className="student-fields"><div><Label htmlFor="sheet"><CalendarDays className="size-4 text-muted-foreground" /> دفتر المتابعة</Label><Select value={sheet} onValueChange={setSheet} dir="rtl"><SelectTrigger id="sheet"><SelectValue placeholder="اختر الشهر" /></SelectTrigger><SelectContent>{workbook.sheets.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="student-1"><UserRound className="size-4 text-muted-foreground" /> اسم الطالب</Label><Input id="student-1" value={values[1] ?? ""} onChange={(event) => changeValue(1, event.target.value)} placeholder="اسم الطالب الكامل" required /></div></div>
          </section>
          <section className="form-section"><h2><BookOpenText /> الحفظ الأسبوعي</h2><p className="hidden lg:block">أسابيع المراجعة والحفظ</p>{[2,3,4,5,6].map((index) => <div className="week-accordion" key={index}><Button type="button" variant="ghost" className="week-accordion-trigger" onClick={() => setActiveWeek(activeWeek === index ? null : index)} aria-expanded={activeWeek === index}><span className="font-bold">الأسبوع {arabicDigits(index - 1)}</span><span className="week-value">{values[index] || "لم يتم التحديد بعد"}</span><BookOpenText className="size-4 text-primary" /><ChevronDown className={`size-4 ${activeWeek === index ? "rotate-180" : ""}`} /></Button>{(activeWeek === index || (activeWeek === null && index === 2)) && !isMobile && <div className="week-accordion-content"><QuranRangePicker onInsert={(text) => { changeValue(index, text); setActiveWeek(null); }} /><Input aria-label={`حفظ الأسبوع ${arabicDigits(index - 1)}`} value={values[index] ?? ""} onChange={(event) => changeValue(index, event.target.value)} placeholder="المحفوظ" /></div>}</div>)}</section></div>
          <section className="notes-section"><Label htmlFor="student-9"><MessageSquare className="size-4 text-primary" /> ملاحظات</Label><Textarea id="student-9" value={values[9] ?? ""} onChange={(event) => changeValue(9, event.target.value)} placeholder="أضف أي ملاحظات حول الطالب…" className="min-h-20 bg-paper" /></section>
          {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
          <div className="save-bar"><Button type="submit" disabled={submitting || photoBusy || !sheet}>{submitting ? <LoaderCircle className="animate-spin" /> : <Check />}{submitting ? "جارٍ الحفظ…" : "حفظ الطالب"}</Button><Button type="button" variant="outline" asChild><Link to="/" search={{ sheet }}>إلغاء</Link></Button></div>
        </form></div></div>
      <Dialog open={isMobile && activeWeek !== null} onOpenChange={(open) => { if (!open) setActiveWeek(null); }}><DialogContent dir="rtl" className="mobile-picker-dialog left-0 top-auto bottom-0 translate-x-0 translate-y-0 max-w-none"><DialogHeader className="text-right"><DialogTitle>تحديد الحفظ</DialogTitle><DialogDescription>الأسبوع {arabicDigits((activeWeek ?? 2) - 1)}</DialogDescription></DialogHeader><QuranRangePicker onInsert={(text) => { if (activeWeek !== null) changeValue(activeWeek, text); setActiveWeek(null); }} />{activeWeek !== null && <Input aria-label="المحفوظ" value={values[activeWeek] ?? ""} onChange={(event) => changeValue(activeWeek, event.target.value)} placeholder="المحفوظ" />}</DialogContent></Dialog>
      <Dialog open={Boolean(cropSource)} onOpenChange={(open) => { if (!open && !photoBusy) setCropSource(""); }}>
        <DialogContent dir="rtl" className="max-h-[90dvh] w-[calc(100%-1.5rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>ضبط صورة الطالب</DialogTitle>
            <DialogDescription>كبّر الصورة وحرّكها حتى يظهر الوجه داخل الإطار الدائري.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="relative mx-auto size-64 overflow-hidden rounded-full border-4 border-primary bg-muted shadow-inner">
              {cropSource && <img src={cropSource} alt="معاينة قص صورة الطالب" className="absolute left-1/2 top-1/2 max-w-none" style={{ width: `${cropWidth}px`, height: `${cropHeight}px`, transform: `translate(calc(-50% + ${(cropX / 100) * cropTravelX}px), calc(-50% + ${(cropY / 100) * cropTravelY}px))` }} />}
            </div>
            <div className="space-y-4">
              <div><Label className="mb-2 flex items-center gap-2"><ZoomIn className="size-4" /> التكبير</Label><Slider value={[cropZoom]} min={1} max={2.5} step={0.05} onValueChange={([value]) => setCropZoom(value ?? 1)} /></div>
              <div><Label className="mb-2 flex items-center gap-2"><Move className="size-4" /> تحريك أفقي</Label><Slider value={[cropX]} min={-100} max={100} step={1} onValueChange={([value]) => setCropX(value ?? 0)} /></div>
              <div><Label className="mb-2 flex items-center gap-2"><Move className="size-4 rotate-90" /> تحريك عمودي</Label><Slider value={[cropY]} min={-100} max={100} step={1} onValueChange={([value]) => setCropY(value ?? 0)} /></div>
            </div>
          </div>
          <DialogFooter className="flex-row gap-2 sm:justify-start">
            <Button type="button" onClick={applyCrop} disabled={photoBusy}>{photoBusy ? <LoaderCircle className="animate-spin" /> : <Check />} اعتماد الصورة</Button>
            <Button type="button" variant="ghost" onClick={() => setCropSource("")} disabled={photoBusy}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}