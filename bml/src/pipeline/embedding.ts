import crypto from 'crypto';
import { chunkText } from '../lib/chunker';
import { generateEmbedding } from '../lib/openai';
import { supabase } from '../lib/supabase';

function buildContentHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export async function chunkAndEmbed(entityType: string, entityId: string, text: string): Promise<void> {
  const contentHash = buildContentHash(text);

  const { data: sameHashChunk, error: sameHashError } = await (supabase as any)
    .from('memory_chunks')
    .select('id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('content_hash', contentHash)
    .limit(1)
    .single();

  if (sameHashError && sameHashError.code !== 'PGRST116') {
    throw new Error(sameHashError.message);
  }

  if (sameHashChunk?.id) {
    return;
  }

  const { error: deleteError } = await (supabase as any)
    .from('memory_chunks')
    .delete()
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const chunks = chunkText(text);

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const embedding = await generateEmbedding(chunk);

    const { error: insertError } = await (supabase as any).from('memory_chunks').insert({
      entity_type: entityType,
      entity_id: entityId,
      chunk_text: chunk,
      chunk_index: index,
      token_count: Math.ceil(chunk.length / 4),
      embedding,
      content_hash: contentHash,
    });

    if (insertError) {
      throw new Error(insertError.message);
    }
  }
}
