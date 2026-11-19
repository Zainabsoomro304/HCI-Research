"use client";

import { useEffect } from "react";
import type { EventLogger } from "@/lib/eventLogger";
import type { ShoppingState } from "@/lib/session/shoppingTypes";
import type { ParticipantState } from "@/lib/session/types";
import { BlockIntro, QuestionnaireScreen, RankingScreen, WelcomeScreen } from "../shopping/Screens";
import { TaskRunner } from "../shopping/TaskRunner";
import { ConsentStep } from "./ConsentAndBackground";
import { EndStep, MessagePage } from "./SimpleSteps";
import { useT } from "./ui";

/** Shopping session (Session 2) participant flow. The researcher starts it from the admin panel; until then the page waits. */
export function ShoppingView({
  token,
  state,
  act,
  sink,
  saving,
  onRefresh,
}: {
  token: string;
  state: ParticipantState;
  act: (a: Record<string, unknown>) => Promise<boolean>;
  sink: EventLogger;
  saving: boolean;
  onRefresh: (s: ParticipantState) => void;
}) {
  const t = useT();
  const s = state as ShoppingState;

  // While locked, poll until the researcher starts the session, then switch in place (no reload, no lost clicks).
  useEffect(() => {
    if (s.step !== "locked") return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/s/${token}`, { cache: "no-store" }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { state?: ShoppingState } | null;
      if (body?.state && body.state.step !== "locked") onRefresh(body.state);
    }, 4000);
    return () => clearInterval(id);
  }, [s.step, token, onRefresh]);

  switch (s.step) {
    case "locked":
      return <MessagePage title={t("sb.locked.title")} body={t("sb.locked.body")} />;
    case "consent":
      return (
        <ConsentStep
          reconfirm
          markdown={s.consent!.markdown}
          hash={s.consent!.hash}
          onAgree={(hash, confirmations) => void act({ type: "consent", agreed: true, confirmations, hash, clientTs: Date.now() })}
        />
      );
    case "welcome":
      return <WelcomeScreen onStart={() => void act({ type: "welcome_done" })} />;
    case "block_intro":
      return <BlockIntro block={s.block!} total={s.totalBlocks ?? 4} onStart={() => void act({ type: "block_intro_done", blockIndex: s.block!.blockIndex })} />;
    case "practice_task":
    case "task":
      return <TaskRunner key={s.block!.blockId} block={s.block!} sink={sink} saving={saving} onFinish={(f) => act({ type: "task_finish", ...f })} />;
    case "seq":
    case "sus": {
      const q = s.questionnaire!;
      return (
        <QuestionnaireScreen
          key={`${q.instrument}-${q.blockIndex}`}
          number={q.number}
          title={q.title}
          instructions={q.instructions}
          scale={q.scale}
          items={q.items}
          onSubmit={(responses) => act({ type: "questionnaire", blockIndex: q.blockIndex, instrument: q.instrument, responses })}
        />
      );
    }
    case "ranking":
      return <RankingScreen interfaces={s.ranking!.interfaces} onSubmit={(ranks) => act({ type: "ranking", ranks })} />;
    case "end":
      return <EndStep session="shopping" participantCode={s.participantCode} />;
  }
}
