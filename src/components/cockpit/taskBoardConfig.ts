export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  source_type: string;
  created_at: string;
};

export const priorityOrder: Record<TaskPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export const priorityClasses: Record<TaskPriority, string> = {
  urgent: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-blue-100 text-blue-800",
  low: "bg-slate-100 text-slate-600",
};

export const statusLabels: Record<TaskStatus, string> = {
  todo: "todo",
  in_progress: "in_progress",
  done: "done",
};

export const sourceIcons: Record<string, string> = {
  chat: "💬",
  agent: "🤖",
  hook: "⚡",
  manual: "✏️",
  crm: "📊",
};

export const kanbanColumns: Array<{ key: TaskStatus; label: string }> = [
  { key: "todo", label: "À faire" },
  { key: "in_progress", label: "En cours" },
  { key: "done", label: "Fait" },
];

export function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}
