"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PenTool, CheckCircle, ExternalLink, RefreshCw, XCircle, FileText } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type PendingDraft = {
  id: string;
  content: string;
  style: string | null;
};

export function DraftFocusCard({ initialDraft }: { initialDraft: PendingDraft | null }) {
  const [draft, setDraft] = useState<PendingDraft | null>(initialDraft);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function approveDraft() {
    if (!draft) return;
    setLoading(true);
    try {
      await navigator.clipboard.writeText(draft.content);
      const response = await fetch(`/api/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (!response.ok) {
        setMessage("Impossible d'approuver");
        return;
      }
      setDraft(null);
      setMessage("Copié et approuvé ✓");
    } catch {
      setMessage("Erreur serveur");
    } finally {
      setLoading(false);
    }
  }

  async function generateDraft() {
    setLoading(true);
    setMessage("Génération par l'IA en cours (approx. 20s)...");
    try {
      const response = await fetch("/api/agents/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: "personal" }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload?.error ?? "Génération impossible");
        return;
      }
      setDraft(payload.draft);
      setMessage(null);
    } catch {
      setMessage("Génération impossible");
    } finally {
      setLoading(false);
    }
  }

  if (loading && !draft) {
    return (
      <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white shadow-sm dark:border-indigo-900/30 dark:from-indigo-950/20 dark:to-slate-900 overflow-hidden">
        <div className="absolute top-0 h-1 w-full animate-pulse bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400"></div>
        <CardContent className="p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-900 dark:text-slate-100">
            L'agent prépare ton contenu...
          </p>
          {message && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{message}</p>}
          <div className="mt-6 space-y-3 text-left">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!draft) {
    return (
      <Card className="border-dashed border-slate-200 shadow-none dark:border-slate-800">
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
            <FileText className="h-6 w-6 text-slate-400" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-900 dark:text-slate-100">Aucun draft en attente</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-[250px]">
            L'agent LinkedIn est en sommeil. Réveille-le pour obtenir ta prochaine publication.
          </p>
          <Button 
            onClick={generateDraft} 
            disabled={loading}
            className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <PenTool className="mr-2 h-4 w-4" />
            Générer un draft
          </Button>
          {message && <p className="mt-3 text-xs font-medium text-emerald-600">{message}</p>}
        </CardContent>
      </Card>
    );
  }

  // Présentation du brouillon avec effet fade-out si long
  const contentLines = draft.content.split("\n");
  const isLong = contentLines.length > 5;
  const previewLines = isLong ? contentLines.slice(0, 5) : contentLines;

  return (
    <Card className="group relative overflow-hidden border-indigo-200 shadow-sm transition-all hover:border-indigo-300 dark:border-indigo-900/50 dark:hover:border-indigo-800">
      <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-indigo-500 to-violet-500"></div>
      
      <CardContent className="p-5 pl-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-500">
              En attente
            </span>
          </div>
          {draft.style && (
            <Badge variant="outline" className="text-[10px] uppercase font-medium bg-slate-50 dark:bg-slate-800">
              {draft.style}
            </Badge>
          )}
        </div>

        <div className="relative">
          <div className="space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300 font-medium">
            {previewLines.map((line, idx) => (
              <p key={idx} className={line.trim() === "" ? "h-2" : ""}>
                {line || " "}
              </p>
            ))}
          </div>
          
          {isLong && (
            <div className="absolute bottom-0 left-0 h-24 w-full bg-gradient-to-t from-white to-transparent dark:from-slate-900"></div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <Link href="/drafts">
            <Button variant="ghost" size="sm" className="text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Ouvrir
            </Button>
          </Link>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={generateDraft}
              disabled={loading}
              className="border-slate-200 text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400"
            >
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
              Refaire
            </Button>
            <Button 
              size="sm"
              onClick={approveDraft}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              <CheckCircle className="mr-1.5 h-4 w-4" />
              Approuver
            </Button>
          </div>
        </div>
        {message && <p className="mt-3 text-center text-xs font-medium text-emerald-600">{message}</p>}
      </CardContent>
    </Card>
  );
}
