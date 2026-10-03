import emblem from "@/assets/quran-emblem.png";

export function QuranBrand({ compact = false }: { compact?: boolean }) {
  return <div className={`quran-brand ${compact ? "is-compact" : ""}`}>
    <img src={emblem} width={80} height={80} alt="" />
    <div><strong>النور المبين</strong>{!compact && <p>معاً نحو جيل محب للقرآن</p>}</div>
  </div>;
}