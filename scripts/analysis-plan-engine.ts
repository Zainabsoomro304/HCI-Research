/**
 * Used by the parity test: reads { included: [{ code, trials }], outside: [...] } on stdin and prints the plan engine's
 * result. The TypeScript engine is canonical for plans; analysis/src/hci/parity.py computes the same thing in Python.
 */
import fs from "node:fs";
import { computePlans, type EngineParticipant } from "@/lib/planEngine/engine";

const input = JSON.parse(fs.readFileSync(0, "utf8")) as { included: EngineParticipant[]; outside?: EngineParticipant[] };
const start = Date.now();
const result = computePlans(input.included, input.outside ?? []);
process.stdout.write(JSON.stringify({ ...result, elapsedMs: Date.now() - start }));
