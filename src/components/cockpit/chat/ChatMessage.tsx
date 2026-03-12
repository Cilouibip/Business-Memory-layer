"use client";

import { User, Sparkles, Terminal, CheckCircle2, ChevronRight, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

type ToolCallBadge = {
  toolName: string;
  output?: string;
  status: "pending" | "success" | "error";
};

type ChatMessageProps = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallBadge[];
  isLatest?: boolean;
};

// Map tool names to user-friendly text and icons
function formatToolCall(toolName: string) {
  const map: Record<string, { label: string; icon: any }> = {
    create_contact: { label: "Création d'un contact CRM", icon: User },
    create_deal: { label: "Création d'un deal CRM", icon: Sparkles },
    update_deal: { label: "Mise à jour du deal", icon: Activity },
    log_activity: { label: "Enregistrement de l'activité", icon: CheckCircle2 },
    get_pipeline_summary: { label: "Analyse du pipeline", icon: Activity },
  };
  return map[toolName] || { label: `Exécution : ${toolName}`, icon: Terminal };
}

export function ChatMessage({ role, content, toolCalls = [], isLatest }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={cn("group flex w-full gap-4 px-4 py-6 md:px-6", isUser ? "bg-transparent" : "bg-slate-50/50 dark:bg-slate-900/20 border-y border-slate-100 dark:border-slate-800/50")}>
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg border shadow-sm",
          isUser 
            ? "bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300" 
            : "bg-indigo-600 border-indigo-700 text-white dark:bg-indigo-500"
        )}>
          {isUser ? <User className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        </div>
      </div>

      {/* Content */}
      <div className="flex w-full min-w-0 flex-col gap-4">
        {/* Tool Calls (Deep Thinking) */}
        {toolCalls.length > 0 && (
          <div className="flex flex-col gap-2">
            {toolCalls.map((call, idx) => {
              const { label, icon: Icon } = formatToolCall(call.toolName);
              const isPending = call.status === "pending";
              
              return (
                <div key={idx} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 w-fit">
                  {isPending ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                  ) : (
                    <Icon className="h-4 w-4 text-emerald-500" />
                  )}
                  <span className="font-medium">{label}</span>
                  {call.output && (
                    <>
                      <ChevronRight className="h-3 w-3 text-slate-300" />
                      <span className="text-slate-500 truncate max-w-[200px]">{call.output}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Text Content */}
        {content && (
          <div className="prose prose-slate dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:text-slate-50">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}

        {/* Blinking cursor if it's the latest assistant message and it's still generating (empty content) */}
        {!isUser && !content && toolCalls.length === 0 && isLatest && (
          <div className="flex gap-1.5 mt-2">
            <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
    </div>
  );
}
