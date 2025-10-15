const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const teams = await prisma.team.findMany({
    take: 20,
    orderBy: { name: 'asc' }
  });
  
  console.log(`\nShowing first ${teams.length} teams:\n`);
  teams.forEach(t => {
    const id = (t.id || '').padEnd(30);
    const name = (t.name || '').padEnd(25);
    const mascot = t.mascot || 'null';
    console.log(`  ${id} ${name} ${mascot}`);
  });
  
  await prisma.$disconnect();
}

main();

