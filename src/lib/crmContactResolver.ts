import { supabase } from './supabase';

export type Contact = {
  id: string;
  name: string;
  company: string | null;
  source: string | null;
  notes: string | null;
};

export type ContactMatch =
  | { status: 'single'; contact: Contact }
  | { status: 'multiple'; matches: Contact[] }
  | { status: 'none'; created_contact: Contact };

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isFuzzyMatch(query: string, candidate: string): boolean {
  const q = normalize(query);
  const c = normalize(candidate);
  return c.includes(q) || q.includes(c);
}

async function getAllContacts(): Promise<Contact[]> {
  const { data, error } = await (supabase as any).from('contacts').select('id,name,company,source,notes');
  if (error) throw new Error(error.message);
  return (data ?? []) as Contact[];
}

export async function resolveContactByName(
  contactName: string,
  createContact: (input: { name: string; source?: string }) => Promise<Contact>,
): Promise<ContactMatch> {
  const contacts = await getAllContacts();
  const matches = contacts.filter((contact) => isFuzzyMatch(contactName, contact.name));

  if (matches.length > 1) return { status: 'multiple', matches };
  if (matches.length === 1) return { status: 'single', contact: matches[0] };

  const created = await createContact({ name: contactName, source: 'chat' });
  return { status: 'none', created_contact: created };
}
