const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });

function createGoogleOAuth2Client() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing YouTube OAuth env vars');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return oauth2Client;
}

async function testYouTube() {
  console.log('--- TEST YOUTUBE API ---');
  try {
    const auth = createGoogleOAuth2Client();
    const yt = google.youtube({ version: 'v3', auth });
    const channelId = process.env.YOUTUBE_CHANNEL_ID;
    
    console.log('1. Checking Channel ID:', channelId);
    
    const channelRes = await yt.channels.list({
      part: ['snippet', 'statistics'],
      id: [channelId]
    });
    
    const stats = channelRes.data.items?.[0]?.statistics;
    console.log('2. Channel Stats:', stats);
    
    console.log('--- TEST YOUTUBE ANALYTICS ---');
    const analytics = google.youtubeAnalytics({ version: 'v2', auth });
    
    const end = new Date();
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = end.toISOString().slice(0, 10);
    const startDate = start.toISOString().slice(0, 10);
    
    console.log(`3. Querying Analytics (${startDate} to ${endDate})`);
    
    const report = await analytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views',
    });
    
    console.log('4. Analytics rows:', report.data.rows);
    
  } catch (error) {
    console.error('ERROR:', error.message);
    if (error.response) {
      console.error('API Error Details:', error.response.data);
    }
  }
}

testYouTube();
