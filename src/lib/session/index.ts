import { z } from "zod";
import { prisma } from "../db";
import { ActionError, applyComparisonAction, buildComparisonState } from "./comparison";
import { ComparisonActionSchema, type ParticipantState } from "./types";

export { ActionError };

export async function getSessionByToken(token: string) {
  if (!/^[A-Za-z0-9]{8,64}$/.test(token)) return null;
  return prisma.session.findUnique({ where: { token }, include: { participant: true } });
}

type LoadedSession = NonNullable<Awaited<ReturnType<typeof getSessionByToken>>>;

export async function buildState(s: LoadedSession): Promise<ParticipantState> {
  if (s.type === "shopping") {
    const { buildShoppingState } = await import("./shopping");
    return buildShoppingState(s);
  }
  return buildComparisonState(s);
}

export async function applyAction(s: LoadedSession, body: unknown): Promise<void> {
  if (s.type === "shopping") {
    const { applyShoppingAction } = await import("./shopping");
    return applyShoppingAction(s, body);
  }
  const parsed = ComparisonActionSchema.safeParse(body);
  if (!parsed.success) throw new ActionError(z.prettifyError(parsed.error), 400);
  return applyComparisonAction(s, parsed.data);
}
