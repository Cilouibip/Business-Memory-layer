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
};
