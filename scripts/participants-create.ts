/**
 * pnpm participants:create --count=5 [--group=cs|nonCs] [--notes="..."]
 * Creates participants (codes, seeds, sessions) and prints their session links. Same logic as the admin panel.
 */
import { prisma } from "@/lib/db";
import { createParticipants, sessionLink } from "@/lib/participants";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const count = Number(arg("count") ?? 1);
const group = arg("group") as "cs" | "nonCs" | undefined;
createParticipants({ count, group, notes: arg("notes") })
  .then((ps) => {
    for (const p of ps) {
      console.log(`${p.code}  seed=${p.seed}`);
      for (const s of p.sessions) console.log(`  ${s.type.padEnd(12)} ${sessionLink(s.token)}`);
    }
  })
  .finally(() => prisma.$disconnect());
