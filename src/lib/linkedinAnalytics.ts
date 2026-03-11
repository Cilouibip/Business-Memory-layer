import { unipileClient } from './unipile';

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

async function getProviderId(accountId: string): Promise<string> {
  const profile = await (unipileClient as any).users.getOwnProfile(accountId);
  const providerId = typeof profile?.provider_id === 'string' ? profile.provider_id.trim() : '';

  if (!providerId) {
    throw new Error('Unipile own profile did not return provider_id');
  }

  return providerId;
}

export async function getLatestLinkedInPosts(limit = 3): Promise<LinkedInPostStats[]> {
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
}
