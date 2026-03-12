import { supabase } from './supabase';

export type Task = {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  source_type: string;
  source_id: string | null;
  related_deal_id: string | null;
  related_contact_id: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
};

export async function createTask(input: {
  title: string;
  description?: string;
  priority?: string;
  due_date?: string;
  source_type?: string;
  source_id?: string;
  related_deal_id?: string;
  related_contact_id?: string;
  workspace_id?: string;
  created_by?: string;
}): Promise<Task> {
  const workspaceId = input.workspace_id ?? 'personal';

  // Guard d'idempotence: ne pas créer de doublon "todo" avec le même titre
  const { data: existing, error: searchError } = await (supabase as any)
    .from('tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('title', input.title)
    .eq('status', 'todo')
    .limit(1)
    .maybeSingle();

  if (searchError) {
    throw new Error(`Erreur vérification doublon: ${searchError.message}`);
  }

  if (existing) {
    return existing as Task;
  }

  const { data, error } = await (supabase as any)
    .from('tasks')
    .insert([
      {
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? 'medium',
        due_date: input.due_date ?? null,
        source_type: input.source_type ?? 'manual',
        source_id: input.source_id ?? null,
        related_deal_id: input.related_deal_id ?? null,
        related_contact_id: input.related_contact_id ?? null,
        workspace_id: workspaceId,
        created_by: input.created_by ?? 'system',
      },
    ])
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as Task;
}

export async function listTasks(filters?: {
  status?: string;
  priority?: string;
  workspace_id?: string;
}): Promise<Task[]> {
  let query = (supabase as any)
    .from('tasks')
    .select('*')
    .eq('workspace_id', filters?.workspace_id ?? 'personal')
    .order('priority', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.priority) {
    query = query.eq('priority', filters.priority);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}

export async function updateTask(
  taskId: string,
  patch: { status?: string; priority?: string; due_date?: string; title?: string; description?: string },
): Promise<Task> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.priority !== undefined) updates.priority = patch.priority;
  if (patch.due_date !== undefined) updates.due_date = patch.due_date;
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.description !== undefined) updates.description = patch.description;

  if (patch.status === 'done') {
    updates.completed_at = new Date().toISOString();
  }

  const { data, error } = await (supabase as any)
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as Task;
}

export async function completeTaskByTitle(titleQuery: string, workspaceId = 'personal'): Promise<Task | null> {
  const { data: tasks, error } = await (supabase as any)
    .from('tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .neq('status', 'done')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const normalizedQuery = titleQuery.trim().toLowerCase();
  const match = (tasks ?? []).find(
    (t: any) => t.title.toLowerCase().includes(normalizedQuery) || normalizedQuery.includes(t.title.toLowerCase()),
  );

  if (!match) return null;

  return updateTask(match.id, { status: 'done' });
}

export async function getTodayAndOverdueTasks(workspaceId = 'personal'): Promise<Task[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await (supabase as any)
    .from('tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .neq('status', 'done')
    .or(`due_date.lte.${today},due_date.is.null`)
    .order('priority', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}
