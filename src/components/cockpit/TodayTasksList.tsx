'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Check, Clock, Calendar, Briefcase, Bot, Zap, PenLine } from 'lucide-react';
import { formatDistanceToNow, isToday, isPast, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

export type TaskItem = {
  type: 'task' | 'deal_action';
  id: string;
  title: string;
  priority: string;
  due_date: string | null;
  source: string;
};

const priorityConfig: Record<string, { color: string; border: string }> = {
  urgent: { color: 'bg-red-500', border: 'border-red-200 dark:border-red-900/50' },
  high: { color: 'bg-orange-500', border: 'border-orange-200 dark:border-orange-900/50' },
  medium: { color: 'bg-blue-500', border: 'border-blue-200 dark:border-blue-900/50' },
  low: { color: 'bg-slate-400', border: 'border-slate-200 dark:border-slate-800' },
};

const sourceIcons: Record<string, React.ReactNode> = {
  chat: <Bot className="h-3 w-3" />,
  agent: <Bot className="h-3 w-3" />,
  hook: <Zap className="h-3 w-3" />,
  manual: <PenLine className="h-3 w-3" />,
  crm: <Briefcase className="h-3 w-3" />,
  orchestrator: <Bot className="h-3 w-3" />,
};

function formatDueDate(dateString: string | null) {
  if (!dateString) return null;
  
  try {
    // Si c'est juste YYYY-MM-DD
    const date = dateString.length === 10 ? new Date(`${dateString}T12:00:00Z`) : parseISO(dateString);
    
    if (isToday(date)) return { text: "Aujourd'hui", urgent: true };
    if (isPast(date)) return { text: "En retard", urgent: true };
    
    return { 
      text: formatDistanceToNow(date, { addSuffix: true, locale: fr }),
      urgent: false 
    };
  } catch (e) {
    return null;
  }
}

export function TodayTaskItem({ task, onComplete }: { task: TaskItem, onComplete: (task: TaskItem) => Promise<void> }) {
  const [completing, setCompleting] = useState(false);
  const config = priorityConfig[task.priority] || priorityConfig.medium;
  const dateInfo = formatDueDate(task.due_date);

  async function handleComplete() {
    if (task.type !== 'task') return;
    setCompleting(true);
    await onComplete(task);
  }

  return (
    <div 
      className={cn(
        "group flex items-start gap-3 rounded-xl border bg-white p-3 shadow-sm transition-all hover:shadow-md dark:bg-slate-900",
        config.border,
        completing && "opacity-50 grayscale"
      )}
    >
      <div className="mt-0.5 flex shrink-0 items-center justify-center">
        {task.type === 'task' ? (
          <button
            onClick={handleComplete}
            disabled={completing}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors",
              "border-slate-300 hover:border-indigo-500 hover:bg-indigo-50 dark:border-slate-600 dark:hover:bg-indigo-900/30",
              completing && "animate-pulse"
            )}
          >
            {completing && <Check className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />}
          </button>
        ) : (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
            <Briefcase className="h-3 w-3" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className={cn(
          "truncate text-sm font-medium leading-none text-slate-900 dark:text-slate-100",
          completing && "line-through text-slate-500 dark:text-slate-500"
        )}>
          {task.title}
        </p>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Priority indicator */}
          <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            <div className={cn("h-1.5 w-1.5 rounded-full", config.color)} />
            {task.priority.toUpperCase()}
          </div>

          {/* Date indicator */}
          {dateInfo && (
            <div className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              dateInfo.urgent 
                ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" 
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
            )}>
              {dateInfo.urgent ? <Clock className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
              {dateInfo.text}
            </div>
          )}

          {/* Source indicator */}
          <div 
            className="flex items-center justify-center text-slate-400 dark:text-slate-500"
            title={`Source: ${task.source}`}
          >
            {sourceIcons[task.source] || <PenLine className="h-3 w-3" />}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TodayTasksList({ initialTasks }: { initialTasks: TaskItem[] }) {
  const [tasks, setTasks] = useState(initialTasks);

  async function handleComplete(task: TaskItem) {
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      // Animation délai pour voir le check
      setTimeout(() => {
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
      }, 300);
    } catch {
      // no-op
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
          <Check className="h-6 w-6" />
        </div>
        <p className="mt-4 text-sm font-medium text-slate-900 dark:text-slate-100">Zéro inbox opérationnelle 🎉</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Ton business tourne tout seul.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <TodayTaskItem key={task.id} task={task} onComplete={handleComplete} />
      ))}
    </div>
  );
}
