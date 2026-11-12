"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SIDE_BY_SIDE_MIN_WIDTH } from "@/config/study";
import type { EventSink } from "@/lib/eventLogger";
import type { TrialView } from "@/lib/session/types";
import { Button, useLang, useT } from "./ui";

function useSideBySide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const check = () => setWide(window.innerWidth >= SIDE_BY_SIDE_MIN_WIDTH);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return wide;
}

export interface TrialResponse {
  trialId: string;
  choice: "left" | "right";
  rtMs: number | null;
  replayCount: number;
  clientShownAt: number;
  clientBothEndedAt: number | null;
  clientRespondedAt: number;
}

type Phase = "loading" | "playing" | "ready" | "error" | "blocked";
type Side = "left" | "right";

function waitCanPlay(v: HTMLVideoElement) {
  if (v.readyState >= 3) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const ok = () => (cleanup(), resolve());
    const bad = () => (cleanup(), reject(new Error("video error")));
    const cleanup = () => {
      v.removeEventListener("canplay", ok);
      v.removeEventListener("error", bad);
    };
    v.addEventListener("canplay", ok);
    v.addEventListener("error", bad);
  });
}

export function TrialStep({
  trial,
  sink,
  saving,
  onChoose,
}: {
  trial: TrialView;
  sink: EventSink;
  saving: boolean;
  /** Resolves true once the server has saved the choice. */
  onChoose: (r: TrialResponse) => Promise<boolean>;
}) {
  const t = useT();
  const rtl = useLang() === "ur";
  const sideBySide = useSideBySide();
  const left = useRef<HTMLVideoElement>(null);
  const right = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [replayCount, setReplayCount] = useState(0);
  const ended = useRef<Record<Side, boolean>>({ left: false, right: false });
  const bothEndedPerf = useRef<number | null>(null);
  const bothEndedAt = useRef<number | null>(null);
  const shownAt = useRef(Date.now());
  const chosen = useRef(false);

  const playBoth = useCallback(async () => {
    const l = left.current!;
    const r = right.current!;
    try {
      await Promise.all([waitCanPlay(l), waitCanPlay(r)]);
    } catch {
      setPhase("error");
      sink.log("clip_play", { error: true });
      return;
    }
    l.currentTime = 0;
    r.currentTime = 0;
    try {
      await Promise.all([l.play(), r.play()]);
      setPhase((p) => (p === "ready" ? "ready" : "playing"));
    } catch {
      setPhase("blocked"); // autoplay refused: show a play button
    }
  }, [sink]);

  useEffect(() => {
    sink.setContext({ trialId: trial.id, configId: null, practice: trial.isPractice });
    sink.log("trial_shown", { trialIndex: trial.trialIndex, practice: trial.isPractice });
    void playBoth().then(() => sink.log("clip_play", { replay: false }));
  }, [trial.id, trial.trialIndex, trial.isPractice, sink, playBoth]);

  const onEnded = (side: Side) => {
    ended.current[side] = true;
    sink.log("clip_ended", { side });
    if (ended.current.left && ended.current.right && bothEndedPerf.current === null) {
      bothEndedPerf.current = performance.now();
      bothEndedAt.current = Date.now();
      setPhase("ready");
    }
  };

  const replay = () => {
    setReplayCount((n) => n + 1);
    sink.log("clip_replay", { replayCount: replayCount + 1 });
    void playBoth();
  };

  const choose = useCallback(
    (choice: Side) => {
      // Participants may choose as soon as the clips are playing; they do not have to wait for the end.
      if ((phase !== "ready" && phase !== "playing") || saving || chosen.current) return;
      chosen.current = true;
      left.current?.pause();
      right.current?.pause();
      void onChoose({
        trialId: trial.id,
        choice,
        rtMs: bothEndedPerf.current === null ? null : Math.round(performance.now() - bothEndedPerf.current),
        replayCount,
        clientShownAt: shownAt.current,
        clientBothEndedAt: bothEndedAt.current,
        clientRespondedAt: Date.now(),
      }).then((saved) => {
        if (!saved) chosen.current = false; // not accepted (e.g. another request in flight): allow choosing again
      });
    },
    [phase, saving, onChoose, trial.id, replayCount],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // Keys follow what is on screen: in Urdu (right to left) Option A is on the right.
      if (e.key === "ArrowLeft") (e.preventDefault(), choose(rtl ? "right" : "left"));
      if (e.key === "ArrowRight") (e.preventDefault(), choose(rtl ? "left" : "right"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose, rtl]);

  const ready = (phase === "ready" || phase === "playing") && !saving;
  const progressLabel = trial.isPractice
    ? t("trial.practiceProgress", { current: trial.trialIndex, total: trial.total })
    : t("trial.progress", { current: trial.trialIndex, total: trial.total });
  // Side by side on wide screens; stacked (A above B) on narrower tablets, with clear labels on each.
  const videoWidth = sideBySide ? "min(44vw, calc((100vh - 320px) * 1.6))" : "min(88vw, calc((100vh - 400px) / 2 * 1.6))";

  const panel = (side: Side, label: string, url: string, ref: React.RefObject<HTMLVideoElement | null>, chooseLabel: string, key: string) => (
    <div className={`flex items-center gap-[0.6em] ${sideBySide ? "flex-col" : "flex-row"}`} style={sideBySide ? { width: videoWidth } : undefined}>
      <span className="rounded-full bg-[#1d2420] px-[0.9em] py-[0.15em] text-[1.05em] font-bold text-white">{label}</span>
      <div className="relative overflow-hidden rounded-[0.8em] border-2 border-[#c9cec9] bg-[#e9edea] shadow-sm" style={{ aspectRatio: "16 / 10", width: videoWidth }}>
        <video
          ref={ref}
          src={url}
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          onEnded={() => onEnded(side)}
          onError={() => setPhase("error")}
          className="absolute inset-0 h-full w-full object-contain"
        />
      </div>
      <Button onClick={() => choose(side)} disabled={!ready} className={sideBySide ? "min-h-[64px] w-full text-[1.15em]" : "min-h-[64px] min-w-[9em] text-[1.15em]"} ariaKeyshortcuts={key}>
        {chooseLabel}
      </Button>
    </div>
  );

  return (
    <main className="flex min-h-screen flex-col bg-[var(--c-bg)] text-[var(--c-fg)]">
      {trial.preloadUrls.map((u) => (
        <link key={u} rel="prefetch" href={u} as="video" />
      ))}
      <header className="flex items-center gap-[1em] border-b border-[var(--c-border)] bg-white px-[1.5em] py-[0.5em]">
        <span className="whitespace-nowrap text-[0.9em] font-bold text-[var(--c-muted)]">{progressLabel}</span>
        <div
          className="h-[0.55em] flex-1 overflow-hidden rounded-full bg-[#e3e7e4]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={trial.total}
          aria-valuenow={trial.trialIndex - 1}
          aria-label={progressLabel}
        >
          <div className="h-full rounded-full bg-[#1E6B4B] transition-[width]" style={{ width: `${((trial.trialIndex - 1) / trial.total) * 100}%` }} />
        </div>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-[0.9em] px-[1em] py-[0.8em]">
        <h1 className={`text-center text-[1.35em] font-bold ${trial.question === "chooseB" ? "text-[#1E6B4B]" : ""}`}>
          {trial.question === "chooseB" ? t("trial.questionChooseB") : t("trial.question")}
        </h1>
        <div className={`flex items-start justify-center ${sideBySide ? "flex-row gap-[3vw]" : "flex-col gap-[0.8em]"}`}>
          {panel("left", t("trial.optionA"), trial.leftUrl, left, t("trial.chooseA"), rtl ? "ArrowRight" : "ArrowLeft")}
          {panel("right", t("trial.optionB"), trial.rightUrl, right, t("trial.chooseB"), rtl ? "ArrowLeft" : "ArrowRight")}
        </div>
        <div className="flex min-h-[56px] flex-col items-center gap-[0.4em]">
          {phase === "error" ? (
            <div className="flex items-center gap-[0.7em] font-bold text-[var(--c-warning)]">
              {t("trial.videoError")}
              <Button variant="secondary" onClick={() => (setPhase("loading"), left.current?.load(), right.current?.load(), void playBoth())}>
                {t("trial.retryVideo")}
              </Button>
            </div>
          ) : phase === "blocked" ? (
            <Button variant="secondary" onClick={() => void playBoth()}>
              ▶ {t("trial.replay")}
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={replay} disabled={phase !== "ready" || saving} className="min-w-[12em]">
                ↻ {t("trial.replay")}
              </Button>
              <p className="text-[0.85em] text-[var(--c-muted)]">
                {phase === "ready" ? t(rtl ? "trial.keyboardHintRtl" : "trial.keyboardHint") : phase === "loading" ? t("trial.loading") : t(rtl ? "trial.keyboardHintRtl" : "trial.keyboardHint")}
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
