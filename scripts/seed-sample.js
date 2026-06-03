// サンプル勤怠データ投入スクリプト
// 6月分（5/26〜6/25）のリアルなデータ
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// JST時刻をUTCに変換: JSTのhour,minute → UTC Date
function jstToUtc(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0));
}

async function main() {
  // ユーザー取得
  const user = await prisma.user.findFirst({
    where: { name: { contains: '塩野谷' } }
  });
  if (!user) {
    console.log('ユーザーが見つかりません');
    return;
  }
  console.log(`ユーザー: ${user.name} (${user.id})`);

  // 既存の6月関連レコードを削除（5/26〜6/25の範囲）
  const rangeStart = jstToUtc(2026, 5, 26, 5, 0); // 5/26 05:00 JST
  const rangeEnd = jstToUtc(2026, 6, 26, 4, 59);   // 6/26 04:59 JST
  
  const deleted = await prisma.attendanceRecord.deleteMany({
    where: {
      userId: user.id,
      timestamp: { gte: rangeStart, lte: rangeEnd }
    }
  });
  console.log(`既存レコード ${deleted.count} 件削除`);

  const records = [];

  // ヘルパー: 出退勤ペアを追加
  function addWorkDay(month, day, inH, inM, outH, outM, breakMin) {
    records.push({
      userId: user.id,
      type: 'CLOCK_IN',
      timestamp: jstToUtc(2026, month, day, inH, inM),
    });
    records.push({
      userId: user.id,
      type: 'CLOCK_OUT',
      timestamp: jstToUtc(2026, month, day, outH, outM),
    });
    if (breakMin !== undefined) {
      records.push({
        userId: user.id,
        type: 'BREAK_TIME',
        timestamp: jstToUtc(2026, month, day, 12, 0),
        breakMinutes: breakMin,
      });
    }
  }

  // ステータス追加
  function addStatus(month, day, statusType, note) {
    records.push({
      userId: user.id,
      type: statusType,
      timestamp: jstToUtc(2026, month, day, 10, 0),
      note: note || null,
    });
  }

  // ===== 5月末（期間開始: 5/26〜5/31） =====
  // 5/26(火) 通常勤務
  addWorkDay(5, 26, 8, 0, 17, 15, 60);
  // 5/27(水) 少し残業
  addWorkDay(5, 27, 7, 50, 19, 30, 60);
  // 5/28(木) 通常
  addWorkDay(5, 28, 8, 5, 17, 10, 60);
  // 5/29(金) 残業多め
  addWorkDay(5, 29, 7, 55, 21, 0, 60);
  // 5/30(土) 土曜出勤！
  addWorkDay(5, 30, 8, 30, 15, 0, 45);
  // 5/31(日) 休み

  // ===== 6月1日〜25日 =====

  // 6/1(月) 通常勤務
  addWorkDay(6, 1, 8, 0, 17, 20, 60);
  // 6/2(火) 残業
  addWorkDay(6, 2, 7, 45, 20, 45, 60);
  // 6/3(水) 深夜残業！
  addWorkDay(6, 3, 8, 0, 23, 30, 60);
  // 6/4(木) 通常
  addWorkDay(6, 4, 8, 10, 17, 15, 60);
  // 6/5(金) 残業
  addWorkDay(6, 5, 7, 50, 19, 0, 60);
  // 6/6(土) 休み
  // 6/7(日) 日曜出勤！法定休日出勤
  addWorkDay(6, 7, 9, 0, 17, 0, 60);

  // 6/8(月) 通常
  addWorkDay(6, 8, 8, 0, 17, 30, 60);
  // 6/9(火) 残業（夜まで）
  addWorkDay(6, 9, 7, 55, 22, 15, 60);
  // 6/10(水) 通常
  addWorkDay(6, 10, 8, 5, 17, 10, 60);
  // 6/11(木) 深夜残業！翌日AM1時まで
  addWorkDay(6, 11, 8, 0, 25, 0, 60); // 25:00 = 翌1:00
  // 6/12(金) 残業
  addWorkDay(6, 12, 8, 30, 20, 30, 60);
  // 6/13(土) 土曜出勤＋残業
  addWorkDay(6, 13, 8, 0, 19, 30, 60);
  // 6/14(日) 休み

  // 6/15(月) 通常
  addWorkDay(6, 15, 8, 0, 17, 15, 60);
  // 6/16(火) 有給休暇
  addStatus(6, 16, 'STATUS_YUKYU', null);
  // 6/17(水) 残業
  addWorkDay(6, 17, 7, 50, 21, 30, 60);
  // 6/18(木) 通常
  addWorkDay(6, 18, 8, 0, 17, 20, 60);
  // 6/19(金) 深夜残業！23時半まで
  addWorkDay(6, 19, 8, 0, 23, 30, 60);
  // 6/20(土) 土曜出勤＋深夜！
  addWorkDay(6, 20, 9, 0, 22, 30, 60);
  // 6/21(日) 日曜出勤＋深夜残業！
  addWorkDay(6, 21, 10, 0, 23, 0, 45);

  // 6/22(月) 通常
  addWorkDay(6, 22, 8, 0, 17, 10, 60);
  // 6/23(火) 残業
  addWorkDay(6, 23, 7, 55, 20, 0, 60);
  // 6/24(水) 深夜残業
  addWorkDay(6, 24, 8, 0, 24, 0, 60); // 24:00 = 翌0時
  // 6/25(木) 通常
  addWorkDay(6, 25, 8, 5, 17, 15, 60);

  // 一括挿入
  const created = await prisma.attendanceRecord.createMany({
    data: records
  });
  console.log(`${created.count} 件のレコードを作成しました！`);

  // サマリー表示
  const totalDays = new Set(records.filter(r => r.type === 'CLOCK_IN').map(r => {
    const d = new Date(r.timestamp.getTime() + 9 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  })).size;
  const weekendDays = records.filter(r => {
    if (r.type !== 'CLOCK_IN') return false;
    const d = new Date(r.timestamp.getTime() + 9 * 60 * 60 * 1000);
    return d.getUTCDay() === 0 || d.getUTCDay() === 6;
  }).length;
  
  console.log(`\n=== サマリー ===`);
  console.log(`出勤日数: ${totalDays}日`);
  console.log(`休日出勤: ${weekendDays}日（土日）`);
  console.log(`有給: 1日`);
  console.log(`深夜残業あり: 6/3, 6/11, 6/19, 6/20, 6/21, 6/24`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
