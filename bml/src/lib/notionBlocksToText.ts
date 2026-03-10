import { Client } from '@notionhq/client';

type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
};

function richTextToPlain(block: Record<string, unknown>, key: string): string {
  const typed = block[key] as { rich_text?: Array<{ plain_text?: string }> } | undefined;
  const parts = typed?.rich_text ?? [];
  return parts.map((item) => item.plain_text ?? '').join('').trim();
}

function blockToLine(block: NotionBlock): string {
  const typed = block as Record<string, unknown>;

  switch (block.type) {
    case 'paragraph':
      return richTextToPlain(typed, 'paragraph');
    case 'heading_1':
      return richTextToPlain(typed, 'heading_1');
    case 'heading_2':
      return richTextToPlain(typed, 'heading_2');
    case 'heading_3':
      return richTextToPlain(typed, 'heading_3');
    case 'bulleted_list_item':
      return `- ${richTextToPlain(typed, 'bulleted_list_item')}`;
    case 'numbered_list_item':
      return `1. ${richTextToPlain(typed, 'numbered_list_item')}`;
    case 'to_do': {
      const toDo = typed.to_do as { checked?: boolean } | undefined;
      const prefix = toDo?.checked ? '[x]' : '[ ]';
      return `${prefix} ${richTextToPlain(typed, 'to_do')}`;
    }
    case 'toggle':
      return richTextToPlain(typed, 'toggle');
    case 'code':
      return richTextToPlain(typed, 'code');
    case 'quote':
      return `> ${richTextToPlain(typed, 'quote')}`;
    case 'callout':
      return richTextToPlain(typed, 'callout');
    default:
      return '';
  }
}

export async function notionBlocksToText(notion: Client, blocks: NotionBlock[]): Promise<string> {
  const lines: string[] = [];

  for (const block of blocks) {
    const line = blockToLine(block);
    if (line) {
      lines.push(line);
    }

    if (block.has_children) {
      const childrenResponse = await notion.blocks.children.list({ block_id: block.id, page_size: 100 });
      const childrenText = await notionBlocksToText(notion, childrenResponse.results as unknown as NotionBlock[]);
      if (childrenText) {
        lines.push(childrenText);
      }
    }
  }

  return lines.join('\n').trim();
}
