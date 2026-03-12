"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Database, Search } from "lucide-react";

export function BmlMemorySearch() {
  return (
    <Card className="border-slate-200 shadow-sm dark:border-slate-800">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
            <Database className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Mémoire BML</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Recherche sémantique globale</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Que cherches-tu ? (ex: objection prix)"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-indigo-400"
          />
        </div>
      </CardContent>
    </Card>
  );
}
