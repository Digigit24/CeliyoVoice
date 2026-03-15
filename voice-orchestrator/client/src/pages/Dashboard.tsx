import { useQuery } from '@tanstack/react-query';
import { Bot, Phone, Wrench, TrendingUp, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/axios';
import { formatDuration, formatDate } from '@/lib/utils';

interface DashboardStats {
  agents: { total: number; active: number };
  calls: { total: number; active: number; completed: number; failed: number };
  tools: { total: number; active: number };
  recentCalls: Array<{
    id: string;
    phone: string;
    status: string;
    direction: string;
    provider: string;
    duration: number | null;
    createdAt: string;
    agent: { name: string } | null;
  }>;
}

const statusVariant: Record<string, 'default' | 'success' | 'destructive' | 'warning' | 'secondary' | 'outline'> = {
  COMPLETED: 'success',
  FAILED: 'destructive',
  IN_PROGRESS: 'warning',
  QUEUED: 'secondary',
  CANCELLED: 'outline',
};

export default function Dashboard() {
  const { data, isLoading, error } = useQuery<{ success: boolean; data: DashboardStats }>({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/dashboard/stats').then((r) => r.data),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Failed to load stats.</p>
      </div>
    );
  }

  const { agents, calls, tools, recentCalls } = data.data;

  const statCards = [
    { label: 'Total Agents', value: agents.total, sub: `${agents.active} active`, icon: Bot, color: 'text-blue-500' },
    { label: 'Total Calls', value: calls.total, sub: `${calls.active} active`, icon: Phone, color: 'text-green-500' },
    { label: 'Completed', value: calls.completed, sub: `${calls.failed} failed`, icon: TrendingUp, color: 'text-purple-500' },
    { label: 'Tools', value: tools.total, sub: `${tools.active} active`, icon: Wrench, color: 'text-orange-500' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your Voice AI workspace</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ label, value, sub, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Calls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Calls</CardTitle>
        </CardHeader>
        <CardContent>
          {recentCalls.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No calls yet.</p>
          ) : (
            <div className="divide-y">
              {recentCalls.map((call) => (
                <div key={call.id} className="flex items-center justify-between py-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{call.phone}</p>
                    <p className="text-xs text-muted-foreground">
                      {call.agent?.name ?? 'No agent'} · {call.provider} · {formatDate(call.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{formatDuration(call.duration)}</span>
                    <Badge variant={statusVariant[call.status] ?? 'outline'}>{call.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
