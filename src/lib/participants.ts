import { randomBytes } from "node:crypto";
import type { ParticipantGroup, SessionType } from "@prisma/client";
import { prisma } from "./db";
import { newSeed } from "./random";

const TOKEN_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Unguessable session token (24 chars, ~140 bits). */
export function generateToken(length = 24): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
}

/** Random completion code for Phase 1 (no ambiguous characters). */
export function generateCompletionCode(): string {
  const raw = generateToken(8).toUpperCase().replace(/[^A-Z2-9]/g, "X");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

export function participantCode(phase: number, n: number): string {
  return `P${phase}-${String(n).padStart(3, "0")}`;
}

export function sessionTypesFor(phase: number): SessionType[] {
  return phase === 1 ? ["phase1"] : ["p3_sessionA", "p3_sessionB"];
}

export function sessionLink(token: string): string {
  const base = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/s/${token}`;
}

export interface CreateParticipantsInput {
  studyPhase: 1 | 3;
  count: number;
  group?: ParticipantGroup;
  language?: string;
  notes?: string;
}

/** Creates participants with sequential codes, a random seed each, and their session(s) with fresh tokens. */
export async function createParticipants(input: CreateParticipantsInput) {
  if (input.count < 1 || input.count > 200) throw new Error("count must be 1-200");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const last = await tx.participant.findFirst({ where: { studyPhase: input.studyPhase }, orderBy: { number: "desc" } });
        const start = (last?.number ?? 0) + 1;
        const created = [];
        for (let i = 0; i < input.count; i++) {
          const number = start + i;
          created.push(
            await tx.participant.create({
              data: {
                code: participantCode(input.studyPhase, number),
                studyPhase: input.studyPhase,
                number,
                seed: newSeed(),
                group: input.group ?? "unknown",
                groupSource: input.group && input.group !== "unknown" ? "admin" : null,
                language: input.language ?? "en",
                notes: input.notes,
                sessions: { create: sessionTypesFor(input.studyPhase).map((type) => ({ type, token: generateToken() })) },
              },
              include: { sessions: true },
            }),
          );
        }
        return created;
      });
    } catch (e) {
      // Concurrent creation can collide on (studyPhase, number); retry with fresh numbers.
      if (attempt === 4) throw e;
    }
  }
  throw new Error("unreachable");
}
