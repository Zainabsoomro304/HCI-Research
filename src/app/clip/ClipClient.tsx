"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shop } from "@/components/shop/Shop";
import { CLIP_CATEGORY, CLIP_PRODUCT_COUNT } from "@/config/shop";
import { DEFAULT_CONFIG, type UIConfig } from "@/config/uiSpace";
import { CLIP_SET } from "@/lib/clipsFile";
import { products } from "@/lib/catalog";

/** Fixed product set shown in every clip: the first N products of the clip category. */
const CLIP_PRODUCT_IDS = products.filter((p) => p.category === CLIP_CATEGORY).slice(0, CLIP_PRODUCT_COUNT).map((p) => p.id);

export interface ClipController {
  /** Resolves when fonts and images are loaded and the base frame is painted. */
  ready(): Promise<void>;
  /** Starts the base -> target transition and pauses it at t = 0. Returns the number of animations. */
  start(): Promise<number>;
  /** Moves the paused transition to `ms` (0-400). */
  seek(ms: number): Promise<void>;
  /** Completes the transition; resolves when the target is painted at rest. */
  finish(): Promise<void>;
}

declare global {
  interface Window {
    __clip?: ClipController;
  }
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

async function waitForAssets() {
  await document.fonts.ready;
  await Promise.all(
    Array.from(document.images).map((img) =>
      img.complete
        ? img.decode().catch(() => undefined)
        : new Promise<void>((r) => {
            img.addEventListener("load", () => r(), { once: true });
            img.addEventListener("error", () => r(), { once: true });
          }),
    ),
  );
  await nextFrame();
}

export function ClipClient({ target, seed, autoplay, isStatic }: { target: UIConfig; seed: number; autoplay: boolean; isStatic: boolean }) {
  const [config, setConfig] = useState<UIConfig>(isStatic ? target : DEFAULT_CONFIG);
  const vtWaiter = useRef<((vt: ViewTransition) => void) | null>(null);
  const anims = useRef<Animation[]>([]);
  const vtRef = useRef<ViewTransition | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("clip-mode");
    return () => document.documentElement.classList.remove("clip-mode");
  }, []);

  const onTransitionStart = useCallback((vt: ViewTransition) => {
    vtRef.current = vt;
    vtWaiter.current?.(vt);
  }, []);

  useEffect(() => {
    const controller: ClipController = {
      ready: waitForAssets,
      async start() {
        const vtPromise = new Promise<ViewTransition>((r) => (vtWaiter.current = r));
        setConfig(target);
        const vt = await vtPromise;
        await vt.ready;
        anims.current = document.getAnimations();
        for (const a of anims.current) {
          a.pause();
          a.currentTime = 0;
        }
        return anims.current.length;
      },
      async seek(ms) {
        for (const a of anims.current) a.currentTime = ms;
        await nextFrame();
      },
      async finish() {
        for (const a of anims.current) a.finish();
        await vtRef.current?.finished.catch(() => undefined);
        await waitForAssets();
      },
    };
    window.__clip = controller;
    if (autoplay) {
      void waitForAssets().then(() => setTimeout(() => setConfig(target), CLIP_SET.transitionStartMs));
    }
    return () => {
      delete window.__clip;
    };
  }, [target, autoplay]);

  const productIds = useMemo(() => CLIP_PRODUCT_IDS, []);
  return (
    <div data-clip-seed={seed}>
      <Shop
        config={config}
        mode="clip"
        initialCategory={CLIP_CATEGORY}
        productIds={productIds}
        onTransitionStart={onTransitionStart}
        instantTransitions={isStatic}
      />
    </div>
  );
}
