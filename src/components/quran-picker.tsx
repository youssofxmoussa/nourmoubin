import { useState } from "react";
import { BookOpenText, CornerDownLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SURAHS, arabicDigits, formatMemorizationRange } from "@/lib/quran-surahs";

const parseAyah = (value: string, max: number) => {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, max);
};

export function QuranRangePicker({ onInsert }: { onInsert: (text: string) => void }) {
  const [surahIndex, setSurahIndex] = useState(0);
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("1");

  const surah = SURAHS[surahIndex] ?? SURAHS[0] ?? { number: 1, name: "الفاتحة", ayahs: 7 };
  const fromAyah = parseAyah(from, surah.ayahs);
  const toAyah = Math.max(fromAyah, parseAyah(to, surah.ayahs));
  const preview = formatMemorizationRange(surahIndex, fromAyah, toAyah);

  function commitFrom(value: string) {
    const next = parseAyah(value, surah.ayahs);
    setFrom(String(next));
    if (parseAyah(to, surah.ayahs) < next) setTo(String(next));
  }

  function commitTo(value: string) {
    setTo(String(Math.max(fromAyah, parseAyah(value, surah.ayahs))));
  }

  return (
    <div className="mb-4 rounded-md border border-line bg-note p-4">
      <p className="flex items-center gap-2 text-sm font-black">
        <BookOpenText className="size-4 text-primary" />
        اختيار من القرآن الكريم
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">السورة</span>
          <Select
            value={String(surahIndex)}
            onValueChange={(value) => {
              setSurahIndex(Number(value));
              setFrom("1");
              setTo("1");
            }}
            dir="rtl"
          >
            <SelectTrigger className="h-11 bg-background font-black">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72 border-line bg-paper font-sans">
              {SURAHS.map((item, index) => (
                <SelectItem key={item.number} value={String(index)} className="py-2.5 pr-8">
                  <span className="flex w-full items-center justify-between gap-6">
                    <span>سورة {item.name}</span>
                    <span className="text-xs text-muted-foreground">{arabicDigits(item.ayahs)} آية</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">من الآية</span>
            <Input type="number" min={1} max={surah.ayahs} inputMode="numeric" value={from} onChange={(event) => setFrom(event.target.value)} onBlur={(event) => commitFrom(event.target.value)} placeholder={`من ١ إلى ${arabicDigits(surah.ayahs)}`} className="h-11" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">إلى الآية</span>
            <Input type="number" min={fromAyah} max={surah.ayahs} inputMode="numeric" value={to} onChange={(event) => setTo(event.target.value)} onBlur={(event) => commitTo(event.target.value)} placeholder={`من ${arabicDigits(fromAyah)} إلى ${arabicDigits(surah.ayahs)}`} className="h-11" />
          </label>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 truncate rounded-md border border-line bg-background px-3 py-2 text-sm" title={preview}>{preview}</p>
        <Button size="sm" onClick={() => { commitFrom(from); commitTo(to); onInsert(preview); }}><CornerDownLeft /> إدراج في الخانة</Button>
      </div>
    </div>
  );
}
