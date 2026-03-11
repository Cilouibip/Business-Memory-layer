import { google } from 'googleapis';
import { createGoogleOAuth2Client } from './googleAuth';

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

  return results.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

export async function getYouTubeViewsLast30Days(): Promise<number> {
  const analyticsClient = buildYouTubeAnalyticsClient();
  const { startDate, endDate } = getDateRangeLast30Days();

  const report = await analyticsClient.reports.query({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'views',
  });

  const firstRow = report.data.rows?.[0];
  if (!firstRow || firstRow.length === 0) {
    return 0;
  }

  const views = Number(firstRow[0]);
  return Number.isNaN(views) ? 0 : views;
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
  const [channel, latestVideos, viewsLast30Days, weeklyViews, subscribersGainedLast7Days] = await Promise.all([
    getYouTubeChannelStats(),
    getYouTubeLatestVideos(3),
    getYouTubeViewsLast30Days(),
    getYouTubeWeeklyViews(),
    getYouTubeSubscribersGainedLast7Days(),
  ]);

  return {
    channel,
    latestVideos,
    viewsLast30Days,
    weeklyViews,
    subscribersGainedLast7Days,
  };
}
