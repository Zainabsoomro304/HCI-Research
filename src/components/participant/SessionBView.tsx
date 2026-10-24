"use client";

import type { EventLogger } from "@/lib/eventLogger";
import type { ParticipantState } from "@/lib/session/types";
import { MessagePage } from "./SimpleSteps";

/** Session B participant flow (Milestone 5). */
export function SessionBView(_props: { token: string; state: ParticipantState; act: (a: Record<string, unknown>) => Promise<boolean>; sink: EventLogger; saving: boolean }) {
  return <MessagePage title="Session B" body="Please wait for the researcher." />;
}
