"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Filter = "all" | "pending" | "approved" | "rejected";
type Draft = {
  id: string;
  content: string;
  style: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  sources: unknown;
  news_used: unknown;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadDrafts(nextFilter?: Filter) {
    setLoading(true);
    const activeFilter = nextFilter ?? filter;
    const query = activeFilter === "all" ? "" : `?status=${activeFilter}`;
    try {
      const response = await fetch(`/api/drafts${query}`);
      const data = await response.json();
      if (response.ok) setDrafts(data as Draft[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDrafts();
  }, [filter]);

  async function generateNow() {
    setBusy("generate");
    setMessage("Génération en cours...");
    try {
      const response = await fetch("/api/agents/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (payload.status === "success") {
        setMessage("Nouveau draft généré ✓");
        await loadDrafts();
      } else {
        setMessage(payload?.error ?? "Génération impossible");
      }
    } finally {
      setBusy(null);
    }
  }

  async function patchDraft(id: string, status: "approved" | "rejected") {
    setBusy(id);
    try {
      const response = await fetch(`/api/drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data?.error ?? "Mise à jour impossible");
        return;
      }
      if (status === "approved") {
        await navigator.clipboard.writeText(data.content ?? "");
        setMessage("Copié dans le presse-papier ✓");
      }
      await loadDrafts();
    } finally {
      setBusy(null);
    }
  }

  const visibleDrafts = useMemo(() => drafts, [drafts]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Contenu LinkedIn</h1>
          <p className="mt-1 text-slate-500">Tes posts générés par l&apos;IA</p>
        </div>
        <Button onClick={() => void generateNow()} disabled={busy === "generate"}>
          ✨ Générer un draft maintenant
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
        <TabsList className="border border-slate-200 bg-white">
          <TabsTrigger value="all">Tous</TabsTrigger>
          <TabsTrigger value="pending">En attente</TabsTrigger>
          <TabsTrigger value="approved">Approuvés</TabsTrigger>
          <TabsTrigger value="rejected">Rejetés</TabsTrigger>
        </TabsList>
      </Tabs>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Chargement des drafts...</p> : null}

      {!loading && visibleDrafts.length === 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-10 text-center text-slate-600">Aucun draft pour ce filtre.</CardContent>
        </Card>
      ) : null}

      {!loading &&
        visibleDrafts.map((draft) => (
          <Card key={draft.id} className="border-slate-200 shadow-sm">
            <CardContent className="space-y-4 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{draft.style ?? "style libre"}</Badge>
                <Badge variant="secondary">{draft.status}</Badge>
                <span className="text-xs text-slate-500">{formatDate(draft.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{draft.content}</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void patchDraft(draft.id, "approved")} disabled={busy === draft.id}>
                  ✅ Approuver
                </Button>
                <Button variant="secondary" disabled>
                  ✏️ Éditer
                </Button>
                <Button variant="outline" onClick={() => void generateNow()} disabled={busy === "generate"}>
                  🔄 Regénérer
                </Button>
                <Button variant="destructive" onClick={() => void patchDraft(draft.id, "rejected")} disabled={busy === draft.id}>
                  ❌ Rejeter
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
