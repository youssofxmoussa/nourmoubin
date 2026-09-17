import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BookOpenText, Camera, Check, ImagePlus, LoaderCircle, Move, Trash2, UserRoundPlus, ZoomIn } from "lucide-react";
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
  const addStudent = useServerFn(addQuranStudentRow);
  const savePhoto = useServerFn(saveQuranStudentPhoto);
  const navigate = useNavigate();
  const headings = workbook.values[0]?.slice(0, 9) ?? [];
  const subheadings = workbook.values[1]?.slice(0, 9) ?? [];
  const labels = headings.map((heading, index) => heading || subheadings[index] || `عمود ${index + 1}`);
  const [sheet, setSheet] = useState(workbook.activeSheet);
  const [values, setValues] = useState<string[]>(Array(9).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState("");
  const [cropSource, setCropSource] = useState("");
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
      <div className="mx-auto min-h-screen max-w-5xl px-4 py-5 sm:px-8 sm:py-8">
        <header className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <BookOpenText aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">سجل طلاب القرآن</p>
              <h1 className="truncate text-2xl font-black sm:text-3xl">إضافة طالب جديد</h1>
            </div>
          </div>
          <Button variant="outline" size="icon" asChild>
            <Link to="/" search={{ sheet }} aria-label="العودة إلى سجل الطلاب">
              <ArrowRight />
            </Link>
          </Button>
        </header>

        <section className="mx-auto mt-8 max-w-3xl sm:mt-12" aria-labelledby="new-student-title">
          <div className="mb-6 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-note text-primary">
              <UserRoundPlus className="size-7" aria-hidden="true" />
            </span>
            <h2 id="new-student-title" className="mt-4 text-2xl font-black">بيانات الطالب</h2>
            <p className="mt-1 text-sm text-muted-foreground">الاسم مطلوب، وباقي التفاصيل يمكنك إكمالها الآن أو لاحقاً.</p>
          </div>

          <form onSubmit={submit} className="notebook p-4 sm:p-7">
            <div className="mb-7 border-b border-line pb-7">
              <Label>صورة الطالب</Label>
              <div className="mt-3 flex flex-col items-center gap-4 rounded-md border border-line bg-cell-name p-4 sm:flex-row sm:items-center">
                <div className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-paper bg-note shadow-sm">
                  {photo ? <img src={photo} alt="معاينة صورة الطالب" className="h-full w-full object-cover" /> : <UserRoundPlus className="size-10 text-primary" aria-hidden="true" />}
                </div>
                <div className="flex-1 text-center sm:text-right">
                  <p className="font-black">أضف صورة واضحة للطالب</p>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">يمكنك التقاطها الآن بالموبايل أو اختيارها من الصور. الصورة تظهر في الموقع فقط.</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                    <Button type="button" variant="outline" onClick={() => cameraInput.current?.click()} disabled={photoBusy}><Camera /> تصوير الطالب</Button>
                    <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={photoBusy}><ImagePlus /> اختيار من الملفات</Button>
                    {photo && <Button type="button" variant="ghost" size="icon" onClick={() => setPhoto("")} aria-label="حذف الصورة"><Trash2 /></Button>}
                  </div>
                </div>
              </div>
              <input ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={choosePhoto} className="sr-only" aria-label="التقاط صورة الطالب" />
              <input ref={fileInput} type="file" accept="image/*" onChange={choosePhoto} className="sr-only" aria-label="اختيار صورة الطالب من الملفات" />
            </div>

            <div className="mb-6 grid gap-2">
              <Label htmlFor="sheet">دفتر المتابعة</Label>
              <Select value={sheet} onValueChange={setSheet} dir="rtl">
                <SelectTrigger id="sheet" className="h-11 bg-paper">
                  <SelectValue placeholder="اختر الشهر" />
                </SelectTrigger>
                <SelectContent>
                  {workbook.sheets.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {labels.slice(1).map((label, offset) => {
                const index = offset + 1;
                const isName = index === 1;
                const isNote = index === 8;
                return (
                  <div key={index} className={isName || isNote ? "sm:col-span-2" : ""}>
                    <Label htmlFor={`student-${index}`}>{label}{isName ? " *" : ""}</Label>
                    {isNote ? (
                      <Textarea
                        id={`student-${index}`}
                        value={values[index] ?? ""}
                        onChange={(event) => changeValue(index, event.target.value)}
                        placeholder={`اكتب ${label}`}
                        className="mt-2 min-h-24 bg-paper"
                      />
                    ) : (
                      <Input
                        id={`student-${index}`}
                        value={values[index] ?? ""}
                        onChange={(event) => changeValue(index, event.target.value)}
                        placeholder={isName ? "اسم الطالب الكامل" : `اكتب ${label}`}
                        className="mt-2 h-11 bg-paper"
                        autoFocus={isName}
                        required={isName}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {error && <p className="mt-5 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>}

            <div className="mt-7 flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" asChild>
                <Link to="/" search={{ sheet }}>إلغاء</Link>
              </Button>
              <Button type="submit" className="h-11 sm:min-w-40" disabled={submitting || photoBusy || !sheet}>
                {submitting ? <LoaderCircle className="animate-spin" /> : <Check />}
                {submitting ? "جارٍ الحفظ..." : "حفظ الطالب"}
              </Button>
            </div>
          </form>
        </section>
      </div>
      <Dialog open={Boolean(cropSource)} onOpenChange={(open) => { if (!open && !photoBusy) setCropSource(""); }}>
        <DialogContent dir="rtl" className="w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>ضبط صورة الطالب</DialogTitle>
            <DialogDescription>كبّر الصورة وحرّكها حتى يظهر الوجه داخل الإطار الدائري.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="mx-auto size-64 overflow-hidden rounded-full border-4 border-primary bg-muted shadow-inner">
              {cropSource && <img src={cropSource} alt="معاينة قص صورة الطالب" className="h-full w-full object-cover" style={{ transform: `translate(${cropX * 0.35}px, ${cropY * 0.35}px) scale(${cropZoom})` }} />}
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