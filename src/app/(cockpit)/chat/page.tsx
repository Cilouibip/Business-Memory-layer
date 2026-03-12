"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ChatSidebar } from "@/components/cockpit/chat/ChatSidebar";
import { ChatMessage } from "@/components/cockpit/chat/ChatMessage";
import { ChatInput } from "@/components/cockpit/chat/ChatInput";
import { Sparkles, BrainCircuit, Users, Zap } from "lucide-react";

const WORKSPACE_ID = "personal";

type ToolCallBadge = { toolName: string; output?: string; status: "pending" | "success" | "error" };
type UiMessage = { id: string; role: "user" | "assistant"; content: string; toolCalls?: ToolCallBadge[] };
type ConversationItem = { id: string; title: string | null; updated_at: string };

const QUICK_ACTIONS = [
  { icon: Zap, label: "Point sur ma semaine", prompt: "Fais-moi un résumé de tout ce qui s'est passé cette semaine (deals, contenu, etc)." },
  { icon: BrainCircuit, label: "Préparer un post LinkedIn", prompt: "Je veux écrire un post LinkedIn. Pose-moi 3 questions pour définir l'angle et le sujet." },
  { icon: Users, label: "Ajouter un lead", prompt: "Je viens d'avoir un appel avec un nouveau prospect. Pose-moi les questions nécessaires pour l'ajouter au CRM." },
];

export default function ChatPage() {
  const endRef = useRef<HTMLDivElement | null>(null);
  const toolMapRef = useRef<Record<string, { name: string; output?: string }>>({});
  
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  async function loadConversations() {
    setIsLoadingConversations(true);
    try {
      const response = await fetch(`/api/chat?workspace_id=${WORKSPACE_ID}`);
      if (!response.ok) throw new Error(`Erreur chargement conversations: ${response.status}`);
      const data = await response.json();
      setConversations((data.conversations ?? []) as ConversationItem[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoadingConversations(false);
    }
  }

  async function openConversation(id: string) {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/chat?conversation_id=${id}`);
      if (!response.ok) throw new Error(`Erreur chargement messages: ${response.status}`);
      const data = await response.json();
      
      const loaded: UiMessage[] = (data.messages ?? []).map((message: any) => {
        const storedToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
        const mappedToolCalls = storedToolCalls
          .filter((call: any) => typeof call?.toolName === "string")
          .map((call: any) => ({
            toolName: call.toolName,
            output: call.result ? "Exécuté avec succès" : undefined,
            status: "success" as const
          }));
          
        return {
          id: String(message.id),
          role: message.role === "assistant" ? "assistant" : "user",
          content: String(message.content ?? ""),
          toolCalls: mappedToolCalls,
        };
      });
      
      setConversationId(id);
      setMessages(loaded);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadConversations();
  }, []);

  async function handleQuickAction(prompt: string) {
    setInput(prompt);
    // On laisse le state se mettre à jour puis on lance le submit
    setTimeout(() => {
      const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
      void onSubmit(fakeEvent, prompt);
    }, 50);
  }

  async function onSubmit(event?: React.FormEvent, forceInput?: string) {
    event?.preventDefault();
    const userText = forceInput ?? input.trim();
    if (!userText || isLoading) return;
    
    setError(null);

    const userMessage: UiMessage = { id: `u-${Date.now()}`, role: "user", content: userText };
    const assistantId = `a-${Date.now()}`;
    const assistantMessage: UiMessage = { id: assistantId, role: "assistant", content: "", toolCalls: [] };

    const nextMessages = [...messages, userMessage];
    setMessages([...nextMessages, assistantMessage]);
    setInput("");
    setIsLoading(true);
    toolMapRef.current = {};

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId ?? undefined,
          workspace_id: WORKSPACE_ID,
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok || !response.body) throw new Error(`Erreur backend: ${response.status}`);
      
      const newConversationId = response.headers.get("x-conversation-id");
      if (newConversationId && !conversationId) {
        setConversationId(newConversationId);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          const dataLines = rawEvent
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.replace(/^data:\s?/, ""));
            
          if (dataLines.length === 0) continue;
          const payload = dataLines.join("\n").trim();
          if (!payload || payload === "[DONE]") continue;

          let chunk: any;
          try { chunk = JSON.parse(payload); } catch { continue; }

          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== assistantId) return msg;

            let newContent = msg.content;
            let newToolCalls = [...(msg.toolCalls || [])];

            // Texte classique
            if (chunk.type === "text-delta" && typeof chunk.delta === "string") {
              newContent += chunk.delta;
            }

            // L'outil démarre ("Thinking")
            if (chunk.type === "tool-input-start" || chunk.type === "tool-input-available") {
              if (chunk.toolCallId && chunk.toolName) {
                toolMapRef.current[chunk.toolCallId] = { name: chunk.toolName };
                // Ajouter à l'UI si pas déjà présent
                if (!newToolCalls.find(t => t.toolName === chunk.toolName && t.status === "pending")) {
                  newToolCalls.push({ toolName: chunk.toolName, status: "pending" });
                }
              }
            }

            // L'outil a terminé
            if (chunk.type === "tool-output-available" && chunk.toolCallId) {
              const tool = toolMapRef.current[chunk.toolCallId];
              if (tool) {
                tool.output = chunk.output ? "Données récupérées" : "Action exécutée";
                // Mettre à jour l'UI (passer de pending à success)
                const existingIdx = newToolCalls.findIndex(t => t.toolName === tool.name && t.status === "pending");
                if (existingIdx >= 0) {
                  newToolCalls[existingIdx] = { toolName: tool.name, status: "success", output: tool.output };
                } else {
                  newToolCalls.push({ toolName: tool.name, status: "success", output: tool.output });
                }
              }
            }

            return { ...msg, content: newContent, toolCalls: newToolCalls };
          }));
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
      await loadConversations();
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      {/* SIDEBAR */}
      <div className="hidden w-64 flex-shrink-0 md:block">
        <ChatSidebar
          conversations={conversations}
          activeId={conversationId}
          isLoading={isLoadingConversations}
          onSelect={openConversation}
          onNew={() => { setConversationId(null); setMessages([]); setError(null); }}
        />
      </div>

      {/* MAIN CHAT AREA */}
      <div className="flex flex-1 flex-col relative">
        {/* Messages List */}
        <div className="flex-1 overflow-y-auto scroll-smooth">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                Business Memory Layer
              </h2>
              <p className="mb-8 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                Ton copilote a accès à tout ton contexte d'entreprise. Pose-lui une question ou demande-lui d'exécuter une tâche.
              </p>

              {/* QUICK ACTIONS */}
              <div className="grid w-full max-w-2xl gap-3 md:grid-cols-3">
                {QUICK_ACTIONS.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuickAction(action.prompt)}
                    className="flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/50"
                  >
                    <action.icon className="h-5 w-5 text-indigo-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="pb-8">
              {messages.map((message, idx) => (
                <ChatMessage 
                  key={message.id} 
                  role={message.role} 
                  content={message.content} 
                  toolCalls={message.toolCalls}
                  isLatest={idx === messages.length - 1} 
                />
              ))}
              {error && (
                <div className="mx-auto mt-4 w-full max-w-3xl px-4">
                  <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50">
                    Erreur: {error}
                  </div>
                </div>
              )}
              <div ref={endRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="bg-gradient-to-t from-white via-white to-white/0 px-4 pb-4 pt-6 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950/0 md:px-8">
          <div className="mx-auto w-full max-w-4xl">
            <ChatInput 
              input={input} 
              setInput={setInput} 
              onSubmit={onSubmit} 
              isLoading={isLoading} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}
