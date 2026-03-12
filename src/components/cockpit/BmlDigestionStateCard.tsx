"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type BmlDigestionState } from "@/lib/dashboardQueries";
import { BrainCircuit, Filter, FileJson, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type BmlDigestionStateProps = {
  state: BmlDigestionState;
  className?: string;
};

export function BmlDigestionStateCard({ state, className }: BmlDigestionStateProps) {
  const total = state.ingested + state.triaged + state.canonicalized + state.extractionFailed;
  
  if (total === 0) {
    return (
      <Card className={cn("border-slate-200 shadow-sm dark:border-slate-800", className)}>
        <CardContent className="flex h-32 items-center justify-center p-5">
          <p className="text-sm text-slate-500 dark:text-slate-400">Aucun document dans le pipeline</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("border-slate-200 shadow-sm dark:border-slate-800", className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
            <BrainCircuit className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Digestion BML
            </CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400">État du traitement de la mémoire</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="relative flex justify-between">
          {/* Ligne de fond */}
          <div className="absolute left-6 right-6 top-4 h-0.5 bg-slate-100 dark:bg-slate-800" />
          
          {/* Étape 1 : Ingéré */}
          <div className="relative flex flex-col items-center gap-2">
            <div className={cn(
              "z-10 flex h-8 w-8 items-center justify-center rounded-full border-2",
              state.ingested > 0 
                ? "border-amber-500 bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400" 
                : "border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900"
            )}>
              <FileJson className="h-3.5 w-3.5" />
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Ingéré</span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{state.ingested}</span>
            </div>
          </div>

          {/* Étape 2 : Trié */}
          <div className="relative flex flex-col items-center gap-2">
            <div className={cn(
              "z-10 flex h-8 w-8 items-center justify-center rounded-full border-2",
              state.triaged > 0 
                ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400" 
                : "border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900"
            )}>
              <Filter className="h-3.5 w-3.5" />
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Trié</span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{state.triaged}</span>
            </div>
          </div>

          {/* Étape 3 : Digéré (Canonicalized) */}
          <div className="relative flex flex-col items-center gap-2">
            <div className={cn(
              "z-10 flex h-8 w-8 items-center justify-center rounded-full border-2",
              state.canonicalized > 0 
                ? "border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" 
                : "border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900"
            )}>
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Digéré</span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{state.canonicalized}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
