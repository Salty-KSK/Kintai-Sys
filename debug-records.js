// debug-records.js - 3/25のレコードを直接DB確認
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // 山本雅美のユーザーを探す
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  console.log("=== ALL USERS ===");
  users.forEach(u => console.log(`  ${u.id}: ${u.name}`));
  
  const yamamoto = users.find(u => u.name && u.name.includes('山本'));
  if (!yamamoto) {
    console.log("山本 not found");
    return;
  }
  console.log(`\n=== TARGET USER: ${yamamoto.name} (${yamamoto.id}) ===`);

  // 3/25付近のレコードを広い範囲で取得 (3/24 00:00 UTC ~ 3/27 00:00 UTC)
  const start = new Date('2026-03-24T00:00:00Z');
  const end = new Date('2026-03-27T00:00:00Z');
  
  const records = await prisma.attendanceRecord.findMany({
    where: {
      userId: yamamoto.id,
      timestamp: { gte: start, lte: end }
    },
    orderBy: { timestamp: 'asc' }
  });

  console.log(`\n=== RECORDS (${start.toISOString()} ~ ${end.toISOString()}) ===`);
  console.log(`Total: ${records.length} records\n`);
  
  for (const r of records) {
    const jst = new Date(r.timestamp.getTime() + 9 * 60 * 60 * 1000);
    const jstStr = `${jst.getUTCMonth()+1}/${jst.getUTCDate()} ${jst.getUTCHours()}:${jst.getUTCMinutes().toString().padStart(2,'0')} JST`;
    console.log(`  ID: ${r.id}`);
    console.log(`  Type: ${r.type}`);
    console.log(`  UTC:  ${r.timestamp.toISOString()}`);
    console.log(`  JST:  ${jstStr}`);
    console.log(`  Note: ${r.note || '-'}`);
    console.log('  ---');
  }

  // DayTypeOverrides for 3/25 area
  const overrides = await prisma.dayTypeOverride.findMany({
    where: {
      date: { gte: start, lte: end }
    }
  });
  console.log(`\n=== DAY TYPE OVERRIDES ===`);
  for (const o of overrides) {
    const jst = new Date(o.date.getTime() + 9 * 60 * 60 * 1000);
    console.log(`  Date: ${jst.getUTCMonth()+1}/${jst.getUTCDate()} | Type: ${o.dayType} | UserId: ${o.userId || 'GLOBAL'} | Reason: ${o.reason}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
