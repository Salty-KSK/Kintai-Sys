import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// 管理者用: 破損したレコードを検出・修復するAPI
// GET /api/repair-records?userId=XXX&month=3&year=2026
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const month = parseInt(searchParams.get('month') || '0');
  const year = parseInt(searchParams.get('year') || '0');
  const fix = searchParams.get('fix') === 'true';

  if (!userId || !month || !year) {
    return NextResponse.json({ error: 'userId, month, year required' }, { status: 400 });
  }

  // ビジネス期間: 前月26日 〜 当月25日
  const startDate = new Date(Date.UTC(month === 1 ? year - 1 : year, month === 1 ? 11 : month - 2, 26, -9, 0, 0));
  const endDate25 = new Date(Date.UTC(year, month - 1, 25));

  // 広い範囲で全レコードをフェッチ（前月20日〜当月末日＋10日）
  const wideStart = new Date(Date.UTC(month === 1 ? year - 1 : year, month === 1 ? 11 : month - 2, 20, 0, 0, 0));
  const wideEnd = new Date(Date.UTC(year, month, 5, 0, 0, 0));

  const allRecords = await prisma.attendanceRecord.findMany({
    where: {
      userId,
      timestamp: { gte: wideStart, lte: wideEnd }
    },
    orderBy: { timestamp: 'asc' }
  });

  // ビジネス期間のフェッチ範囲
  const fetchStart = new Date(Date.UTC(month === 1 ? year - 1 : year, month === 1 ? 11 : month - 2, 26, -9, 0, 0));
  const fetchEnd = new Date(Date.UTC(year, month - 1, 26, 3, 59, 59, 999)); // 25日の翌12:59JST

  // フェッチ範囲外のレコードを検出
  const orphaned = allRecords.filter(r => {
    const t = r.timestamp;
    return t < fetchStart || t > fetchEnd;
  });

  // フェッチ範囲内のレコードも表示
  const inRange = allRecords.filter(r => {
    const t = r.timestamp;
    return t >= fetchStart && t <= fetchEnd;
  });

  const results: any[] = [];

  if (fix && orphaned.length > 0) {
    // 修復: 25日付近の破損レコードを特定して修復
    for (const r of orphaned) {
      const jst = new Date(r.timestamp.getTime() + 9 * 60 * 60 * 1000);
      const jstHour = jst.getUTCHours();
      const jstMin = jst.getUTCMinutes();
      
      // 26日以降に飛んだCLOCK_OUTを25日に戻す
      if (r.type === 'CLOCK_OUT' && jst.getUTCDate() >= 26 && jst.getUTCDate() <= 28) {
        // 翌XX:YY として25日のビジネスデーに戻す
        const correctTimestamp = new Date(Date.UTC(year, month - 1, 25 + 1, jstHour - 9, jstMin, 0, 0));
        
        if (correctTimestamp >= fetchStart && correctTimestamp <= fetchEnd) {
          await prisma.attendanceRecord.update({
            where: { id: r.id },
            data: { timestamp: correctTimestamp }
          });
          results.push({
            id: r.id,
            type: r.type,
            action: 'FIXED',
            oldTimestamp: r.timestamp.toISOString(),
            oldJST: `${jst.getUTCMonth()+1}/${jst.getUTCDate()} ${jstHour}:${jstMin.toString().padStart(2,'0')} JST`,
            newTimestamp: correctTimestamp.toISOString(),
          });
          continue;
        }
      }
      
      results.push({
        id: r.id,
        type: r.type,
        action: 'SKIPPED',
        timestamp: r.timestamp.toISOString(),
        jst: `${jst.getUTCMonth()+1}/${jst.getUTCDate()} ${jstHour}:${jstMin.toString().padStart(2,'0')} JST`,
        reason: 'Could not determine correct timestamp'
      });
    }
  }

  return NextResponse.json({
    period: `${year}/${month}`,
    fetchRange: {
      start: fetchStart.toISOString(),
      end: fetchEnd.toISOString(),
    },
    totalRecords: allRecords.length,
    inRangeCount: inRange.length,
    orphanedCount: orphaned.length,
    inRange: inRange.map(r => {
      const jst = new Date(r.timestamp.getTime() + 9 * 60 * 60 * 1000);
      return {
        id: r.id,
        type: r.type,
        timestamp: r.timestamp.toISOString(),
        jst: `${jst.getUTCMonth()+1}/${jst.getUTCDate()} ${jst.getUTCHours()}:${jst.getUTCMinutes().toString().padStart(2,'0')} JST`,
      };
    }),
    orphaned: orphaned.map(r => {
      const jst = new Date(r.timestamp.getTime() + 9 * 60 * 60 * 1000);
      return {
        id: r.id,
        type: r.type,
        timestamp: r.timestamp.toISOString(),
        jst: `${jst.getUTCMonth()+1}/${jst.getUTCDate()} ${jst.getUTCHours()}:${jst.getUTCMinutes().toString().padStart(2,'0')} JST`,
      };
    }),
    fixes: results,
  });
}
