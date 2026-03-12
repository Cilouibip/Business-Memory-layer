"use client";

import { useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

export function CopilotCommandBar() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    
    // Pour l'instant, on redirige vers le chat (on pourra passer le state initial au chat via URL si besoin)
    // Mais on garde la logique de redirection simple et propre.
    router.push(`/chat`);
  }

  return (
    <div className="relative group">
      <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-20 blur transition duration-500 group-hover:opacity-40"></div>
      <form 
        onSubmit={handleSubmit}
        className="relative flex items-center rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-white/10 overflow-hidden"
      >
        <div className="pl-4 pr-2">
          <Sparkles className="h-5 w-5 text-indigo-500" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Demande au copilote IA (ex: Ajoute Sophie de Digitale, Résume ma semaine...)"
          className="h-12 flex-1 bg-transparent px-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        <div className="pr-4 pl-2">
          <kbd className="hidden rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400 sm:inline-block">
            Entrée ↵
          </kbd>
        </div>
      </form>
    </div>
  );
}
