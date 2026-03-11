"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

function inlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g).filter(Boolean);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function renderMarkdown(text: string) {
  return text.split("\n").map((line, idx) =>
    line.trim().startsWith("- ") ? (
      <div key={`${line}-${idx}`} className="flex gap-2">
        <span>•</span>
        <span>{inlineMarkdown(line.replace(/^- /, ""))}</span>
      </div>
    ) : (
      <p key={`${line}-${idx}`}>{inlineMarkdown(line)}</p>
    ),
  );
}

function assistantText(message: any): string {
  const textParts = (message.parts ?? [])
    .filter((part: any) => part?.type === "text" && typeof part.text === "string")
    .map((part: any) => part.text)
    .join("");
  return textParts || (typeof message.content === "string" ? message.content : "");
}

function toolBadges(message: any): string[] {
  return message.toolBadges ?? [];
}

export default function ChatPage() {
  const endRef = useRef<HTMLDivElement | null>(null);
  const toolMapRef = useRef<Record<string, string>>({});
  const [messages, setMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string; toolBadges?: string[] }>>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);

  function badgeFromTool(toolName: string, output: any): string {
    if (toolName === "create_contact" && output?.name) return `Contact créé : ${output.name}`;
    if (toolName === "create_deal" && output?.contact?.name) return `Deal créé : ${output.contact.name}`;
    if (toolName === "update_deal" && output?.deal?.status) return `Deal mis à jour : ${output.deal.status}`;
    if (toolName === "log_activity") return "Activité CRM enregistrée";
    if (toolName === "get_pipeline_summary") return "Résumé pipeline récupéré";
    if (toolName === "get_overdue_actions") return "Actions en retard récupérées";
    return `Outil CRM exécuté : ${toolName}`;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const userText = input.trim();
    if (!userText || isLoading) return;
    setError(null);

    const userMessage = { id: `u-${Date.now()}`, role: "user" as const, content: userText };
    const assistantId = `a-${Date.now()}`;
    const assistantMessage = { id: assistantId, role: "assistant" as const, content: "", toolBadges: [] as string[] };

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
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Erreur backend chat: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const addAssistantText = (delta: string) => {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, content: `${message.content}${delta}` } : message,
          ),
        );
      };

      const addToolBadge = (badge: string) => {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? { ...message, toolBadges: Array.from(new Set([...(message.toolBadges ?? []), badge])) }
              : message,
          ),
        );
      };

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
          try {
            chunk = JSON.parse(payload);
          } catch {
            continue;
          }

          if (chunk.type === "text-delta" && typeof chunk.delta === "string") {
            addAssistantText(chunk.delta);
          }
          if ((chunk.type === "tool-input-start" || chunk.type === "tool-input-available") && chunk.toolCallId && chunk.toolName) {
            toolMapRef.current[String(chunk.toolCallId)] = String(chunk.toolName);
          }
          if (chunk.type === "tool-output-available" && chunk.toolCallId) {
            const toolName = toolMapRef.current[String(chunk.toolCallId)] ?? "unknown_tool";
            addToolBadge(badgeFromTool(toolName, chunk.output));
          }
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Chat IA</h1>
        <p className="mt-1 text-slate-500">Échange avec ton business brain</p>
      </div>

      <Card className="flex min-h-[620px] flex-1 flex-col border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-slate-900">Conversation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4 p-4">
          <ScrollArea className="h-[470px] rounded-md border border-slate-200 bg-white p-3">
            <div className="flex flex-col gap-3">
              {messages.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Commence la conversation. Exemple: “j&apos;ai eu un call avec Sophie, ajoute-la au CRM”.
                </p>
              ) : null}

              {messages.map((message) => {
                const isUser = message.role === "user";
                const crmBadges = !isUser ? toolBadges(message) : [];
                const text = isUser ? String(message.content ?? "") : assistantText(message as any);

                return (
                  <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${isUser ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-900"}`}>
                      <div className="space-y-1 whitespace-pre-wrap">{renderMarkdown(text)}</div>
                      {crmBadges.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {crmBadges.map((label, index) => (
                            <Badge key={`${label}-${index}`} className="border border-emerald-200 bg-emerald-100 text-emerald-700">
                              {label}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          </ScrollArea>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <form onSubmit={onSubmit} className="flex items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Parle à ton business... (ex: j'ai eu un call avec Sophie)"
              className="border-slate-200 bg-white"
            />
            <Button type="submit" disabled={isLoading || input.trim().length === 0} className="bg-slate-900 text-white hover:bg-slate-800">
              Envoyer
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
