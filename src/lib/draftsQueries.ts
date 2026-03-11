import { requireSupabaseBrowser } from "@/lib/supabaseBrowser";

export type LinkedInDraftStatus = "pending" | "approved" | "rejected" | "regenerating";

export type LinkedInDraft = {
  id: string;
  workspace_id: string | null;
  content: string;
  style: string | null;
  sources: unknown;
  news_used: unknown;
  status: LinkedInDraftStatus;
  created_at: string;
  published_at: string | null;
};

export async function getDrafts(workspaceId?: string): Promise<LinkedInDraft[]> {
  const supabaseBrowser = requireSupabaseBrowser();
  let query = (supabaseBrowser as any)
    .from("linkedin_drafts")
    .select("id, workspace_id, content, style, sources, news_used, status, created_at, published_at")
    .order("created_at", { ascending: false });

  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Impossible de charger les drafts: ${error.message}`);
  }

  return ((data ?? []) as any[]).map((draft) => ({
    id: draft.id,
    workspace_id: draft.workspace_id ?? null,
    content: draft.content ?? "",
    style: draft.style ?? null,
    sources: draft.sources ?? null,
    news_used: draft.news_used ?? null,
    status: (draft.status ?? "pending") as LinkedInDraftStatus,
    created_at: draft.created_at,
    published_at: draft.published_at ?? null,
  }));
}

export async function updateDraftStatus(draftId: string, status: LinkedInDraftStatus): Promise<void> {
  const supabaseBrowser = requireSupabaseBrowser();
  const { error } = await (supabaseBrowser as any)
    .from("linkedin_drafts")
    .update({ status })
    .eq("id", draftId);

  if (error) {
    throw new Error(`Impossible de mettre à jour le statut du draft: ${error.message}`);
  }
}

export async function updateDraftContent(draftId: string, content: string): Promise<void> {
  const supabaseBrowser = requireSupabaseBrowser();
  const { error } = await (supabaseBrowser as any)
    .from("linkedin_drafts")
    .update({ content })
    .eq("id", draftId);

  if (error) {
    throw new Error(`Impossible de mettre à jour le contenu du draft: ${error.message}`);
  }
}

export async function deleteDraft(draftId: string): Promise<void> {
  const supabaseBrowser = requireSupabaseBrowser();
  const { error } = await (supabaseBrowser as any)
    .from("linkedin_drafts")
    .delete()
    .eq("id", draftId);

  if (error) {
    throw new Error(`Impossible de supprimer le draft: ${error.message}`);
  }
}

export async function regenerateDraft(draftId: string): Promise<void> {
  const supabaseBrowser = requireSupabaseBrowser();
  const { error } = await (supabaseBrowser as any)
    .from("linkedin_drafts")
    .update({ status: "regenerating" })
    .eq("id", draftId);

  if (error) {
    throw new Error(`Impossible de marquer le draft en regénération: ${error.message}`);
  }
}
