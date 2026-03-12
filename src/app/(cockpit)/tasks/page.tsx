"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatDate,
  kanbanColumns,
  priorityOrder,
  sourceIcons,
  statusLabels,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/components/cockpit/taskBoardConfig";
import { CreateTaskModal } from "@/components/cockpit/CreateTaskModal";
import { TaskMenu } from "@/components/cockpit/TaskMenu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, CheckCircle2, Clock, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "kanban" | "list";

type TaskPatch = {
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
};

const statusBadgeClass: Record<TaskStatus, string> = {
  todo: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
};

const priorityBadgeClass: Record<TaskPriority, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  medium: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
  high: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
  urgent: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("kanban");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  async function loadTasks() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/tasks");
      const data = (await response.json()) as Task[];
      if (!response.ok) {
        setErrorMessage("Impossible de charger les tâches.");
        return;
      }
      setTasks(data);
    } catch {
      setErrorMessage("Erreur réseau pendant le chargement des tâches.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, []);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const priorityDelta = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDelta !== 0) return priorityDelta;
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
  }, [tasks]);

  async function patchTask(taskId: string, patch: TaskPatch) {
    const previous = tasks;
    setErrorMessage(null);

    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, ...patch } : task)));

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!response.ok) {
        setTasks(previous);
        setErrorMessage("Impossible d'enregistrer la tâche.");
        return;
      }

      const updated = (await response.json()) as Task;
      setTasks((prev) => prev.map((task) => (task.id === taskId ? updated : task)));
    } catch {
      setTasks(previous);
      setErrorMessage("Erreur réseau pendant la sauvegarde.");
    }
  }

  async function handleCreateTask(input: { title: string; priority: TaskPriority; due_date: string | null }) {
    setErrorMessage(null);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          source_type: "manual",
          status: "todo",
          priority: input.priority,
          due_date: input.due_date,
        }),
      });

      const created = (await response.json()) as Task;
      if (!response.ok) {
        setErrorMessage("Impossible de créer la tâche.");
        return;
      }

      setTasks((prev) => [created, ...prev]);
    } catch {
      setErrorMessage("Erreur réseau pendant la création.");
    }
  }

  async function onDropToColumn(status: TaskStatus) {
    if (!draggingTaskId) return;
    const task = tasks.find((item) => item.id === draggingTaskId);
    setDraggingTaskId(null);
    if (!task || task.status === status) return;
    await patchTask(task.id, { status });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-12">
      {/* HEADER LINEAR STYLE */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Tâches</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Pilotage opérationnel de ton business</p>
        </div>
        
        <div className="flex items-center gap-4">
          <Tabs value={view} onValueChange={(value) => setView(value as ViewMode)} className="w-[200px]">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="kanban">Kanban</TabsTrigger>
              <TabsTrigger value="list">Liste</TabsTrigger>
            </TabsList>
          </Tabs>
          
          <CreateTaskModal onCreate={handleCreateTask} />
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50">
          {errorMessage}
        </div>
      )}

      {/* VIEW CONTENT */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"></div>
        </div>
      ) : (
        <>
          {/* KANBAN VIEW */}
          {view === "kanban" && (
            <div className="grid gap-6 md:grid-cols-3">
              {kanbanColumns.map((column) => (
                <div
                  key={column.key}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => void onDropToColumn(column.key)}
                  className={cn(
                    "flex flex-col gap-4 rounded-xl p-3 min-h-[500px] transition-colors",
                    "bg-slate-50/50 border border-slate-100 dark:bg-slate-900/20 dark:border-slate-800",
                    draggingTaskId ? "ring-2 ring-indigo-500/30 bg-indigo-50/30 dark:bg-indigo-900/10" : ""
                  )}
                >
                  <div className="flex items-center justify-between px-2">
                    <h3 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      {column.key === 'todo' && <Clock className="h-4 w-4 text-slate-400" />}
                      {column.key === 'in_progress' && <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />}
                      {column.key === 'done' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                      {column.label}
                    </h3>
                    <Badge variant="secondary" className="bg-white dark:bg-slate-800 text-slate-500">
                      {tasks.filter((task) => task.status === column.key).length}
                    </Badge>
                  </div>

                  <div className="flex flex-col gap-3">
                    {sortedTasks
                      .filter((task) => task.status === column.key)
                      .map((task) => (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={() => setDraggingTaskId(task.id)}
                          onDragEnd={() => setDraggingTaskId(null)}
                          className={cn(
                            "group cursor-grab active:cursor-grabbing relative flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm transition-all hover:shadow-md dark:bg-slate-950",
                            task.status === "done" ? "opacity-60 border-slate-100 dark:border-slate-800" : "border-slate-200 dark:border-slate-800"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className={cn(
                              "text-sm font-medium leading-tight",
                              task.status === "done" ? "text-slate-500 line-through" : "text-slate-900 dark:text-slate-100"
                            )}>
                              {task.title}
                            </p>
                            <TaskMenu
                              status={task.status}
                              priority={task.priority}
                              dueDate={task.due_date}
                              onStatusChange={(status) => void patchTask(task.id, { status })}
                              onPriorityChange={(priority) => void patchTask(task.id, { priority })}
                              onDueDateChange={(due_date) => void patchTask(task.id, { due_date })}
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={cn("text-[10px] uppercase font-semibold tracking-wider", priorityBadgeClass[task.priority])}>
                              {task.priority}
                            </Badge>
                            
                            {task.due_date && (
                              <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                <CalendarIcon className="h-3 w-3" />
                                {formatDate(task.due_date)}
                              </div>
                            )}

                            <div className="ml-auto flex items-center justify-center h-6 w-6 rounded-full bg-slate-100 dark:bg-slate-800 text-xs" title={task.source_type}>
                              {sourceIcons[task.source_type] ?? "📌"}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* LIST VIEW */}
          {view === "list" && (
            <Card className="border-slate-200 shadow-sm dark:border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900/50 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-3 px-4 font-medium w-12"></th>
                      <th className="py-3 px-4 font-medium">Titre</th>
                      <th className="py-3 px-4 font-medium w-32">Priorité</th>
                      <th className="py-3 px-4 font-medium w-32">Échéance</th>
                      <th className="py-3 px-4 font-medium w-24">Source</th>
                      <th className="py-3 px-4 font-medium w-32">Statut</th>
                      <th className="py-3 px-4 font-medium w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sortedTasks.map((task) => (
                      <tr 
                        key={task.id} 
                        className={cn(
                          "group hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors",
                          task.status === "done" && "opacity-60 bg-slate-50/30 dark:bg-slate-900/10"
                        )}
                      >
                        <td className="py-3 px-4 align-middle">
                          <button
                            onClick={() => void patchTask(task.id, { status: task.status === "done" ? "todo" : "done" })}
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded border transition-colors",
                              task.status === "done" 
                                ? "bg-emerald-500 border-emerald-500 text-white" 
                                : "border-slate-300 bg-white hover:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
                            )}
                          >
                            {task.status === "done" && <Check className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                        <td className="py-3 px-4 align-middle">
                          <span className={cn(
                            "font-medium",
                            task.status === "done" ? "text-slate-500 line-through" : "text-slate-900 dark:text-slate-100"
                          )}>
                            {task.title}
                          </span>
                        </td>
                        <td className="py-3 px-4 align-middle">
                          <Badge variant="outline" className={cn("text-[10px] uppercase font-semibold tracking-wider", priorityBadgeClass[task.priority])}>
                            {task.priority}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 align-middle text-slate-500 dark:text-slate-400">
                          {task.due_date ? formatDate(task.due_date) : "-"}
                        </td>
                        <td className="py-3 px-4 align-middle text-lg" title={task.source_type}>
                          {sourceIcons[task.source_type] ?? "📌"}
                        </td>
                        <td className="py-3 px-4 align-middle">
                          <Badge className={statusBadgeClass[task.status]}>
                            {statusLabels[task.status]}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 align-middle">
                          <TaskMenu
                            status={task.status}
                            priority={task.priority}
                            dueDate={task.due_date}
                            onStatusChange={(status) => void patchTask(task.id, { status })}
                            onPriorityChange={(priority) => void patchTask(task.id, { priority })}
                            onDueDateChange={(due_date) => void patchTask(task.id, { due_date })}
                          />
                        </td>
                      </tr>
                    ))}
                    {sortedTasks.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          Aucune tâche pour le moment.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
