import { unipileClient } from './unipile';
import { supabase } from './supabase';

export type LinkedInPostStats = {
  id: string;
  text: string;
  likes: number;
  comments: number;
  shares: number;
  publishedAt: string;
};

type UnipilePost = {
  id?: string;
  social_id?: string;
  text?: string;
  parsed_datetime?: string;
  date?: string;
  reaction_counter?: number;
  comment_counter?: number;
  repost_counter?: number;
};

function truncate(text: string, maxLength = 100): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1)}…`;
}

function sanitizeText(text: string): string {
  return text.replace(/[\u{10000}-\u{10FFFF}]/gu, '').replace(/[\uD800-\uDFFF]/g, '').trim();
}

function normalizeDate(post: UnipilePost): string {
  const candidates = [post.parsed_datetime, post.date].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date(0).toISOString();
}

function parseCounter(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return value;
}

function getAccountId(): string {
  const accountId = process.env.UNIPILE_ACCOUNT_ID;
  if (!accountId) {
    throw new Error('Missing env var: UNIPILE_ACCOUNT_ID');
  }
  return accountId;
}

async function getLinkedInPostsFromBML(limit = 10): Promise<LinkedInPostStats[]> {
  const { data, error } = await (supabase as any)
    .from('raw_documents')
    .select('external_id, title, body, metadata, synced_at')
    .eq('source_type', 'linkedin')
    .order('synced_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((doc: any) => ({
    id: doc.external_id ?? '',
    text: truncate(sanitizeText(doc.body || doc.title || ''), 220),
    likes: typeof doc.metadata?.likes === 'number' ? doc.metadata.likes : 0,
    comments: typeof doc.metadata?.comments === 'number' ? doc.metadata.comments : 0,
    shares: typeof doc.metadata?.shares === 'number' ? doc.metadata.shares : 0,
    publishedAt: typeof doc.synced_at === 'string' ? doc.synced_at : new Date(0).toISOString(),
  }));
}

async function getProviderId(accountId: string): Promise<string> {
  const profile = await (unipileClient as any).users.getOwnProfile(accountId);
  const providerId = typeof profile?.provider_id === 'string' ? profile.provider_id.trim() : '';

  if (!providerId) {
    throw new Error('Unipile own profile did not return provider_id');
  }

  return providerId;
}

export async function getLatestLinkedInPosts(limit = 3): Promise<LinkedInPostStats[]> {
  try {
    const accountId = getAccountId();
    const providerId = await getProviderId(accountId);

    const response = await (unipileClient as any).users.getAllPosts({
      account_id: accountId,
      identifier: providerId,
      limit: Math.max(1, Math.min(limit, 10)),
    });

    const posts = (response?.items ?? []) as UnipilePost[];
    return posts.slice(0, limit).map((post) => ({
      id: post.social_id ?? post.id ?? '',
      text: truncate(sanitizeText(post.text ?? '')),
      likes: parseCounter(post.reaction_counter),
      comments: parseCounter(post.comment_counter),
      shares: parseCounter(post.repost_counter),
      publishedAt: normalizeDate(post),
    }));
  } catch (error) {
    console.warn('Unipile failed, falling back to BML data:', error);
    return getLinkedInPostsFromBML(limit);
  }
}

export async function getAllLinkedInPosts(): Promise<LinkedInPostStats[]> {
  try {
    const accountId = getAccountId();
    const providerId = await getProviderId(accountId);
    const allPosts: UnipilePost[] = [];
    let cursor: string | undefined;

    while (true) {
      const response = await (unipileClient as any).users.getAllPosts({
        account_id: accountId,
        identifier: providerId,
        limit: 50,
        ...(cursor ? { cursor } : {}),
      });

      const items = (response?.items ?? []) as UnipilePost[];
      if (items.length === 0) {
        break;
      }

      allPosts.push(...items);
      const nextCursor = typeof response?.cursor === 'string' ? response.cursor : '';
      if (!nextCursor || nextCursor === cursor) {
        break;
      }
      cursor = nextCursor;
    }

    return allPosts.map((post) => ({
      id: post.social_id ?? post.id ?? '',
      text: truncate(sanitizeText(post.text ?? ''), 220),
      likes: parseCounter(post.reaction_counter),
      comments: parseCounter(post.comment_counter),
      shares: parseCounter(post.repost_counter),
      publishedAt: normalizeDate(post),
    }));
  } catch (error) {
    console.warn('Unipile failed, falling back to BML data:', error);
    return getLinkedInPostsFromBML();
  }
}
