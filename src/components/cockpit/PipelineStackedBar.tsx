"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type PipelineStackedBarProps = {
  leads: number;
  inProgress: number;
  proposals: number;
  className?: string;
};

export function PipelineStackedBar({ leads, inProgress, proposals, className }: PipelineStackedBarProps) {
  const total = leads + inProgress + proposals;
  
  if (total === 0) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="h-4 w-full rounded-full bg-slate-100 dark:bg-slate-800" />
        <div className="flex justify-between text-xs text-slate-500">
          <span>Pipeline vide</span>
          <span>Commence par ajouter un lead</span>
        </div>
      </div>
    );
  }

  const leadsPct = Math.round((leads / total) * 100);
  const inProgressPct = Math.round((inProgress / total) * 100);
  const proposalsPct = Math.round((proposals / total) * 100);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex h-6 w-full overflow-hidden rounded-full border border-slate-100 dark:border-slate-800">
        {leads > 0 && (
          <div 
            className="flex items-center justify-center bg-slate-200 text-[10px] font-medium text-slate-600 transition-all dark:bg-slate-700 dark:text-slate-300"
            style={{ width: `${leadsPct}%` }}
            title={`Leads: ${leads}`}
          >
            {leadsPct > 15 && leads}
          </div>
        )}
        {inProgress > 0 && (
          <div 
            className="flex items-center justify-center bg-blue-400 text-[10px] font-medium text-white transition-all dark:bg-blue-500"
            style={{ width: `${inProgressPct}%` }}
            title={`En cours: ${inProgress}`}
          >
            {inProgressPct > 15 && inProgress}
          </div>
        )}
        {proposals > 0 && (
          <div 
            className="flex items-center justify-center bg-indigo-600 text-[10px] font-medium text-white transition-all dark:bg-indigo-500"
            style={{ width: `${proposalsPct}%` }}
            title={`Propositions: ${proposals}`}
          >
            {proposalsPct > 15 && proposals}
          </div>
        )}
      </div>
      
      <div className="flex justify-between text-xs font-medium">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200 dark:bg-slate-700" />
          <span className="text-slate-600 dark:text-slate-400">Leads ({leads})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-400 dark:bg-blue-500" />
          <span className="text-slate-600 dark:text-slate-400">En cours ({inProgress})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 dark:bg-indigo-500" />
          <span className="text-slate-600 dark:text-slate-400">Propositions ({proposals})</span>
        </div>
      </div>
    </div>
  );
}
