import { notFound } from "next/navigation";
import { fromConfigId, isConfigId } from "@/config/uiSpace";
import { ClipClient } from "./ClipClient";

export const dynamic = "force-dynamic";

/**
 * Clip mode: /clip?target=<configId>&seed=<n>
 * Renders the shop in a fixed state starting from the base config. The recorder drives the transition
 * through window.__clip (see ClipClient). Extra flags for researchers:
 *   &autoplay=1  play the 4-second timeline in real time
 *   &static=1    render the target config at rest (stills)
 */
export default async function ClipPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (!sp.target || !isConfigId(sp.target)) notFound();
  return (
    <ClipClient
      target={fromConfigId(sp.target)}
      seed={Number(sp.seed ?? 0) || 0}
      autoplay={sp.autoplay === "1"}
      isStatic={sp.static === "1"}
    />
  );
}
