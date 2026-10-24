import { notFound } from "next/navigation";
import { CATEGORIES, type Category } from "@/config/shop";
import { DEFAULT_CONFIG_ID, isConfigId, fromConfigId } from "@/config/uiSpace";
import { PreviewClient } from "./PreviewClient";

export const dynamic = "force-dynamic";

/**
 * Researcher preview of any configuration: /preview?config=<id>&category=<name>&static=1
 * `static=1` hides the control panel and disables transitions (used by `pnpm screenshots`).
 * `log=1` prints every interaction event to the browser console (nothing is stored).
 */
export default async function PreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const id = sp.config ?? DEFAULT_CONFIG_ID;
  if (!isConfigId(id)) notFound();
  const category = (CATEGORIES as readonly string[]).includes(sp.category ?? "") ? (sp.category as Category) : undefined;
  return <PreviewClient initialConfig={fromConfigId(id)} category={category} isStatic={sp.static === "1"} logToConsole={sp.log === "1"} />;
}
