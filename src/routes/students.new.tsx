import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BookOpenText, Check, LoaderCircle, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addQuranStudentRow, getQuranSheet } from "@/lib/quran-sheet.functions";

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
  const navigate = useNavigate();
  const headings = workbook.values[0]?.slice(0, 9) ?? [];
  const subheadings = workbook.values[1]?.slice(0, 9) ?? [];
  const labels = headings.map((heading, index) => heading || subheadings[index] || `عمود ${index + 1}`);
  const [sheet, setSheet] = useState(workbook.activeSheet);
  const [values, setValues] = useState<string[]>(Array(9).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function changeValue(index: number, value: string) {
    setValues((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
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
      await addStudent({ data: { sheet, values: values.map((value) => value.trim()) } });
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
              <Button type="submit" className="h-11 sm:min-w-40" disabled={submitting || !sheet}>
                {submitting ? <LoaderCircle className="animate-spin" /> : <Check />}
                {submitting ? "جارٍ الحفظ..." : "حفظ الطالب"}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}