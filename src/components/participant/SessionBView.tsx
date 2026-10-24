"use client";

import { useEffect } from "react";
import type { EventLogger } from "@/lib/eventLogger";
import type { SessionBState } from "@/lib/session/sessionBTypes";
import type { ParticipantState } from "@/lib/session/types";
import { BlockIntro, QuestionnaireScreen, RankingScreen, WelcomeScreen } from "../sessionB/Screens";
import { TaskRunner } from "../sessionB/TaskRunner";
import { EndStep, MessagePage } from "./SimpleSteps";
import { useT } from "./ui";

/** Session B participant flow. The researcher unlocks it from the admin panel; until then the page waits. */
export function SessionBView({
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
  const s = state as SessionBState;

  // While locked, poll until the researcher starts the session, then switch in place (no reload, no lost clicks).
  useEffect(() => {
    if (s.step !== "locked") return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/s/${token}`, { cache: "no-store" }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { state?: SessionBState } | null;
      if (body?.state && body.state.step !== "locked") onRefresh(body.state);
    }, 4000);
    return () => clearInterval(id);
  }, [s.step, token, onRefresh]);

  switch (s.step) {
    case "locked":
      return <MessagePage title={t("sb.locked.title")} body={t("sb.locked.body")} />;
    case "welcome":
      return <WelcomeScreen onStart={() => void act({ type: "welcome_done" })} />;
    case "block_intro":
      return <BlockIntro block={s.block!} total={s.totalBlocks ?? 4} onStart={() => void act({ type: "block_intro_done", blockIndex: s.block!.blockIndex })} />;
    case "practice_task":
    case "task":
      return <TaskRunner key={s.block!.blockId} block={s.block!} sink={sink} saving={saving} onFinish={(f) => act({ type: "task_finish", ...f })} />;
    case "quis":
    case "ues_sf": {
      const q = s.questionnaire!;
      return (
        <QuestionnaireScreen
          key={`${q.instrument}-${q.blockIndex}`}
          number={q.number}
          title={q.title}
          instructions={q.instructions}
          items={q.items}
          onSubmit={(responses) => act({ type: "questionnaire", blockIndex: q.blockIndex, instrument: q.instrument, responses })}
        />
      );
    }
    case "ranking":
      return <RankingScreen interfaces={s.ranking!.interfaces} onSubmit={(ranks) => act({ type: "ranking", ranks })} />;
    case "end":
      return <EndStep variant="sessionB" completionCode={null} />;
  }
}
