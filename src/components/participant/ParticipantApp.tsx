"use client";

import { useEffect, useMemo } from "react";
import { COMPARISON_DESIGN, type StudyPhase } from "@/config/study";
import { EventLogger } from "@/lib/eventLogger";
import type { ComparisonState, ParticipantState } from "@/lib/session/types";
import { makeT } from "@/lib/strings";
import { BackgroundStep, ConsentStep } from "./ConsentAndBackground";
import { BreakStep, EndStep, InstructionsStep, MainIntroStep, MessagePage } from "./SimpleSteps";
import { SessionBView } from "./SessionBView";
import { TrialStep } from "./TrialStep";
import { DesktopGate, SavingBanner, TContext } from "./ui";
import { useSessionActions } from "./useSessionActions";

export function ParticipantApp({
  token,
  initialState,
  studyPhase,
}: {
  token: string;
  initialState: ParticipantState;
  studyPhase: StudyPhase;
}) {
  const t = useMemo(() => makeT(initialState.lang), [initialState.lang]);
  const { state, act, status, fatal } = useSessionActions(token, initialState);
  const sink = useMemo(() => new EventLogger(token), [token]);

  useEffect(() => {
    sink.start();
    // Session metadata (app version, viewport, user agent). Sent outside the action queue so it never blocks a choice.
    const body = JSON.stringify({ type: "start", viewport: { w: window.innerWidth, h: window.innerHeight }, userAgent: navigator.userAgent });
    const send = (attempt: number) =>
      fetch(`/api/s/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {
        if (attempt < 5) setTimeout(() => send(attempt + 1), 2000 * (attempt + 1));
      });
    void send(0);
    return () => sink.stop();
  }, [sink, token]);

  useEffect(() => {
    sink.log("page_view", { step: state.step });
    if (state.step !== "trials" && state.step !== "practice") sink.setContext({ trialId: null });
  }, [sink, state.step]);

  let content: React.ReactNode;
  if (fatal) {
    content = <MessagePage title={t("study.error.title")} body={t("study.error.body")} action={{ label: t("study.reload"), onClick: () => location.reload() }} />;
  } else if (state.kind === "sessionB") {
    content = <SessionBView token={token} state={state} act={act} sink={sink} saving={status !== "idle"} />;
  } else {
    content = <ComparisonView token={token} state={state} act={act} sink={sink} saving={status !== "idle"} studyPhase={studyPhase} />;
  }

  return (
    <TContext.Provider value={t}>
      <DesktopGate>
        <SavingBanner status={status} />
        {content}
      </DesktopGate>
    </TContext.Provider>
  );
}

function ComparisonView({
  token,
  state,
  act,
  sink,
  saving,
  studyPhase,
}: {
  token: string;
  state: ComparisonState;
  act: (a: Record<string, unknown>) => Promise<boolean>;
  sink: EventLogger;
  saving: boolean;
  studyPhase: StudyPhase;
}) {
  const design = COMPARISON_DESIGN[studyPhase];
  switch (state.step) {
    case "consent":
      return <ConsentStep markdown={state.consent!.markdown} hash={state.consent!.hash} onAgree={(hash) => void act({ type: "consent", agreed: true, hash, clientTs: Date.now() })} />;
    case "background":
      return <BackgroundStep token={token} onSubmit={(answers) => act({ type: "background", answers, clientTs: Date.now() })} />;
    case "instructions":
      return <InstructionsStep practiceCount={design.practiceTrials} onStart={() => void act({ type: "instructions_done" })} />;
    case "main_intro":
      return <MainIntroStep total={state.progress!.total} every={design.breakEvery} onStart={() => void act({ type: "main_intro_done" })} />;
    case "practice":
    case "trials":
      return state.trial ? (
        <TrialStep key={state.trial.id} trial={state.trial} sink={sink} saving={saving} onChoose={(r) => act({ type: "trial", ...r })} />
      ) : null;
    case "break":
      return <BreakStep done={state.breakInfo!.afterTrialIndex} total={state.breakInfo!.total} onContinue={() => void act({ type: "break_end", clientTs: Date.now() })} />;
    case "end":
      return <EndStep variant={state.end!.variant} completionCode={state.end!.completionCode} />;
  }
}
