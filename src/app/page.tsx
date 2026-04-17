import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ClientDashboard from "./client-dashboard";
import Link from "next/link";
import { History, LayoutDashboard, Clock } from "lucide-react";

export default async function Dashboard() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    redirect("/login");
  }

  // Fetch today's records for this user based on session ID
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const userId = (session.user as any).id;

  let records: any[] = [];
  if (userId) {
    records = await prisma.attendanceRecord.findMany({
      where: {
        userId: userId,
        timestamp: {
          gte: today,
        }
      },
      orderBy: {
        timestamp: 'asc'
      }
    });
  }

  return (
    <div className="container">
      <div className="card animate-fade-in">
        <div className="flex justify-between items-center mb-6" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <div className="flex items-center gap-3">
            <Clock className="text-primary" size={24} />
            <h1 className="text-xl">勤怠管理システム</h1>
          </div>
          <div className="text-sm text-muted">
            {session.user.name}さん
          </div>
        </div>

        <div className="header-tabs">
          <Link href="/" className="header-tab active flex items-center gap-2">
            <LayoutDashboard size={18} /> 打刻と状況
          </Link>
          <Link href="/history" className="header-tab flex items-center gap-2">
            <History size={18} /> 月間履歴・集計
          </Link>
        </div>

        <ClientDashboard initialRecords={records} />
      </div>
    </div>
  );
}
