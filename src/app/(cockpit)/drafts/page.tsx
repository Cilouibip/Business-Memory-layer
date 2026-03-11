"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  deleteDraft,
  getDrafts,
  regenerateDraft,
  updateDraftContent,
  type LinkedInDraft,
} from "@/lib/draftsQueries";

type Filter = "all" | "pending" | "approved" | "rejected";

const statusLabels: Record<Exclude<Filter, "all">, string> = {
  pending: "En attente",
  approved: "Approuvés",
  rejected: "Rejetés",
};

const styleLabels: Record<string, string> = {
  storytelling: "Storytelling",
  opinion: "Opinion",
  educatif: "Éducatif",
  "behind-the-scenes": "Behind-the-scenes",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalizeSources(rawSources: unknown): string[] {
  if (!rawSources) {
    return [];
  }

  if (Array.isArray(rawSources)) {
    return rawSources
      .map((source) => {
        if (typeof source === "string") {
          return source;
        }

        if (source && typeof source === "object") {
          const candidate = (source as Record<string, unknown>).title
            ?? (source as Record<string, unknown>).name
            ?? (source as Record<string, unknown>).url;
          return typeof candidate === "string" ? candidate : null;
        }

        return null;
      })
      .filter((item): item is string => Boolean(item));
  }

  if (typeof rawSources === "object") {
    return Object.values(rawSources as Record<string, unknown>)
      .map((value) => (typeof value === "string" ? value : null))
      .filter((item): item is string => Boolean(item));
  }

  return [];
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<LinkedInDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState("");

  async function loadDrafts() {
    setIsLoading(true);
    try {
      const data = await getDrafts();
      setDrafts(data);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Impossible de charger les drafts.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDrafts();
  }, []);

  async function handleCopy(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setFeedback("Draft copié dans le presse-papier.");
    } catch {
      setFeedback("Impossible de copier le draft.");
    }
  }

  function handleStartEdit(draft: LinkedInDraft) {
    setEditingId(draft.id);
    setEditedContent(draft.content);
  }

  async function handleSaveEdit(draftId: string) {
    if (!editedContent.trim()) {
      setFeedback("Le contenu ne peut pas être vide.");
      return;
    }

    setProcessingId(draftId);
    try {
      await updateDraftContent(draftId, editedContent.trim());
      setDrafts((current) =>
        current.map((draft) =>
          draft.id === draftId ? { ...draft, content: editedContent.trim() } : draft,
        ),
      );
      setEditingId(null);
      setEditedContent("");
      setFeedback("Draft mis à jour.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Impossible de sauvegarder le draft.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleRegenerate(draftId: string) {
    setProcessingId(draftId);
    try {
      await regenerateDraft(draftId);
      setDrafts((current) =>
        current.map((draft) =>
          draft.id === draftId ? { ...draft, status: "regenerating" } : draft,
        ),
      );
      setFeedback("Draft marqué pour régénération.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Impossible de regénérer le draft.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleDelete(draftId: string) {
    const confirmed = window.confirm("Supprimer définitivement ce draft ?");
    if (!confirmed) {
      return;
    }

    setProcessingId(draftId);
    try {
      await deleteDraft(draftId);
      setDrafts((current) => current.filter((draft) => draft.id !== draftId));
      setFeedback("Draft supprimé.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Impossible de supprimer le draft.");
    } finally {
      setProcessingId(null);
    }
  }

  const filteredDrafts = useMemo(() => {
    if (filter === "all") {
      return drafts;
    }

    return drafts.filter((draft) => draft.status === filter);
  }, [drafts, filter]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Drafts LinkedIn</h1>
        <p className="mt-1 text-slate-500">Gère tes publications générées automatiquement</p>
      </div>

      <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
        <TabsList className="border border-slate-200 bg-white">
          <TabsTrigger value="all">Tous</TabsTrigger>
          <TabsTrigger value="pending">En attente</TabsTrigger>
          <TabsTrigger value="approved">Approuvés</TabsTrigger>
          <TabsTrigger value="rejected">Rejetés</TabsTrigger>
        </TabsList>
      </Tabs>

      {feedback ? (
        <Card className="border-slate-200">
          <CardContent className="py-3 text-sm text-slate-700">{feedback}</CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <Card className="border-slate-200">
          <CardContent className="py-8 text-sm text-slate-500">Chargement des drafts…</CardContent>
        </Card>
      ) : null}

      {!isLoading && filteredDrafts.length === 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-10 text-center text-slate-600">
            Aucun draft — l&apos;agent LinkedIn génère un nouveau post chaque matin à 6h
          </CardContent>
        </Card>
      ) : null}

      {!isLoading &&
        filteredDrafts.map((draft) => {
          const draftSources = normalizeSources(draft.sources);
          const isProcessing = processingId === draft.id;
          const inEditMode = editingId === draft.id;
          const styleKey = draft.style?.toLowerCase() ?? "";
          const styleLabel = styleLabels[styleKey] ?? draft.style ?? "Style libre";

          return (
            <Card key={draft.id} className="border-slate-200 shadow-sm">
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{styleLabel}</Badge>
                  <Badge variant={draft.status === "approved" ? "secondary" : draft.status === "rejected" ? "destructive" : "outline"}>
                    {draft.status === "regenerating"
                      ? "Régénération"
                      : draft.status === "pending"
                        ? statusLabels.pending
                        : draft.status === "approved"
                          ? statusLabels.approved
                          : statusLabels.rejected}
                  </Badge>
                </div>
                <CardTitle className="text-sm font-normal text-slate-600">
                  Créé le {formatDate(draft.created_at)}
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {inEditMode ? (
                  <textarea
                    className="min-h-[180px] w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-slate-300"
                    value={editedContent}
                    onChange={(event) => setEditedContent(event.target.value)}
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{draft.content}</p>
                )}

                {draftSources.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sources utilisées</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {draftSources.map((source, index) => (
                        <li key={`${draft.id}-source-${index}`}>{source}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="outline" onClick={() => void handleCopy(draft.content)} disabled={isProcessing}>
                    Copier
                  </Button>
                  {inEditMode ? (
                    <Button onClick={() => void handleSaveEdit(draft.id)} disabled={isProcessing}>
                      Sauvegarder
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => handleStartEdit(draft)} disabled={isProcessing}>
                      Éditer
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => void handleRegenerate(draft.id)} disabled={isProcessing}>
                    Regénérer
                  </Button>
                  <Button variant="destructive" onClick={() => void handleDelete(draft.id)} disabled={isProcessing}>
                    Supprimer
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}
