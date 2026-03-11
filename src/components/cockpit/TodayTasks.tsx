'use client';

import { useState } from 'react';

type TaskItem = {
  type: 'task' | 'deal_action';
  id: string;
  title: string;
  priority: string;
  due_date: string | null;
  source: string;
};

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-blue-100 text-blue-800',
  low: 'bg-slate-100 text-slate-600',
};

const sourceIcons: Record<string, string> = {
  chat: '💬',
  agent: '🤖',
  hook: '⚡',
  manual: '✏️',
  crm: '📊',
  orchestrator: '🧠',
};

export function TodayTasks({ initialTasks }: { initialTasks: TaskItem[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [completing, setCompleting] = useState<string | null>(null);

  async function handleComplete(task: TaskItem) {
    if (task.type !== 'task') return;
    setCompleting(task.id);
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch {
      // no-op
    } finally {
      setCompleting(null);
    }
  }

  if (tasks.length === 0) {
    return <p className="text-sm text-slate-400">Rien à faire — ton business tourne tout seul 🎉</p>;
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div key={task.id} className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-2">
          {task.type === 'task' ? (
            <button
              onClick={() => handleComplete(task)}
              disabled={completing === task.id}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-slate-300 text-xs hover:border-slate-500 disabled:opacity-50"
            >
              {completing === task.id ? '⟳' : ''}
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0 text-center text-xs">📊</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-900">{task.title}</p>
            {task.due_date && <p className="text-xs text-slate-400">{task.due_date}</p>}
          </div>
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${priorityColors[task.priority] ?? priorityColors.medium}`}
          >
            {task.priority}
          </span>
          <span className="text-xs" title={task.source}>
            {sourceIcons[task.source] ?? '📌'}
          </span>
        </div>
      ))}
    </div>
  );
}
