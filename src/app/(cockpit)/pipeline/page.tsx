"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createDealWithContact, deleteDeal, getDealsWithContacts, updateDeal, type DealStatus, type PipelineDeal } from "@/lib/pipelineQueries";
import { requireSupabaseBrowser } from "@/lib/supabaseBrowser";

type Filter = "all" | DealStatus;
type Field = "name" | "company" | "offer" | "amount" | "next_action" | "next_action_date";
const filters: Filter[] = ["all", "lead", "qualified", "call_scheduled", "proposal_sent", "won", "lost"];
const labels: Record<DealStatus, string> = { lead: "Lead", qualified: "Qualified", call_scheduled: "Call prévue", proposal_sent: "Proposition", won: "Won", lost: "Lost" };
const badgeClass: Record<DealStatus, string> = {
  lead: "bg-slate-100 text-slate-700 border-slate-200",
  qualified: "bg-blue-100 text-blue-700 border-blue-200",
  call_scheduled: "bg-amber-100 text-amber-700 border-amber-200",
  proposal_sent: "bg-purple-100 text-purple-700 border-purple-200",
  won: "bg-emerald-100 text-emerald-700 border-emerald-200",
  lost: "bg-red-100 text-red-700 border-red-200",
};

function Cell({
  editing,
  value,
  draft,
  setDraft,
  onEdit,
  onSave,
  onCancel,
  type = "text",
}: {
  editing: boolean;
  value: string | number | null;
  draft: string;
  setDraft: (v: string) => void;
  onEdit: () => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  type?: "text" | "number" | "date";
}) {
  return (
    <td className="px-3 py-2">
      {editing ? (
        <Input
          autoFocus
          value={draft}
          type={type}
          className="h-8"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void onSave()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onSave();
            if (e.key === "Escape") onCancel();
          }}
        />
      ) : (
        <button type="button" onClick={onEdit} className="w-full text-left text-slate-900 hover:text-slate-700">
          {String(value || "—")}
        </button>
      )}
    </td>
  );
}

export default function PipelinePage() {
  const [deals, setDeals] = useState<PipelineDeal[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [offer, setOffer] = useState("Machine à Revenus");
  const [edit, setEdit] = useState<{ dealId: string; field: Field } | null>(null);
  const [draft, setDraft] = useState("");

  const visibleDeals = useMemo(() => deals.filter((d) => (filter === "all" ? true : d.status === filter)), [deals, filter]);
  const revenue = useMemo(() => visibleDeals.reduce((a, d) => a + (typeof d.amount === "number" ? Number(d.amount) : 0), 0), [visibleDeals]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        setDeals(await getDealsWithContacts());
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const beginEdit = (dealId: string, field: Field, value: string | number | null) => {
    if (saving) return;
    setEdit({ dealId, field });
    setDraft(value == null ? "" : String(value));
  };

  const saveEdit = async () => {
    if (!edit) return;
    const current = deals.find((d) => d.id === edit.dealId);
    if (!current) return;
    const v = draft.trim();
    setSaving(true);
    setError(null);
    try {
      if (edit.field === "name" || edit.field === "company") {
        if (!current.contact?.id) throw new Error("Contact manquant");
        const payload = edit.field === "name" ? { name: v || "Sans nom" } : { company: v || null };
        const supabaseBrowser = requireSupabaseBrowser();
        const { error: contactError } = await (supabaseBrowser as any).from("contacts").update(payload).eq("id", current.contact.id);
        if (contactError) throw new Error(contactError.message);
        setDeals((prev) =>
          prev.map((d) =>
            d.id !== edit.dealId || !d.contact ? d : { ...d, contact: { ...d.contact, ...(edit.field === "name" ? { name: v || "Sans nom" } : { company: v || null }) } },
          ),
        );
      } else {
        const patch: Record<string, unknown> = {
          ...(edit.field === "offer" ? { offer: v || "Machine à Revenus" } : {}),
          ...(edit.field === "amount" ? { amount: v ? Number(v) : null } : {}),
          ...(edit.field === "next_action" ? { next_action: v || null } : {}),
          ...(edit.field === "next_action_date" ? { next_action_date: v || null } : {}),
        };
        await updateDeal(edit.dealId, patch as any);
        setDeals((prev) =>
          prev.map((d) =>
            d.id !== edit.dealId
              ? d
              : { ...d, ...(edit.field === "offer" ? { offer: v || "Machine à Revenus" } : {}), ...(edit.field === "amount" ? { amount: v ? Number(v) : null } : {}), ...(edit.field === "next_action" ? { next_action: v || null } : {}), ...(edit.field === "next_action_date" ? { next_action_date: v || null } : {}) },
          ),
        );
      }
      setEdit(null);
      setDraft("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (dealId: string, status: DealStatus) => {
    setSaving(true);
    setError(null);
    try {
      await updateDeal(dealId, { status });
      setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, status } : d)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const addLead = async () => {
    if (!name.trim() || !offer.trim()) return setError("Nom et offre obligatoires.");
    setSaving(true);
    setError(null);
    try {
      const created = await createDealWithContact(name.trim(), company.trim(), offer.trim(), 3000);
      setDeals((prev) => [created, ...prev]);
      setName("");
      setCompany("");
      setOffer("Machine à Revenus");
      setCreating(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (dealId: string) => {
    if (!window.confirm("Supprimer ce deal ?")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteDeal(dealId);
      setDeals((prev) => prev.filter((d) => d.id !== dealId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-2xl font-bold text-slate-900">Pipeline</CardTitle>
          <p className="mt-1 text-sm text-slate-500">{visibleDeals.length} deals • CA total {revenue.toLocaleString("fr-FR")} €</p>
        </div>
        <Button type="button" onClick={() => setCreating((v) => !v)} className="bg-slate-900 text-white hover:bg-slate-800">
          <Plus className="mr-1 h-4 w-4" /> Nouveau lead
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {creating && (
          <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
            <Input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Entreprise" value={company} onChange={(e) => setCompany(e.target.value)} />
            <Input placeholder="Offre" value={offer} onChange={(e) => setOffer(e.target.value)} />
            <Button type="button" onClick={addLead} disabled={saving}>Ajouter</Button>
          </div>
        )}

        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="border border-slate-200 bg-white">
            {filters.map((s) => <TabsTrigger key={s} value={s}>{s === "all" ? "Tous" : labels[s]}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="overflow-auto rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {["Nom", "Entreprise", "Offre", "Montant (€)", "Statut", "Prochaine action", "Date"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">Chargement...</td></tr> : null}
              {!loading && visibleDeals.length === 0 ? <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">Aucun deal.</td></tr> : null}
              {!loading && visibleDeals.map((d) => (
                <tr key={d.id} className="border-t border-slate-200 text-slate-900">
                  <Cell editing={edit?.dealId === d.id && edit.field === "name"} value={d.contact?.name ?? ""} draft={draft} setDraft={setDraft} onEdit={() => beginEdit(d.id, "name", d.contact?.name ?? "")} onSave={saveEdit} onCancel={() => setEdit(null)} />
                  <Cell editing={edit?.dealId === d.id && edit.field === "company"} value={d.contact?.company ?? ""} draft={draft} setDraft={setDraft} onEdit={() => beginEdit(d.id, "company", d.contact?.company ?? "")} onSave={saveEdit} onCancel={() => setEdit(null)} />
                  <Cell editing={edit?.dealId === d.id && edit.field === "offer"} value={d.offer} draft={draft} setDraft={setDraft} onEdit={() => beginEdit(d.id, "offer", d.offer)} onSave={saveEdit} onCancel={() => setEdit(null)} />
                  <Cell editing={edit?.dealId === d.id && edit.field === "amount"} value={d.amount} draft={draft} setDraft={setDraft} onEdit={() => beginEdit(d.id, "amount", d.amount)} onSave={saveEdit} onCancel={() => setEdit(null)} type="number" />
                  <td className="px-3 py-2">
                    <select value={d.status} onChange={(e) => void setStatus(d.id, e.target.value as DealStatus)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs">
                      {filters.filter((s): s is DealStatus => s !== "all").map((s) => <option key={s} value={s}>{labels[s]}</option>)}
                    </select>
                    <Badge className={`ml-2 border ${badgeClass[d.status]}`}>{labels[d.status]}</Badge>
                  </td>
                  <Cell editing={edit?.dealId === d.id && edit.field === "next_action"} value={d.next_action} draft={draft} setDraft={setDraft} onEdit={() => beginEdit(d.id, "next_action", d.next_action)} onSave={saveEdit} onCancel={() => setEdit(null)} />
                  <Cell editing={edit?.dealId === d.id && edit.field === "next_action_date"} value={d.next_action_date} draft={draft} setDraft={setDraft} onEdit={() => beginEdit(d.id, "next_action_date", d.next_action_date)} onSave={saveEdit} onCancel={() => setEdit(null)} type="date" />
                  <td className="px-3 py-2"><Button type="button" variant="ghost" size="sm" className="text-slate-500 hover:text-red-600" onClick={() => void remove(d.id)}><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
