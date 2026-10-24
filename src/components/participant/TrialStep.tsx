"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventSink } from "@/lib/eventLogger";
import type { TrialView } from "@/lib/session/types";
import { Button, useT } from "./ui";

export interface TrialResponse {
  trialId: string;
  choice: "left" | "right";
  rtMs: number;
  replayCount: number;
  clientShownAt: number;
  clientBothEndedAt: number;
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
      if (phase !== "ready" || saving || chosen.current || bothEndedPerf.current === null) return;
      chosen.current = true;
      left.current?.pause();
      right.current?.pause();
      void onChoose({
        trialId: trial.id,
        choice,
        rtMs: Math.round(performance.now() - bothEndedPerf.current),
        replayCount,
        clientShownAt: shownAt.current,
        clientBothEndedAt: bothEndedAt.current!,
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
      if (e.key === "ArrowLeft") (e.preventDefault(), choose("left"));
      if (e.key === "ArrowRight") (e.preventDefault(), choose("right"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose]);

  const ready = phase === "ready" && !saving;
  const progressLabel = trial.isPractice
    ? t("trial.practiceProgress", { current: trial.trialIndex, total: trial.total })
    : t("trial.progress", { current: trial.trialIndex, total: trial.total });
  const videoWidth = "min(45vw, calc((100vh - 270px) * 1.6))";

  const panel = (side: Side, label: string, url: string, ref: React.RefObject<HTMLVideoElement | null>, chooseLabel: string, key: string) => (
    <div className="flex flex-col items-center gap-3" style={{ width: videoWidth }}>
      <span className="grid size-9 place-items-center rounded-full bg-[var(--c-fg)] text-[17px] font-bold text-white">{label}</span>
      <div className="relative w-full overflow-hidden rounded-xl border border-[var(--c-border)] bg-[#e9edf1] shadow-sm" style={{ aspectRatio: "16 / 10" }}>
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
      <Button onClick={() => choose(side)} disabled={!ready} className="w-full py-3 text-[17px]" ariaKeyshortcuts={key}>
        {chooseLabel}
      </Button>
    </div>
  );

  return (
    <main className="flex min-h-screen flex-col bg-[var(--c-bg)] text-[var(--c-fg)]">
      {trial.preloadUrls.map((u) => (
        <link key={u} rel="prefetch" href={u} as="video" />
      ))}
      <header className="flex items-center gap-4 border-b border-[var(--c-border)] bg-white px-8 py-3">
        <span className="whitespace-nowrap text-[14px] font-semibold text-[var(--c-muted)]">{progressLabel}</span>
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-[#e3e7ec]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={trial.total}
          aria-valuenow={trial.trialIndex - 1}
          aria-label={progressLabel}
        >
          <div className="h-full rounded-full bg-[var(--c-accent)] transition-[width]" style={{ width: `${((trial.trialIndex - 1) / trial.total) * 100}%` }} />
        </div>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-5">
        <h1 className={`text-center text-[22px] font-bold ${trial.question === "chooseB" ? "text-[var(--c-accent)]" : ""}`}>
          {trial.question === "chooseB" ? t("trial.questionChooseB") : t("trial.question")}
        </h1>
        <div className="flex items-start justify-center gap-[4vw]">
          {panel("left", t("trial.labelA"), trial.leftUrl, left, t("trial.preferA"), "ArrowLeft")}
          {panel("right", t("trial.labelB"), trial.rightUrl, right, t("trial.preferB"), "ArrowRight")}
        </div>
        <div className="flex min-h-[44px] flex-col items-center gap-2">
          {phase === "error" ? (
            <div className="flex items-center gap-3 text-[15px] text-[var(--c-warning)]">
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
              <Button variant="secondary" onClick={replay} disabled={phase !== "ready" || saving}>
                ↻ {t("trial.replay")}
              </Button>
              <p className="text-[13px] text-[var(--c-muted)]">{phase === "ready" ? t("trial.keyboardHint") : phase === "loading" ? t("trial.loading") : t("trial.watchFirst")}</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
