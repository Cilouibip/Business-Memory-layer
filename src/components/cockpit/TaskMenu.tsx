import { type TaskPriority, type TaskStatus } from './taskBoardConfig';
import { MoreHorizontal, Calendar, ArrowRight, Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";

type TaskMenuProps = {
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  onStatusChange: (status: TaskStatus) => void;
  onPriorityChange: (priority: TaskPriority) => void;
  onDueDateChange: (dueDate: string | null) => void;
};

export function TaskMenu({
  status,
  priority,
  dueDate,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
}: TaskMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <div className="px-2 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Statut</div>
          <select
            value={status}
            onChange={(e) => {
              onStatusChange(e.target.value as TaskStatus);
              setOpen(false);
            }}
            className="w-full mb-2 rounded-md border-slate-200 bg-transparent px-2 py-1 text-sm dark:border-slate-700"
          >
            <option value="todo">À faire</option>
            <option value="in_progress">En cours</option>
            <option value="done">Fait</option>
          </select>

          <div className="px-2 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Priorité</div>
          <select
            value={priority}
            onChange={(e) => {
              onPriorityChange(e.target.value as TaskPriority);
              setOpen(false);
            }}
            className="w-full mb-2 rounded-md border-slate-200 bg-transparent px-2 py-1 text-sm dark:border-slate-700"
          >
            <option value="urgent">Urgente</option>
            <option value="high">Haute</option>
            <option value="medium">Moyenne</option>
            <option value="low">Basse</option>
          </select>

          <div className="px-2 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Échéance</div>
          <input
            type="date"
            value={dueDate ?? ''}
            onChange={(e) => {
              onDueDateChange(e.target.value || null);
              setOpen(false);
            }}
            className="w-full rounded-md border border-slate-200 bg-transparent px-2 py-1 text-sm dark:border-slate-700"
          />
        </div>
      )}
    </div>
  );
}
