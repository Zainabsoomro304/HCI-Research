import { makeT } from "@/lib/strings";

export default function Home() {
  const t = makeT("en");
  return (
    <main className="grid min-h-screen place-items-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">{t("study.title")}</h1>
        <p className="mt-3 text-[var(--c-muted)]">{t("home.body")}</p>
      </div>
    </main>
  );
}
