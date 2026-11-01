/**
 * Used by `hci simulate`: reads [{ number, seed }] on stdin and prints each participant's trial schedule and Session B
 * block order from the platform's own generators, so synthetic exports have exactly the real trial structure.
 */
import fs from "node:fs";
import rawClips from "@data/clips.json";
import { COMPARISON_DESIGN } from "@/config/study";
import { parseClipsFile } from "@/lib/clipsFile";
import { blockAssignments, latinRows } from "@/lib/latinSquare";
import { generateSchedule } from "@/lib/schedule";

const clips = parseClipsFile(rawClips);
const input = JSON.parse(fs.readFileSync(0, "utf8")) as { number: number; seed: number }[];
const output = input.map(({ number, seed }) => {
  const { conditionRow, taskRow } = latinRows(number);
  return {
    number,
    seed,
    conditionRow,
    taskRow,
    schedule: generateSchedule({
      clips: clips.clips.map((c) => c.id),
      practiceClips: clips.practiceClips.map((c) => c.id),
      design: COMPARISON_DESIGN[3],
      seed,
    }),
    blocks: blockAssignments(conditionRow, taskRow),
  };
});
process.stdout.write(JSON.stringify(output));
