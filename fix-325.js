// fix-325.js - 3/25の重複CLOCK_OUTを全削除して正しいレコードだけ残す
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const userId = 'cmpxngl5z00005st2orwccpqp'; // 山本雅美
  
  // 3/25のビジネスデー範囲のCLOCK_OUTを全取得
  const start = new Date('2026-03-24T20:00:00.000Z'); // 3/25 05:00 JST
  const end = new Date('2026-03-26T03:59:59.999Z');   // 3/26 12:59 JST
  
  const records = await prisma.attendanceRecord.findMany({
    where: {
      userId,
      type: 'CLOCK_OUT',
      timestamp: { gte: start, lte: end }
    },
    orderBy: { timestamp: 'asc' }
  });
  
  console.log(`Found ${records.length} CLOCK_OUT records for 3/25:`);
  records.forEach(r => {
    const jst = new Date(r.timestamp.getTime() + 9 * 60 * 60 * 1000);
    console.log(`  ${r.id} -> ${jst.getUTCHours()}:${jst.getUTCMinutes().toString().padStart(2,'0')} JST`);
  });

  // 全部削除
  const deleted = await prisma.attendanceRecord.deleteMany({
    where: {
      userId,
      type: 'CLOCK_OUT',
      timestamp: { gte: start, lte: end }
    }
  });
  console.log(`\nDeleted ${deleted.count} records.`);

  // 正しいレコードを1件だけ作成（27時 = 翌3:00 JST = 18:00 UTC）
  const correctTimestamp = new Date('2026-03-25T18:00:00.000Z'); // 3/26 03:00 JST = 27:00
  await prisma.attendanceRecord.create({
    data: {
      userId,
      type: 'CLOCK_OUT',
      timestamp: correctTimestamp,
    }
  });
  console.log('Created 1 correct CLOCK_OUT at 27:00 (3/26 03:00 JST)');

  // 3/24のビジネスデーにある不要なCLOCK_OUTも確認・削除（翌4時、翌5時のやつ）
  const earlyStart = new Date('2026-03-24T00:00:00.000Z');
  const earlyEnd = new Date('2026-03-24T20:00:00.000Z');
  const earlyRecords = await prisma.attendanceRecord.findMany({
    where: {
      userId,
      type: 'CLOCK_OUT',
      timestamp: { gte: earlyStart, lte: earlyEnd }
    }
  });
  console.log(`\nFound ${earlyRecords.length} CLOCK_OUT in 3/24 range:`);
  earlyRecords.forEach(r => {
    const jst = new Date(r.timestamp.getTime() + 9 * 60 * 60 * 1000);
    console.log(`  ${r.id} -> 3/${jst.getUTCDate()} ${jst.getUTCHours()}:${jst.getUTCMinutes().toString().padStart(2,'0')} JST`);
  });
  
  // 3/24 19:00 UTC (3/25 4:00 JST) と 3/24 20:00 UTC (3/25 5:00 JST) は3/25に表示される不要レコード
  // → 3/24のビジネスデー(05:00 JST)以降にあるので3/24に属する可能性。要確認
  
  console.log('\nDone!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
