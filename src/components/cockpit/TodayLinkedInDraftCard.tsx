type PendingDraft = {
  id: string;
  content: string;
  style: string | null;
  created_at: string;
};

export function TodayLinkedInDraftCard({ initialDraft }: { initialDraft: PendingDraft | null }) {
  if (!initialDraft) {
    return <p className="text-sm text-slate-400">Agent LinkedIn pas encore activé</p>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <p className="whitespace-pre-line text-sm text-slate-900">{initialDraft.content}</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>Style: {initialDraft.style ?? 'style libre'}</span>
        <span>•</span>
        <span>{new Date(initialDraft.created_at).toLocaleString('fr-FR')}</span>
      </div>
    </div>
  );
}
