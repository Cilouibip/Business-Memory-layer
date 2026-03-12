"use client";

import { Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import TextareaAutosize from 'react-textarea-autosize';

type ChatInputProps = {
  input: string;
  setInput: (value: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  isLoading: boolean;
};

export function ChatInput({ input, setInput, onSubmit, isLoading }: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative flex w-full flex-col rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:focus-within:border-indigo-500">
      <TextareaAutosize
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Parle à ton business brain... (Shift+Entrée pour sauter une ligne)"
        className="max-h-[200px] w-full resize-none bg-transparent px-3 py-3 text-sm focus:outline-none dark:text-slate-100"
        minRows={1}
        maxRows={8}
      />
      <div className="flex items-center justify-between px-2 pb-1 pt-2">
        <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Powered by BML</span>
        </div>
        <button
          type="button"
          onClick={() => onSubmit()}
          disabled={isLoading || !input.trim()}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
            input.trim() && !isLoading
              ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
              : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600"
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
