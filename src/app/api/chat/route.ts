import { anthropic } from '@ai-sdk/anthropic';
import { convertToModelMessages, streamText } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { searchMemory } from '../../../lib/memoryQueries';
import { crmTools } from '../../../lib/chatTools';

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
  let memoryContext = 'Aucun contexte mémoire trouvé.';

  if (latestQuery.trim()) {
    try {
      const memory = await searchMemory(latestQuery, undefined, 5);
      memoryContext = memory.length > 0 ? JSON.stringify(memory) : memoryContext;
    } catch (error) {
      console.error('[chat] memory search failed', error);
    }
  }

  const modelMessages = await convertToModelMessages(parsed.data.messages as any, {
    tools: crmTools,
  });

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    system: `${SYSTEM_PROMPT}\n\nContexte mémoire BML (résultats searchMemory):\n${memoryContext}`,
    messages: modelMessages,
    tools: crmTools,
    maxRetries: 2,
    timeout: 60000,
    onError: ({ error }) => {
      console.error('[chat] stream error', error);
    },
  });

  return result.toUIMessageStreamResponse();
}
