"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Info } from "lucide-react";
import { type BmlInsight } from "@/lib/dashboardQueries";

type LatestInsightsProps = {
  insights: BmlInsight[];
};

export function LatestInsightsCard({ insights }: LatestInsightsProps) {
  if (insights.length === 0) {
    return (
      <Card className="border-slate-200 shadow-sm dark:border-slate-800">
        <CardContent className="flex h-32 flex-col items-center justify-center p-5 text-center">
          <Info className="mb-2 h-5 w-5 text-slate-400" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Aucun insight généré
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            L'IA a besoin de plus de contenus digérés pour faire des déductions.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 shadow-sm dark:border-slate-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400">
              <Lightbulb className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Insights BML
              </CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Dernières déductions de l'IA
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.map((insight) => (
          <div 
            key={insight.id} 
            className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800/50 dark:bg-slate-900/30"
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                {insight.domain}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                conf. {Math.round(insight.confidence_score * 100)}%
              </span>
            </div>
            <p className="text-sm leading-snug text-slate-700 dark:text-slate-300">
              {insight.fact_text}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
