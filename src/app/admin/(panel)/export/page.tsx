"use client";

import { useState } from "react";

export default function ExportPage() {
  const [phase, setPhase] = useState("");
  const [completed, setCompleted] = useState(false);
  const [excludeFailed, setExcludeFailed] = useState(false);
  const [practice, setPractice] = useState(false);
  const q = new URLSearchParams();
  if (phase) q.set("phase", phase);
  if (completed) q.set("completed", "1");
  if (excludeFailed) q.set("excludeFailed", "1");
  if (practice) q.set("practice", "1");
  const href = `/api/admin/export${q.size ? `?${q}` : ""}`;
  return (
    <section className="max-w-2xl rounded-xl border border-[#dfe3e8] bg-white p-6">
      <h1 className="text-lg font-bold">Export data</h1>
      <p className="mt-1 text-sm text-[#566070]">
        Downloads a ZIP with one UTF-8 CSV per table (participants, questionnaire_background, comparison_trials, breaks, task_trials, questionnaire_task, rankings,
        events) and <code>codebook.md</code> describing every column.
      </p>
      <div className="mt-5 flex flex-col gap-3 text-sm">
        <label className="flex items-center gap-3">
          <span className="w-40 font-medium">Study phase</span>
          <select value={phase} onChange={(e) => setPhase(e.target.value)} className="rounded-md border border-[#d5dbe3] px-2 py-1.5">
            <option value="">All</option>
            <option value="1">Phase 1</option>
            <option value="3">Phase 3</option>
          </select>
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={completed} onChange={(e) => setCompleted(e.target.checked)} />
          Completed sessions only
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={excludeFailed} onChange={(e) => setExcludeFailed(e.target.checked)} />
          Exclude participants who failed attention checks
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} />
          Include the Session B practice task and its events
        </label>
      </div>
      <a href={href} className="mt-6 inline-block rounded-md bg-[#2b6a5a] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#235a4c]">
        Download ZIP
      </a>
    </section>
  );
}
