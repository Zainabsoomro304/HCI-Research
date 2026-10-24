import type { Metadata } from "next";
import { ParticipantApp } from "@/components/participant/ParticipantApp";
import { MessagePage } from "@/components/participant/SimpleSteps";
import type { StudyPhase } from "@/config/study";
import { buildState, getSessionByToken } from "@/lib/session";
import { makeT } from "@/lib/strings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Online shopping study", referrer: "no-referrer" };

export default async function SessionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getSessionByToken(token);
  if (!session) {
    const t = makeT("en");
    return <MessagePage title={t("study.invalidLink.title")} body={t("study.invalidLink.body")} />;
  }
  const state = await buildState(session);
  return (
    <ParticipantApp
      token={token}
      initialState={state}
      studyPhase={session.participant.studyPhase as StudyPhase}
    />
  );
}
