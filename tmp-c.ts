import { prisma } from "@/lib/db";
prisma.participant.findFirst({ where: { studyPhase: 3, plans: { some: {} } }, orderBy: { number: "desc" } }).then((p) => console.log(p?.code)).finally(() => prisma.$disconnect());
