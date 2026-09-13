import { createFileRoute } from "@tanstack/react-router";
import { QuranDashboard } from "@/components/quran-dashboard";
import { getQuranSheet } from "@/lib/quran-sheet.functions";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  loader: () => getQuranSheet({ data: {} }),
  head: () => ({
    meta: [
      { title: "سجل طلاب القرآن | النور المبين" },
      { name: "description", content: "لوحة عربية لمتابعة طلاب دورة القرآن وتحديث الحضور والملاحظات أسبوعياً." },
      { property: "og:title", content: "سجل طلاب القرآن | النور المبين" },
      { property: "og:description", content: "متابعة مرنة ومنظمة لطلاب دورة القرآن." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  const data = Route.useLoaderData();
  return <QuranDashboard initialData={data} />;
}
