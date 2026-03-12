import { google } from 'googleapis';
import { createGoogleOAuth2Client } from './googleAuth';
import { getCached, setCache } from './cache';

export type YouTubeChannelStats = {
  title: string;
  subscriberCount: number;
};

export type YouTubeVideoStats = {
  id: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  publishedAt: string;
};

function parseCount(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getDateRangeLast30Days(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

function getDateRangeLast7Days(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

function getDateRangePrevious7Days(): { startDate: string; endDate: string } {
  const end = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

function buildYouTubeClient() {
  const oauthClient = createGoogleOAuth2Client();
  return google.youtube({ version: 'v3', auth: oauthClient });
}

function buildYouTubeAnalyticsClient() {
  const oauthClient = createGoogleOAuth2Client();
  return google.youtubeAnalytics({ version: 'v2', auth: oauthClient });
}

function getChannelId(): string {
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  if (!channelId) {
    throw new Error('Missing env var: YOUTUBE_CHANNEL_ID');
  }
  return channelId;
}

export async function getYouTubeChannelStats(): Promise<YouTubeChannelStats> {
  const youtubeClient = buildYouTubeClient();
  const channelId = getChannelId();

  const response = await youtubeClient.channels.list({
    part: ['snippet', 'statistics'],
    id: [channelId],
    maxResults: 1,
  });

  const channel = response.data.items?.[0];
  if (!channel?.statistics) {
    throw new Error('Unable to load YouTube channel statistics');
  }

  return {
    title: channel.snippet?.title ?? 'Chaîne YouTube',
    subscriberCount: parseCount(channel.statistics.subscriberCount),
  };
}

export async function getYouTubeLatestVideos(limit = 3): Promise<YouTubeVideoStats[]> {
  const youtubeClient = buildYouTubeClient();
  const channelId = getChannelId();

  const searchResponse = await youtubeClient.search.list({
    part: ['id', 'snippet'],
    channelId,
    type: ['video'],
    order: 'date',
    maxResults: Math.max(1, Math.min(limit, 10)),
  });

  const videoIds = (searchResponse.data.items ?? [])
    .map((item) => item.id?.videoId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (videoIds.length === 0) {
    return [];
  }

  const videosResponse = await youtubeClient.videos.list({
    part: ['snippet', 'statistics'],
    id: videoIds,
    maxResults: videoIds.length,
  });

  return (videosResponse.data.items ?? []).map((video) => ({
    id: video.id ?? '',
    title: video.snippet?.title ?? 'Vidéo sans titre',
    views: parseCount(video.statistics?.viewCount),
    likes: parseCount(video.statistics?.likeCount),
    comments: parseCount(video.statistics?.commentCount),
    publishedAt: video.snippet?.publishedAt ?? new Date(0).toISOString(),
  }));
}

export async function getAllVideos(): Promise<YouTubeVideoStats[]> {
  const cached = getCached<YouTubeVideoStats[]>('youtube_all_videos');
  if (cached) return cached;

  const youtubeClient = buildYouTubeClient();
  const channelId = getChannelId();
  const videoIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const searchResponse = await youtubeClient.search.list({
      part: ['id'],
      channelId,
      type: ['video'],
      order: 'date',
      maxResults: 50,
      pageToken,
    });

    const ids = (searchResponse.data.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    videoIds.push(...ids);
    pageToken = searchResponse.data.nextPageToken ?? undefined;
  } while (pageToken);

  if (videoIds.length === 0) {
    return [];
  }

  const results: YouTubeVideoStats[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const videosResponse = await youtubeClient.videos.list({
      part: ['snippet', 'statistics'],
      id: chunk,
      maxResults: chunk.length,
    });

    const mapped = (videosResponse.data.items ?? []).map((video) => ({
      id: video.id ?? '',
      title: video.snippet?.title ?? 'Vidéo sans titre',
      views: parseCount(video.statistics?.viewCount),
      likes: parseCount(video.statistics?.likeCount),
      comments: parseCount(video.statistics?.commentCount),
      publishedAt: video.snippet?.publishedAt ?? new Date(0).toISOString(),
    }));
    results.push(...mapped);
  }

  const allVideos = results.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  setCache('youtube_all_videos', allVideos);
  return allVideos;
}

export async function getYouTubeDailyStats(days: number = 30): Promise<{ date: string; views: number; watchTimeMinutes: number; subscribersGained: number }[]> {
  const cacheKey = `youtube_daily_stats_${days}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return cached;

  const analyticsClient = buildYouTubeAnalyticsClient();
  
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
  
  const startDate = toIsoDate(start);
  const endDate = toIsoDate(end);

  try {
    const report = await analyticsClient.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views,estimatedMinutesWatched,subscribersGained',
      dimensions: 'day',
      sort: 'day',
    });

    const rows = report.data.rows ?? [];
    const stats = rows.map((row) => ({
      date: String(row[0]),
      views: Number(row[1]) || 0,
      watchTimeMinutes: Number(row[2]) || 0,
      subscribersGained: Number(row[3]) || 0,
    }));

    setCache(cacheKey, stats);
    return stats;
  } catch (error) {
    console.error('Erreur getYouTubeDailyStats:', error);
    return [];
  }
}

export async function getYouTubeTopVideos(days: number = 30, limit: number = 5) {
  const cacheKey = `youtube_top_videos_${days}_${limit}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return cached;

  const analyticsClient = buildYouTubeAnalyticsClient();
  const youtubeClient = buildYouTubeClient();
  
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

  try {
    const report = await analyticsClient.reports.query({
      ids: 'channel==MINE',
      startDate: toIsoDate(start),
      endDate: toIsoDate(end),
      metrics: 'views,estimatedMinutesWatched,likes',
      dimensions: 'video',
      sort: '-views',
      maxResults: limit,
    });

    const rows = report.data.rows ?? [];
    if (rows.length === 0) return [];

    const videoIds = rows.map((row) => String(row[0]));
    
    // Fetch titles
    const videosResponse = await youtubeClient.videos.list({
      part: ['snippet'],
      id: videoIds,
    });

    const titlesMap: Record<string, string> = {};
    for (const item of videosResponse.data.items ?? []) {
      if (item.id && item.snippet?.title) {
        titlesMap[item.id] = item.snippet.title;
      }
    }

    const topVideos = rows.map((row) => {
      const id = String(row[0]);
      return {
        id,
        title: titlesMap[id] || 'Vidéo inconnue',
        views: Number(row[1]) || 0,
        watchTimeMinutes: Number(row[2]) || 0,
        likes: Number(row[3]) || 0,
      };
    });

    setCache(cacheKey, topVideos);
    return topVideos;
  } catch (error) {
    console.error('Erreur getYouTubeTopVideos:', error);
    return [];
  }
}

async function getYouTubeMetricForRange(
  metric: 'views' | 'subscribersGained',
  range: { startDate: string; endDate: string },
): Promise<number> {
  const analyticsClient = buildYouTubeAnalyticsClient();
  const report = await analyticsClient.reports.query({
    ids: 'channel==MINE',
    startDate: range.startDate,
    endDate: range.endDate,
    metrics: metric,
  });

  const firstRow = report.data.rows?.[0];
  if (!firstRow || firstRow.length === 0) {
    return 0;
  }

  const value = Number(firstRow[0]);
  return Number.isNaN(value) ? 0 : value;
}

export async function getYouTubeWeeklyViews(): Promise<{ thisWeek: number; lastWeek: number; deltaPercent: number }> {
  const [thisWeek, lastWeek] = await Promise.all([
    getYouTubeMetricForRange('views', getDateRangeLast7Days()),
    getYouTubeMetricForRange('views', getDateRangePrevious7Days()),
  ]);

  const deltaPercent = lastWeek <= 0 ? (thisWeek > 0 ? 100 : 0) : ((thisWeek - lastWeek) / lastWeek) * 100;
  return { thisWeek, lastWeek, deltaPercent };
}

export async function getYouTubeSubscribersGainedLast7Days(): Promise<number> {
  return getYouTubeMetricForRange('subscribersGained', getDateRangeLast7Days());
}

export async function getYouTubeBusinessSnapshot() {
  const cached = getCached<any>('youtube_snapshot');
  if (cached) return cached;

  const [channel, latestVideos, dailyStats, weeklyViews, subscribersGainedLast7Days] = await Promise.all([
    getYouTubeChannelStats(),
    getYouTubeLatestVideos(3),
    getYouTubeDailyStats(30),
    getYouTubeWeeklyViews(),
    getYouTubeSubscribersGainedLast7Days(),
  ]);
  
  const viewsLast30Days = dailyStats.reduce((sum: number, stat: any) => sum + stat.views, 0);

  const result = {
    channel,
    latestVideos,
    dailyStats,
    viewsLast30Days,
    weeklyViews,
    subscribersGainedLast7Days,
  };
  setCache('youtube_snapshot', result);
  return result;
}
