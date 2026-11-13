import { MarkReviewedButton } from "@/components/admin/Translations";
import { translationStatus } from "@/lib/translations";

export const dynamic = "force-dynamic";

const GROUPS = { interface: "Interface text", products: "Products", tasks: "Tasks" } as const;

/** Urdu strings still needing native-speaker review, with English and Urdu side by side. */
export default async function TranslationsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const all = await translationStatus();
  const pending = all.filter((i) => i.needsReview);
  const list = show === "all" ? all : pending;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-bold">Urdu translations</h1>
        <span className="rounded-full bg-[#fdf3dc] px-3 py-1 text-sm font-semibold text-[#7a5a10]">
          {pending.length} of {all.length} still need native review
        </span>
        <a href={show === "all" ? "/admin/translations" : "/admin/translations?show=all"} className="text-sm underline">
          {show === "all" ? "Show only strings needing review" : "Show all strings"}
        </a>
      </div>
      <p className="max-w-3xl text-sm text-[#566070]">
        Every Urdu string was drafted without native review. Mark a string as reviewed once a native speaker has checked it, or correct it in
        <code> content/strings.ur.json</code>, <code>data/catalog.json</code> or <code>data/tasks.json</code> first. Consent text (a placeholder) and the questionnaires are not listed here: review the Urdu questionnaire files in content/questionnaires/ directly.
      </p>
      {(Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((group) => {
        const rows = list.filter((i) => i.group === group);
        if (!rows.length) return null;
        return (
          <section key={group} className="rounded-xl border border-[#dfe3e8] bg-white p-5">
            <h2 className="mb-3 font-bold">
              {GROUPS[group]} ({rows.length})
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[#566070]">
                  <th className="w-56 py-1 pr-3">Key</th>
                  <th className="py-1 pr-3">English</th>
                  <th className="py-1 pr-3 text-right">Urdu</th>
                  <th className="w-40 py-1" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-[#eef1f4] align-top">
                    <td className="py-2 pr-3 font-mono text-xs text-[#566070]">{r.key}</td>
                    <td className="py-2 pr-3">{r.en}</td>
                    <td dir="rtl" lang="ur" className="py-2 pr-3 text-right text-base leading-loose">
                      {r.ur}
                    </td>
                    <td className="py-2">{r.needsReview ? <MarkReviewedButton translationKey={r.key} /> : <span className="text-xs text-[#1d4d41]">Reviewed {r.reviewedAt?.toLocaleDateString() ?? "(baseline)"}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
