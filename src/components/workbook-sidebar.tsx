import { BookOpenText, Folder, FolderOpen, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuranBrand } from "@/components/quran-brand";

export function WorkbookSidebar({ sheets, activeSheet, onChoose, studentPage = false }: {
  sheets: string[]; activeSheet: string; onChoose: (sheet: string) => void; studentPage?: boolean;
}) {
  return <div className="workbook-sidebar">
    <QuranBrand />
    {studentPage && <div className="sidebar-section"><span className="sidebar-page"><UsersRound /> الطلاب</span></div>}
    <div className="sidebar-section"><h2><Folder className="size-4" /> دفاتر المتابعة</h2>
      <nav aria-label="دفاتر المتابعة">{sheets.map((sheet) => <Button key={sheet} variant="ghost" onClick={() => onChoose(sheet)} className={`month-link ${sheet === activeSheet ? "is-active" : ""}`}>
        {sheet === activeSheet ? <FolderOpen /> : <Folder />}<span>{sheet}</span>
      </Button>)}</nav>
    </div>
    <div className="sidebar-bottom"><BookOpenText className="size-4" /><span>سجل طلاب القرآن</span></div>
  </div>;
}