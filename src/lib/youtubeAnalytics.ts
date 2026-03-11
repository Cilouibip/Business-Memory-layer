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
    publishedAt: video.snippet?.publishedAt ?? new Date(0).toISOString(),
  }));
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

export async function getYouTubeBusinessSnapshot() {
  const [channel, latestVideos, viewsLast30Days] = await Promise.all([
    getYouTubeChannelStats(),
    getYouTubeLatestVideos(3),
    getYouTubeViewsLast30Days(),
  ]);

  return {
    channel,
    latestVideos,
    viewsLast30Days,
  };
}
