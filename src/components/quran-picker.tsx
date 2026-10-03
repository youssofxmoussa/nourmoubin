import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, Check, ChevronDown, CornerDownLeft, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SURAHS, arabicDigits, formatMemorizationRange } from "@/lib/quran-surahs";

const toLatinDigits = (value: string) =>
  value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

const normalize = (value: string) =>
  toLatinDigits(value).replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[\u064B-\u0652]/g, "").replace(/^ال/, "").replace(/\s+/g, "").toLowerCase();

const clampAyah = (value: string, min: number, max: number) => {
  const parsed = Math.round(Number(toLatinDigits(value).replace(/\D/g, "")));
  if (!Number.isFinite(parsed) || parsed < min) return min;
  return Math.min(parsed, max);
};

function AyahInput({ label, value, min, max, onChange, onCommit }: { label: string; value: string; min: number; max: number; onChange: (v: string) => void; onCommit: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        dir="rtl"
        value={value}
        onChange={(event) => {
          const digits = toLatinDigits(event.target.value).replace(/\D/g, "").slice(0, 3);
          onChange(digits && Number(digits) > max ? String(max) : digits);
        }}
        onBlur={(event) => onCommit(event.target.value)}
        placeholder={`${arabicDigits(min)} – ${arabicDigits(max)}`}
        className="h-11 w-full rounded-md border border-line bg-background px-3 text-center text-base font-bold outline-none transition placeholder:font-normal placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}

export function QuranRangePicker({ onInsert }: { onInsert: (text: string) => void }) {
  const [surahIndex, setSurahIndex] = useState(0);
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const surah = SURAHS[surahIndex] ?? { number: 1, name: "الفاتحة", ayahs: 7 };
  const fromAyah = clampAyah(from, 1, surah.ayahs);
  const toAyah = to ? Math.max(fromAyah, clampAyah(to, 1, surah.ayahs)) : surah.ayahs;
  const preview = formatMemorizationRange(surahIndex, fromAyah, toAyah);

  const results = useMemo(() => {
    const q = normalize(query);
    return SURAHS.map((item, index) => ({ item, index })).filter(({ item }) => !q || String(item.number) === q || normalize(item.name).includes(q));
  }, [query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(index: number) {
    setSurahIndex(index);
    setFrom("1");
    setTo("");
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="quran-picker mb-4 rounded-lg border border-line bg-note p-3 sm:p-4">
      <p className="flex items-center gap-2 text-sm font-bold">
        <BookOpenText className="size-4 text-primary" />
        اختيار من القرآن الكريم
      </p>
      <div className="mt-3 grid gap-3">
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">السورة</span>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" type="button" className="flex h-11 w-full items-center gap-3 rounded-md border border-line bg-background px-3 text-right transition hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{arabicDigits(surah.number)}</span>
                <span className="min-w-0 flex-1 truncate font-bold">سورة {surah.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{arabicDigits(surah.ayahs)} آية</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent dir="rtl" align="start" sideOffset={6} className="w-[var(--radix-popover-trigger-width)] min-w-[260px] border-line bg-paper p-0 font-sans">
              <div className="flex items-center gap-2 border-b border-line px-3">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") { event.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                    if (event.key === "ArrowUp") { event.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                    if (event.key === "Enter" && results[active]) { event.preventDefault(); choose(results[active].index); }
                  }}
                  placeholder="ابحث باسم السورة أو رقمها"
                  className="h-11 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div ref={listRef} className="max-h-[min(18rem,45vh)] overflow-y-auto overscroll-contain p-1" role="listbox">
                {results.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">لا توجد سورة بهذا الاسم</p>}
                {results.map(({ item, index }, i) => (
                  <Button variant="ghost"
                    type="button"
                    key={item.number}
                    data-i={i}
                    role="option"
                    aria-selected={index === surahIndex}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(index)}
                    className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-right text-sm transition ${i === active ? "bg-primary/10" : ""}`}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-background text-xs font-bold text-muted-foreground">{arabicDigits(item.number)}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{arabicDigits(item.ayahs)} آية</span>
                    <Check className={`size-4 shrink-0 text-primary ${index === surahIndex ? "opacity-100" : "opacity-0"}`} />
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <AyahInput label="من الآية" value={from} min={1} max={surah.ayahs} onChange={setFrom} onCommit={(v) => { const n = clampAyah(v, 1, surah.ayahs); setFrom(String(n)); if (to && clampAyah(to, 1, surah.ayahs) < n) setTo(String(n)); }} />
          <AyahInput label="إلى الآية" value={to} min={fromAyah} max={surah.ayahs} onChange={setTo} onCommit={(v) => { if (v) setTo(String(clampAyah(v, fromAyah, surah.ayahs))); }} />
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <p className="picker-preview min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-sm leading-relaxed">{preview}</p>
        <Button type="button" size="sm" className="h-10" onClick={() => onInsert(preview)}><CornerDownLeft /> إدراج في الخانة</Button>
      </div>
    </div>
  );
}
