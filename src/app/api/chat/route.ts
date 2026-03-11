import { anthropic } from '@ai-sdk/anthropic';
import { streamText, type ModelMessage } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { searchMemory } from '../../../lib/memoryQueries';
import { crmTools } from '../../../lib/chatTools';
import { supabase } from '../../../lib/supabase';

const SYSTEM_PROMPT = `## Identité
Tu es le copilote business de Mehdi Benchaffi. Tu agis comme un associé qui connaît le business — direct, pas corporate, anti-bullshit.

## Qui est Mehdi
- Entrepreneur français, 37 ans, basé entre France et Maroc
- Ex-COO L'Oréal, Getir (scalé à 2000 employés en 9 mois), Mindeo Private Equity
- Actuellement freelance RevOps + construit "Machine à Revenus"
- Chaîne YouTube "Mehdi Benchaffi" (666 abonnés, contenu B2B)
- Présence LinkedIn active
- Introverti — déteste prospecter et vendre. Préfère construire des systèmes.

## L'offre principale
- "Machine à Revenus" : offre productisée à 3000€ pour solopreneurs et petites équipes (2-15 personnes)
- Cible : les "experts de l'ombre" — gens très compétents mais introvertis qui détestent prospecter
- 6 bricks couvrant le cycle commercial complet (acquisition → conversion → rétention)
- HubSpot comme CRM standard dans l'offre core

## Comment tu fonctionnes
1. MÉMOIRE : À chaque message, tu queries la mémoire business (BML) pour enrichir ta réponse avec du contexte réel (contenus YouTube, posts LinkedIn, notes Notion, faits business extraits)
2. CRM : Quand Mehdi te parle d'un contact, d'un deal, d'un appel ou d'une interaction client, tu utilises les outils CRM pour enregistrer automatiquement. Tu confirmes ce que tu as fait.
3. CONTENU : Tu peux aider à écrire des posts LinkedIn, préparer des scripts vidéo, des briefs — toujours en t'appuyant sur la mémoire pour rester cohérent avec le style et les thèmes de Mehdi.

## Règles
- Ne dis JAMAIS "en tant qu'IA" ou "je n'ai pas d'opinions"
- Sois direct et concis — Mehdi préfère les réponses qui vont droit au but
- Quand tu crées un contact/deal, confirme avec un résumé (ex: "OK j'ai créé le contact Sophie Martin chez Digitale + un deal Machine à Revenus à 3000€, prochaine action : rappeler jeudi")
- Si tu n'as pas assez de contexte, dis-le au lieu d'inventer
- Utilise la mémoire BML avant de répondre aux questions business — ne réponds pas "de tête"`;

const ChatBodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.any(),
    }),
  ).min(1),
  conversation_id: z.string().uuid().optional(),
  workspace_id: z.string().min(1).max(100).optional(),
});

function extractUserText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (part && typeof part === 'object' && 'text' in part && typeof (part as { text: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }

        return '';
      })
      .join(' ')
      .trim();
  }

  return '';
}

function getLatestUserQuery(messages: Array<{ role: string; content: unknown }>): string {
  const reversed = [...messages].reverse();
  const latestUser = reversed.find((message) => message.role === 'user');
  if (!latestUser) return '';
  return extractUserText(latestUser.content);
}

function toCoreMessages(messages: Array<{ role: string; content: unknown }>): ModelMessage[] {
  return messages
    .map((message) => {
      const role: 'assistant' | 'user' = message.role === 'assistant' ? 'assistant' : 'user';
      const content = extractUserText(message.content);
      return { role, content };
    })
    .filter((message) => message.content.length > 0);
}

function toMessageRole(role: string): 'user' | 'assistant' {
  return role === 'assistant' ? 'assistant' : 'user';
}

function buildConversationTitle(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return 'Nouvelle conversation';
  return trimmed.slice(0, 80);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const conversationId = url.searchParams.get('conversation_id');
  const workspaceId = url.searchParams.get('workspace_id') ?? 'personal';

  if (conversationId) {
    const { data, error } = await (supabase as any)
      .from('chat_messages')
      .select('id, role, content, tool_calls, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ conversation_id: conversationId, messages: data ?? [] });
  }

  const { data, error } = await (supabase as any)
    .from('chat_conversations')
    .select('id, title, workspace_id, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversations: data ?? [] });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ChatBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const latestQuery = getLatestUserQuery(parsed.data.messages);
  const workspaceId = parsed.data.workspace_id ?? 'personal';
  let memoryContext = 'Aucun contexte mémoire trouvé.';

  if (latestQuery.trim()) {
    try {
      const memory = await searchMemory(latestQuery, undefined, 5);
      memoryContext = memory.length > 0 ? JSON.stringify(memory) : memoryContext;
    } catch (error) {
      console.error('[chat] memory search failed', error);
    }
  }

  const modelMessages = toCoreMessages(parsed.data.messages);
  const reversed = [...parsed.data.messages].reverse();
  const latestUserMessage = reversed.find((message) => toMessageRole(message.role) === 'user');
  const latestUserText = latestUserMessage ? extractUserText(latestUserMessage.content) : '';
  let conversationId = parsed.data.conversation_id;

  if (!conversationId) {
    const { data: createdConversation, error: createConversationError } = await (supabase as any)
      .from('chat_conversations')
      .insert({
        title: buildConversationTitle(latestQuery),
        workspace_id: workspaceId,
      })
      .select('id')
      .single();

    if (createConversationError || !createdConversation?.id) {
      return NextResponse.json({ error: createConversationError?.message ?? 'Impossible de créer la conversation' }, { status: 500 });
    }

    conversationId = createdConversation.id;
  }
  if (!conversationId) {
    return NextResponse.json({ error: 'Conversation invalide' }, { status: 500 });
  }
  const resolvedConversationId: string = conversationId;

  if (latestUserText.trim()) {
    const { error: userMessageError } = await (supabase as any)
      .from('chat_messages')
      .insert({
        conversation_id: resolvedConversationId,
        role: 'user',
        content: latestUserText,
      });

    if (userMessageError) {
      return NextResponse.json({ error: userMessageError.message }, { status: 500 });
    }
  }

  await (supabase as any).from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', resolvedConversationId);

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    system: `${SYSTEM_PROMPT}\n\nContexte mémoire BML (résultats searchMemory):\n${memoryContext}`,
    messages: modelMessages,
    tools: crmTools,
    maxRetries: 2,
    timeout: 60000,
    onFinish: async ({ text, toolCalls }) => {
      const assistantText = (text ?? '').trim();
      const { error: assistantMessageError } = await (supabase as any)
        .from('chat_messages')
        .insert({
          conversation_id: resolvedConversationId,
          role: 'assistant',
          content: assistantText,
          tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : null,
        });

      if (assistantMessageError) {
        console.error('[chat] assistant persistence failed', assistantMessageError);
        return;
      }

      const { error: conversationUpdateError } = await (supabase as any)
        .from('chat_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', resolvedConversationId);

      if (conversationUpdateError) {
        console.error('[chat] conversation update failed', conversationUpdateError);
      }
    },
    onError: ({ error }) => {
      console.error('[chat] stream error', error);
    },
  });

  return result.toUIMessageStreamResponse({
    headers: {
      'x-conversation-id': resolvedConversationId,
    },
  });
}
