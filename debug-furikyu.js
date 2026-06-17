// debug-furikyu.js - 振替休日関連のデータを全確認
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 全ユーザー
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  console.log("=== USERS ===");
  users.forEach(u => console.log(`  ${u.id}: ${u.name}`));

  // 2月期間のSTATUS_FURIKYUレコード
  const start = new Date('2026-02-01T00:00:00Z');
  const end = new Date('2026-03-31T00:00:00Z');

  const furikyuRecords = await prisma.attendanceRecord.findMany({
    where: {
      type: { startsWith: "STATUS_" },
      timestamp: { gte: start, lte: end }
    },
    orderBy: { timestamp: 'asc' }
  });

  console.log(`\n=== STATUS_ RECORDS (Feb-Mar) ===`);
  for (const r of furikyuRecords) {
    const jst = new Date(r.timestamp.getTime() + 9 * 60 * 60 * 1000);
    const user = users.find(u => u.id === r.userId);
    console.log(`  User: ${user?.name || r.userId}`);
    console.log(`  Type: ${r.type}`);
    console.log(`  UTC:  ${r.timestamp.toISOString()}`);
    console.log(`  JST:  ${jst.getUTCMonth()+1}/${jst.getUTCDate()} ${jst.getUTCHours()}:${jst.getUTCMinutes().toString().padStart(2,'0')} JST`);
    console.log(`  Note: ${r.note || '-'}`);
    console.log('  ---');
  }

  // DayTypeOverrides
  const overrides = await prisma.dayTypeOverride.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'asc' }
  });

  console.log(`\n=== DAY TYPE OVERRIDES (Feb-Mar) ===`);
  for (const o of overrides) {
    const jst = new Date(o.date.getTime() + 9 * 60 * 60 * 1000);
    const user = users.find(u => u.id === o.userId);
    console.log(`  Date: ${jst.getUTCMonth()+1}/${jst.getUTCDate()} ${jst.getUTCHours()}:${jst.getUTCMinutes().toString().padStart(2,'0')} JST (UTC: ${o.date.toISOString()})`);
    console.log(`  Type: ${o.dayType} | User: ${user?.name || o.userId || 'GLOBAL'} | Reason: ${o.reason}`);
    console.log('  ---');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
