import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchMemory, getBusinessSummary, buildContext, getEntity } from '../lib/memoryQueries';

const server = new McpServer({
  name: 'bml-memory',
  version: '1.0.0',
});

// Outil 1 : Recherche dans la mémoire business
server.tool(
  'search_memory',
  'Recherche sémantique dans la mémoire business (vidéos YouTube, posts LinkedIn, pages Notion, faits business)',
  {
    query: z.string().describe('Ce que tu cherches dans la mémoire business'),
    domain: z.string().optional().describe('Filtrer par domaine : contenu, offre, client, strategie, metrique, process'),
    limit: z.number().optional().describe('Nombre max de résultats (défaut 10)'),
  },
  async ({ query, domain, limit }) => {
    const results = await searchMemory(query, domain ? { domain } : undefined, limit);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  }
);

// Outil 2 : Résumé business
server.tool(
  'get_business_summary',
  'Retourne les faits business actifs groupés par domaine (contenu, offre, client, stratégie, métrique, process)',
  {
    domain: z.string().optional().describe('Filtrer par domaine spécifique'),
  },
  async ({ domain }) => {
    const summary = await getBusinessSummary(domain);
    return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
  }
);

// Outil 3 : Construire un contexte pour une tâche
server.tool(
  'build_context',
  'Assemble le contexte business complet pour un objectif donné (ex: écrire un post LinkedIn, préparer un appel client)',
  {
    goal: z.string().describe("L'objectif pour lequel tu as besoin de contexte"),
    include_domains: z.array(z.string()).optional().describe('Domaines à inclure'),
    max_tokens: z.number().optional().describe('Limite de tokens pour le contexte (défaut 4000)'),
  },
  async ({ goal, include_domains, max_tokens }) => {
    const context = await buildContext(goal, { include_domains, max_tokens });
    return { content: [{ type: 'text', text: JSON.stringify(context, null, 2) }] };
  }
);

// Outil 4 : Détail d'une entité
server.tool(
  'get_entity',
  'Récupère le détail d une entité (content_item, offer, entity) avec ses faits et relations',
  {
    type: z.string().describe('Type : content_item, offer, entity'),
    id: z.string().describe('UUID de l entité'),
  },
  async ({ type, id }) => {
    const entity = await getEntity(type, id);
    return { content: [{ type: 'text', text: JSON.stringify(entity, null, 2) }] };
  }
);

// Démarrer le serveur
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('BML MCP Server running on stdio');
}

main().catch(console.error);