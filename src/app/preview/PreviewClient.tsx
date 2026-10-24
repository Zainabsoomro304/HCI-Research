"use client";

import { useEffect, useMemo, useState } from "react";
import { NullEventSink } from "@/lib/eventLogger";
import { Shop } from "@/components/shop/Shop";
import type { Category } from "@/config/shop";
import { DEFAULT_CONFIG, SETTING_KEYS, SETTING_LEVELS, fromConfigId, toConfigId, type UIConfig } from "@/config/uiSpace";

export function PreviewClient({
  initialConfig,
  category,
  isStatic,
  logToConsole,
}: {
  initialConfig: UIConfig;
  category?: Category;
  isStatic: boolean;
  logToConsole: boolean;
}) {
  const [config, setConfig] = useState(initialConfig);
  const sink = useMemo(() => new NullEventSink(logToConsole), [logToConsole]);
  const [open, setOpen] = useState(true);
  // Lets scripts (screenshots, tests) drive a config change: window.__previewSetConfig("grid3-...")
  useEffect(() => {
    (window as unknown as { __previewSetConfig?: (id: string) => void }).__previewSetConfig = (id) => setConfig(fromConfigId(id));
  }, []);
  return (
    <>
      <Shop config={config} mode="preview" sink={sink} initialCategory={category} instantTransitions={isStatic} />
      {!isStatic && (
        <div className="fixed bottom-4 left-4 z-[60] w-72 rounded-xl border border-black/10 bg-white p-3 font-sans text-[13px] text-[#1c2430] shadow-2xl">
          <div className="flex items-center justify-between">
            <strong>Config preview</strong>
            <button className="rounded px-2 text-[#566070] hover:bg-black/5" onClick={() => setOpen((o) => !o)}>
              {open ? "hide" : "show"}
            </button>
          </div>
          {open && (
            <div className="mt-2 flex flex-col gap-2">
              {SETTING_KEYS.map((k) => (
                <div key={k} className="flex items-center gap-1">
                  <span className="w-16 text-[#566070]">{k}</span>
                  {SETTING_LEVELS[k].map((v) => (
                    <button
                      key={v}
                      onClick={() => setConfig((c) => ({ ...c, [k]: v }))}
                      className={`rounded px-1.5 py-0.5 ${config[k] === v ? "bg-[#2b6a5a] text-white" : "bg-black/5 hover:bg-black/10"}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 border-t border-black/10 pt-2">
                <code className="truncate text-[11px]">{toConfigId(config)}</code>
                <button className="rounded bg-black/5 px-2 py-0.5 hover:bg-black/10" onClick={() => setConfig(DEFAULT_CONFIG)}>
                  reset
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
