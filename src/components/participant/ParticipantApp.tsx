"use client";

import { useEffect, useMemo } from "react";
import { COMPARISON_DESIGN } from "@/config/study";
import { EventLogger } from "@/lib/eventLogger";
import type { ComparisonState, ParticipantState } from "@/lib/session/types";
import { makeT } from "@/lib/strings";
import { BackgroundStep, ConsentStep } from "./ConsentAndBackground";
import { ShoppingView } from "./ShoppingView";
import { BreakStep, EndStep, IneligibleStep, InstructionsStep, LanguageStep, MainIntroStep, MessagePage } from "./SimpleSteps";
import { TrialStep } from "./TrialStep";
import { DeviceGate, SavingBanner, StudyRoot, TContext } from "./ui";
import { useSessionActions } from "./useSessionActions";

export function ParticipantApp({ token, initialState }: { token: string; initialState: ParticipantState }) {
  const { state, act, status, fatal, replaceState } = useSessionActions(token, initialState);
  const t = useMemo(() => makeT(state.lang), [state.lang]);
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
    sink.log("page_view", { step: state.step, lang: state.lang });
    if (state.step !== "trials" && state.step !== "practice") sink.setContext({ trialId: null });
  }, [sink, state.step, state.lang]);

  let content: React.ReactNode;
  if (fatal) {
    content = <MessagePage title={t("study.error.title")} body={t("study.error.body")} action={{ label: t("study.reload"), onClick: () => location.reload() }} />;
  } else if (state.notReady) {
    content = <MessagePage title={t("study.notReady.title")} body={t("study.notReady.body")} />;
  } else if (state.kind === "shopping") {
    content = <ShoppingView token={token} state={state} act={act} sink={sink} saving={status !== "idle"} onRefresh={replaceState} />;
  } else {
    content = <ComparisonView token={token} state={state} act={act} sink={sink} saving={status !== "idle"} />;
  }

  return (
    <StudyRoot lang={state.lang}>
      <TContext.Provider value={t}>
        <DeviceGate>
          <SavingBanner status={status} />
          {content}
        </DeviceGate>
      </TContext.Provider>
    </StudyRoot>
  );
}

function ComparisonView({
  token,
  state,
  act,
  sink,
  saving,
}: {
  token: string;
  state: ComparisonState;
  act: (a: Record<string, unknown>) => Promise<boolean>;
  sink: EventLogger;
  saving: boolean;
}) {
  const design = COMPARISON_DESIGN;
  switch (state.step) {
    case "language":
      return <LanguageStep current={state.lang} onChoose={(lang) => void act({ type: "language", lang })} />;
    case "consent":
      return (
        <ConsentStep
          markdown={state.consent!.markdown}
          hash={state.consent!.hash}
          onAgree={(hash, confirmations) => void act({ type: "consent", agreed: true, confirmations, hash, clientTs: Date.now() })}
        />
      );
    case "background":
      return (
        <BackgroundStep
          token={token}
          onSubmit={(answers) => act({ type: "background", answers, clientTs: Date.now() })}
          onScreenOut={(age) => act({ type: "screen_out", age, clientTs: Date.now() })}
        />
      );
    case "ineligible":
      return <IneligibleStep />;
    case "instructions":
      return <InstructionsStep practiceCount={design.practiceTrials} onStart={() => void act({ type: "instructions_done" })} />;
    case "main_intro":
      return <MainIntroStep total={state.progress!.total} breaks={design.breakAfter.length} onStart={() => void act({ type: "main_intro_done" })} />;
    case "practice":
    case "trials":
      return state.trial ? <TrialStep key={state.trial.id} trial={state.trial} sink={sink} saving={saving} onChoose={(r) => act({ type: "trial", ...r })} /> : null;
    case "break":
      return <BreakStep done={state.breakInfo!.afterTrialIndex} total={state.breakInfo!.total} onContinue={() => void act({ type: "break_end", clientTs: Date.now() })} />;
    case "end":
      return <EndStep session="comparison" participantCode={state.participantCode} />;
  }
}
