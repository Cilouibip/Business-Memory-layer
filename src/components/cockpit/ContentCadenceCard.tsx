"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Clock, Calendar, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ContentCadence = {
  lastLinkedInAt: string | null;
  lastYoutubeAt: string | null;
  linkedInDaysAgo: number | null;
  youtubeDaysAgo: number | null;
};

function formatTimeAgo(isoString: string | null) {
  if (!isoString) return "Jamais";
  try {
    const date = parseISO(isoString);
    return formatDistanceToNow(date, { addSuffix: true, locale: fr });
  } catch {
    return "Date invalide";
  }
}

function CadenceItem({ platform, daysAgo, isoDate, maxDays }: { platform: string, daysAgo: number | null, isoDate: string | null, maxDays: number }) {
  const isOk = daysAgo !== null && daysAgo <= maxDays;
  
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800/50 dark:bg-slate-900/30">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-slate-900 dark:text-slate-200">{platform}</span>
        <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <Calendar className="h-3 w-3" />
          Dernier: {formatTimeAgo(isoDate)}
        </span>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={cn(
          "text-lg font-bold tracking-tight",
          isOk ? "text-emerald-600 dark:text-emerald-500" : "text-amber-500 dark:text-amber-500"
        )}>
          {daysAgo !== null ? `${daysAgo}j` : "-"}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Objectif: &lt;{maxDays}j
        </span>
      </div>
    </div>
  );
}

export function ContentCadenceCard({ cadence }: { cadence: ContentCadence | null }) {
  if (!cadence) {
    return (
      <Card className="border-slate-200 shadow-sm dark:border-slate-800">
        <CardContent className="flex h-32 items-center justify-center p-5">
          <p className="text-sm text-slate-500 dark:text-slate-400">Cadence indisponible</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 shadow-sm dark:border-slate-800">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400">
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Cadence de Contenu</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Rythme de publication</p>
          </div>
        </div>

        <div className="space-y-3">
          <CadenceItem 
            platform="LinkedIn" 
            daysAgo={cadence.linkedInDaysAgo} 
            isoDate={cadence.lastLinkedInAt} 
            maxDays={3} 
          />
          <CadenceItem 
            platform="YouTube" 
            daysAgo={cadence.youtubeDaysAgo} 
            isoDate={cadence.lastYoutubeAt} 
            maxDays={7} 
          />
        </div>
      </CardContent>
    </Card>
  );
}
