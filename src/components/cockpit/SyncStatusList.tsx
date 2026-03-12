"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Server, Youtube, Linkedin, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type SyncSource = {
  id: string;
  name: string;
  icon: React.ReactNode;
  lastSync: string | null;
  status: "success" | "error" | "pending";
};

type SyncStatusListProps = {
  syncStatus: Record<string, { last_sync: string | null; status: string }>;
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

export function SyncStatusList({ syncStatus }: SyncStatusListProps) {
  const sources: SyncSource[] = [
    {
      id: "youtube",
      name: "YouTube",
      icon: <Youtube className="h-4 w-4" />,
      lastSync: syncStatus?.youtube?.last_sync || null,
      status: syncStatus?.youtube?.status === "failed" ? "error" : syncStatus?.youtube?.status ? "success" : "pending",
    },
    {
      id: "linkedin",
      name: "LinkedIn",
      icon: <Linkedin className="h-4 w-4" />,
      lastSync: syncStatus?.linkedin?.last_sync || null,
      status: syncStatus?.linkedin?.status === "failed" ? "error" : syncStatus?.linkedin?.status ? "success" : "pending",
    },
    {
      id: "notion",
      name: "Notion",
      icon: <FileText className="h-4 w-4" />,
      lastSync: syncStatus?.notion?.last_sync || null,
      status: syncStatus?.notion?.status === "failed" ? "error" : syncStatus?.notion?.status ? "success" : "pending",
    }
  ];

  return (
    <Card className="border-slate-200 shadow-sm dark:border-slate-800">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            <Server className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">État du Système</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Dernières synchronisations BML</p>
          </div>
        </div>

        <div className="space-y-3">
          {sources.map((source) => (
            <div key={source.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-800/50 dark:bg-slate-900/30">
              <div className="flex items-center gap-2.5">
                <div className="text-slate-500 dark:text-slate-400">{source.icon}</div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-slate-900 dark:text-slate-200">{source.name}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-500">
                    {formatTimeAgo(source.lastSync)}
                  </span>
                </div>
              </div>
              <div>
                {source.status === "success" && (
                  <div className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    Actif
                  </div>
                )}
                {source.status === "error" && (
                  <div className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-500/20 dark:text-rose-400">
                    <AlertCircle className="h-3 w-3" />
                    Erreur
                  </div>
                )}
                {source.status === "pending" && (
                  <div className="flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                    Attente
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
