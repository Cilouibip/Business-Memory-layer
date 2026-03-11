import { tool } from 'ai';
import { z } from 'zod';
import {
  createContact,
  createDealByContactName,
  updateDealByContactName,
  logActivityByContactName,
  getPipelineSummary,
  getOverdueActions,
} from './crmQueries';
import { completeTaskByTitle, createTask, listTasks, updateTask } from './taskQueries';

export const crmTools = {
  create_contact: tool({
    description: 'Crée un contact dans le CRM',
    inputSchema: z.object({
      name: z.string().min(1),
      company: z.string().optional(),
      source: z.string().optional(),
      notes: z.string().optional(),
    }),
    execute: async ({ name, company, source, notes }) => {
      return createContact({ name, company, source, notes });
    },
  }),
  create_deal: tool({
    description: 'Crée un deal à partir du nom de contact avec matching fuzzy',
    inputSchema: z.object({
      contact_name: z.string().min(1),
      offer: z.string().min(1),
      amount: z.number().optional(),
      status: z.string().optional(),
    }),
    execute: async ({ contact_name, offer, amount, status }) => {
      return createDealByContactName({ contact_name, offer, amount, status });
    },
  }),
  update_deal: tool({
    description: 'Met à jour le deal le plus récent lié au contact',
    inputSchema: z.object({
      contact_name: z.string().min(1),
      status: z.string().optional(),
      next_action: z.string().optional(),
      next_action_date: z.string().optional(),
      amount: z.number().optional(),
    }),
    execute: async ({ contact_name, status, next_action, next_action_date, amount }) => {
      return updateDealByContactName({
        contact_name,
        status,
        next_action,
        next_action_date,
        amount,
      });
    },
  }),
  log_activity: tool({
    description: 'Ajoute une activité CRM liée à un contact',
    inputSchema: z.object({
      contact_name: z.string().min(1),
      type: z.string().min(1),
      description: z.string().min(1),
    }),
    execute: async ({ contact_name, type, description }) => {
      return logActivityByContactName({ contact_name, type, description });
    },
  }),
  get_pipeline_summary: tool({
    description: 'Retourne le résumé du pipeline commercial',
    inputSchema: z.object({}),
    execute: async () => {
      return getPipelineSummary();
    },
  }),
  get_overdue_actions: tool({
    description: 'Retourne les deals en retard de prochaine action',
    inputSchema: z.object({}),
    execute: async () => {
      return getOverdueActions();
    },
  }),
  create_task: tool({
    description: 'Crée une tâche dans le système de tâches',
    inputSchema: z.object({
      title: z.string().min(1),
      due_date: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      description: z.string().optional(),
    }),
    execute: async ({ title, due_date, priority, description }) => {
      return createTask({ title, due_date, priority, description, source_type: 'chat', created_by: 'chat' });
    },
  }),
  complete_task: tool({
    description: 'Complète une tâche par titre (fuzzy match) ou par id',
    inputSchema: z.object({
      task_title: z.string().optional(),
      task_id: z.string().optional(),
    }),
    execute: async ({ task_title, task_id }) => {
      if (task_id) {
        return updateTask(task_id, { status: 'done' });
      }
      if (task_title) {
        const result = await completeTaskByTitle(task_title);
        if (!result) return { status: 'not_found', message: `Aucune tâche trouvée pour "${task_title}"` };
        return { status: 'completed', task: result };
      }
      return { status: 'error', message: 'Fournis task_title ou task_id' };
    },
  }),
  list_tasks: tool({
    description: 'Liste les tâches, optionnellement filtrées par statut ou priorité',
    inputSchema: z.object({
      status: z.enum(['todo', 'in_progress', 'done']).optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    }),
    execute: async ({ status, priority }) => {
      return listTasks({ status, priority });
    },
  }),
  update_task: tool({
    description: 'Met à jour une tâche (statut, priorité, date, titre)',
    inputSchema: z.object({
      task_id: z.string().min(1),
      status: z.enum(['todo', 'in_progress', 'done']).optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      due_date: z.string().optional(),
      title: z.string().optional(),
    }),
    execute: async ({ task_id, status, priority, due_date, title }) => {
      return updateTask(task_id, { status, priority, due_date, title });
    },
  }),
};
