import { PrismaClient } from '@prisma/client';
import { INITIAL_PLAYERS, DEFAULT_TEAMS } from '../src/players/initial-players.data.js';

export { INITIAL_PLAYERS, DEFAULT_TEAMS };

const prisma = new PrismaClient();

async function main() {
  console.log('--- Seeding IPL Auction Players ---');
  let inserted = 0;
  let updated = 0;
  for (const player of INITIAL_PLAYERS) {
    const existing = await prisma.player.findFirst({
      where: { name: player.name },
    });
    if (!existing) {
      await prisma.player.create({
        data: player,
      });
      inserted++;
    } else if (
      player.image &&
      (existing.image !== player.image || existing.image?.includes('unsplash.com'))
    ) {
      await prisma.player.update({
        where: { id: existing.id },
        data: { image: player.image },
      });
      updated++;
    }
  }
  console.log(`Seeded ${inserted} new players, updated ${updated} existing players in the database.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
