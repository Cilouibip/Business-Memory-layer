import { drive_v3, google } from 'googleapis';
import { createGoogleDriveOAuth2Client } from '../lib/googleDriveAuth';
import { supabase } from '../lib/supabase';

type ConnectorResult = {
  success: boolean;
  syncRunId: string | null;
  items_processed: number;
  items_skipped: number;
  items_failed: number;
  error?: string;
};

type DriveFile = {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  modifiedTime?: string | null;
  createdTime?: string | null;
  webViewLink?: string | null;
  size?: string | null;
};
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
function escapeQueryValue(value: string): string {
  return value.replace(/'/g, "\\'");
}
function buildFolderQuery(parentFolderId: string): string {
  return `'${escapeQueryValue(parentFolderId)}' in parents and trashed = false and mimeType = '${DRIVE_FOLDER_MIME}'`;
}
function buildFileQuery(parentFolderId: string, lastCursor: string | null): string {
  const base = `'${escapeQueryValue(parentFolderId)}' in parents and trashed = false and mimeType != '${DRIVE_FOLDER_MIME}'`;
  if (!lastCursor) return base;
  return `${base} and modifiedTime > '${lastCursor}'`;
}
async function getOrCreateSourceConnectionId(): Promise<string> {
  const { data: existing, error: existingError } = await (supabase as any)
    .from('source_connections')
    .select('id')
    .eq('source_type', 'gdrive')
    .limit(1)
    .single();
  if (existingError && existingError.code !== 'PGRST116') throw new Error(existingError.message);
  if (existing?.id) return existing.id;

  const { data: created, error: createError } = await (supabase as any)
    .from('source_connections')
    .insert({ source_type: 'gdrive', credentials_ref: 'env', is_active: true })
    .select('id')
    .single();
  if (createError || !created?.id) throw new Error(createError?.message ?? 'Failed to create source connection for gdrive');
  return created.id;
}
async function getLastCursor(sourceConnectionId: string): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from('sync_runs')
    .select('cursor')
    .eq('source_connection_id', sourceConnectionId)
    .neq('status', 'running')
    .not('cursor', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data?.cursor ?? null;
}
async function createSyncRun(sourceConnectionId: string): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await (supabase as any)
    .from('sync_runs')
    .insert({ source_connection_id: sourceConnectionId, source: 'gdrive', status: 'running', started_at: now, start_time: now })
    .select('id')
    .single();
  if (error || !data?.id) throw new Error(error?.message ?? 'Failed to create sync run');
  return data.id;
}
async function finalizeSyncRun(params: {
  syncRunId: string;
  status: 'ingested' | 'failed';
  cursor: string | null;
  itemsProcessed: number;
  itemsSkipped: number;
  itemsFailed: number;
  startedAt: number;
  errorLog: Array<Record<string, unknown>>;
}): Promise<void> {
  const finishedAt = new Date().toISOString();
  const { error } = await (supabase as any)
    .from('sync_runs')
    .update({
      source: 'gdrive',
      status: params.status,
      cursor: params.cursor,
      finished_at: finishedAt,
      end_time: finishedAt,
      items_processed: params.itemsProcessed,
      items_skipped: params.itemsSkipped,
      items_failed: params.itemsFailed,
      duration_ms: Date.now() - params.startedAt,
      error_log: params.errorLog,
    })
    .eq('id', params.syncRunId);
  if (error) throw new Error(error.message);
}
function shouldExtractText(mimeType: string): boolean {
  if (mimeType.startsWith('text/')) return true;
  return (
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/javascript' ||
    mimeType === 'application/x-javascript' ||
    mimeType === 'application/typescript' ||
    mimeType === 'application/csv' ||
    mimeType === 'text/csv' ||
    mimeType === 'application/rtf'
  );
}
function normalizeTextPayload(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf-8');
  return null;
}
async function fetchDriveFileText(drive: drive_v3.Drive, file: DriveFile): Promise<string | null> {
  const fileId = file.id;
  const mimeType = file.mimeType ?? '';
  if (!fileId || !mimeType) return null;
  try {
    if (mimeType === 'application/vnd.google-apps.document') {
      const response = await drive.files.export({ fileId, mimeType: 'text/plain' }, { responseType: 'arraybuffer' });
      if (response.data instanceof ArrayBuffer) return Buffer.from(response.data).toString('utf-8');
      return normalizeTextPayload(response.data);
    }
    if (!shouldExtractText(mimeType)) return null;
    const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    if (response.data instanceof ArrayBuffer) return Buffer.from(response.data).toString('utf-8');
    return normalizeTextPayload(response.data);
  } catch {
    return null;
  }
}
async function listSubfoldersRecursively(drive: drive_v3.Drive, rootFolderId: string): Promise<string[]> {
  const visited = new Set<string>([rootFolderId]);
  const queue: string[] = [rootFolderId];
  while (queue.length > 0) {
    const currentFolderId = queue.shift();
    if (!currentFolderId) continue;
    let pageToken: string | undefined;
    do {
      const response = await drive.files.list({
        q: buildFolderQuery(currentFolderId),
        fields: 'nextPageToken, files(id)',
        orderBy: 'modifiedTime desc',
        pageSize: 100,
        pageToken,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });
      const folders = (response.data.files as Array<{ id?: string | null }> | undefined) ?? [];
      for (const folder of folders) {
        if (!folder.id || visited.has(folder.id)) continue;
        visited.add(folder.id);
        queue.push(folder.id);
      }
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);
  }
  return Array.from(visited);
}
async function listFilesForFolder(drive: drive_v3.Drive, folderId: string, cursor: string | null): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  const query = buildFileQuery(folderId, cursor);
  console.log('[gdrive-sync] API query:', query);
  console.log('[gdrive-sync] Cursor:', cursor || 'none');
  do {
    const response = await drive.files.list({
      q: query,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, createdTime, webViewLink, size)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
      pageToken,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    files.push(...(((response.data.files as DriveFile[] | undefined) ?? []).filter((file) => file.id)));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);
  return files;
}
export async function syncGDrive(): Promise<ConnectorResult> {
  const startedAt = Date.now();
  let syncRunId: string | null = null;
  let itemsProcessed = 0;
  let itemsSkipped = 0;
  let itemsFailed = 0;
  let nextCursor: string | null = null;
  const errorLog: Array<Record<string, unknown>> = [];
  let status: 'ingested' | 'failed' = 'failed';
  let fatalErrorMessage: string | null = null;
  try {
    console.log('[gdrive-sync] FOLDER_ID:', process.env.GDRIVE_FOLDER_ID || 'NONE');
    const folderId = process.env.GDRIVE_FOLDER_ID;
    if (!folderId) throw new Error('Missing env var: GDRIVE_FOLDER_ID');
    const oauthClient = createGoogleDriveOAuth2Client();
    const drive = google.drive({ version: 'v3', auth: oauthClient });
    const sourceConnectionId = await getOrCreateSourceConnectionId();
    syncRunId = await createSyncRun(sourceConnectionId);
    const lastCursor = await getLastCursor(sourceConnectionId);
    const folderIds = await listSubfoldersRecursively(drive, folderId);
    const filesById = new Map<string, DriveFile>();
    for (const scopedFolderId of folderIds) {
      const files = await listFilesForFolder(drive, scopedFolderId, lastCursor);
      for (const file of files) {
        if (!file.id || filesById.has(file.id)) continue;
        filesById.set(file.id, file);
      }
    }
    for (const file of filesById.values()) {
      const fileId = file.id;
      const modifiedTime = file.modifiedTime;
      const mimeType = file.mimeType ?? '';
      if (!fileId || !modifiedTime) {
        itemsSkipped += 1;
        continue;
      }
      try {
        const content = await fetchDriveFileText(drive, file);
        const rawPayload = {
          fileId,
          name: file.name ?? 'Untitled',
          mimeType,
          modifiedTime,
          createdTime: file.createdTime ?? null,
          webViewLink: file.webViewLink ?? null,
          size: file.size ? Number(file.size) : null,
          content,
        };
        const { error: upsertError } = await (supabase as any)
          .from('raw_documents')
          .upsert(
            {
              source_type: 'gdrive',
              source_object_id: `gdrive:file:${fileId}`,
              sync_run_id: syncRunId,
              raw_payload: rawPayload,
              processing_status: 'ingested',
            },
            { onConflict: 'source_type,source_object_id' },
          );
        if (upsertError) throw new Error(upsertError.message);
        itemsProcessed += 1;
        if (!nextCursor || modifiedTime > nextCursor) nextCursor = modifiedTime;
      } catch (error) {
        itemsFailed += 1;
        errorLog.push({ fileId, message: (error as Error).message });
      }
    }
    status = itemsFailed > 0 && itemsProcessed === 0 ? 'failed' : 'ingested';
    console.log(
      JSON.stringify({
        source: 'gdrive',
        run_id: syncRunId,
        duration_ms: Date.now() - startedAt,
        items_processed: itemsProcessed,
        items_skipped: itemsSkipped,
        items_failed: itemsFailed,
      }),
    );
    return { success: status !== 'failed', syncRunId, items_processed: itemsProcessed, items_skipped: itemsSkipped, items_failed: itemsFailed };
  } catch (error) {
    status = 'failed';
    fatalErrorMessage = (error as Error).message;
    itemsFailed += 1;
    return {
      success: false,
      syncRunId,
      items_processed: itemsProcessed,
      items_skipped: itemsSkipped,
      items_failed: itemsFailed,
      error: fatalErrorMessage,
    };
  } finally {
    if (syncRunId) {
      const finalErrorLog = fatalErrorMessage === null ? errorLog : [...errorLog, { message: fatalErrorMessage }];
      try {
        await finalizeSyncRun({
          syncRunId,
          status,
          cursor: nextCursor,
          itemsProcessed,
          itemsSkipped,
          itemsFailed,
          startedAt,
          errorLog: finalErrorLog,
        });
      } catch (finalizeError) {
        console.error(`[gdrive-sync] Failed to finalize sync run ${syncRunId}:`, finalizeError);
      }
    }
  }
}
