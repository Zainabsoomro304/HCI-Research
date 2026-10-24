/** Session B state machine (implemented in Milestone 5). */
import type { Participant, Session } from "@prisma/client";
import { ActionError } from "./comparison";
import type { SessionBState } from "./sessionBTypes";

export async function buildSessionBState(s: Session & { participant: Participant }): Promise<SessionBState> {
  return { kind: "sessionB", step: "locked", lang: s.participant.language };
}

export async function applySessionBAction(_s: Session & { participant: Participant }, _body: unknown): Promise<void> {
  throw new ActionError("Session B is not available yet", 409);
}
