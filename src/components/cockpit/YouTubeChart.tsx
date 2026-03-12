"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";

type YouTubeChartProps = {
  data: Array<{
    date: string;
    views: number;
  }>;
  className?: string;
};

export function YouTubeChart({ data, className }: YouTubeChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className={cn("flex h-[240px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50", className)}>
        <p className="text-sm text-slate-500 dark:text-slate-400">Données insuffisantes</p>
      </div>
    );
  }

  return (
    <Card className={cn("border-slate-200 shadow-sm dark:border-slate-800 overflow-hidden", className)}>
      <CardHeader className="bg-gradient-to-r from-indigo-50/50 to-violet-50/50 pb-4 dark:from-indigo-950/20 dark:to-violet-950/20">
        <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Vues YouTube (30 derniers jours)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[240px] w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#64748b' }}
                minTickGap={30}
              />
              <YAxis 
                hide 
                domain={['dataMin - 10', 'dataMax + 10']}
              />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  fontSize: '12px'
                }}
                itemStyle={{ color: '#0f172a', fontWeight: 500 }}
                labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area
                type="monotone"
                dataKey="views"
                stroke="#4f46e5"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorViews)"
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
