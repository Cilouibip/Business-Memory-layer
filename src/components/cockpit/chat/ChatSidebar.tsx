"use client";

import { MessageSquarePlus, MessageSquare, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

type ConversationItem = { id: string; title: string | null; updated_at: string };

type ChatSidebarProps = {
  conversations: ConversationItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  isLoading?: boolean;
};

function formatGroupDate(dateString: string) {
  const date = parseISO(dateString);
  if (isToday(date)) return "Aujourd'hui";
  if (isYesterday(date)) return "Hier";
  return format(date, "MMMM yyyy", { locale: fr });
}

export function ChatSidebar({ conversations, activeId, onSelect, onNew, isLoading }: ChatSidebarProps) {
  // Group conversations by date
  const grouped = conversations.reduce((acc, conv) => {
    const group = formatGroupDate(conv.updated_at);
    if (!acc[group]) acc[group] = [];
    acc[group].push(conv);
    return acc;
  }, {} as Record<string, ConversationItem[]>);

  return (
    <div className="flex h-full w-full flex-col border-r border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="p-4">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-all dark:bg-indigo-600 dark:hover:bg-indigo-500"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Nouvelle discussion
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"></div>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
            <History className="mb-2 h-8 w-8 opacity-20" />
            <p className="text-sm">Aucun historique</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="space-y-1">
                <h3 className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  {group}
                </h3>
                <div className="space-y-0.5">
                  {items.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => onSelect(conv.id)}
                      className={cn(
                        "group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                        activeId === conv.id
                          ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-indigo-400 dark:ring-slate-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
                      )}
                    >
                      <MessageSquare className={cn(
                        "h-4 w-4 shrink-0",
                        activeId === conv.id ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 group-hover:text-slate-500"
                      )} />
                      <span className="truncate">{conv.title || "Nouvelle conversation"}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
