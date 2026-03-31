import { prisma } from "../src/lib/prisma";

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, name: true, kiosco: { select: { name: true } } }
  });
  console.log(JSON.stringify(users, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
