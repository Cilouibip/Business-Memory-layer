import http from 'http';
import { exec } from 'child_process';

const CLIENT_ID = process.env.GDRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GDRIVE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3456/callback';
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GDRIVE_CLIENT_ID or GDRIVE_CLIENT_SECRET in .env.local');
  process.exit(1);
}

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPE)}&access_type=offline&prompt=consent`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, 'http://localhost:3456');

  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');

    if (!code) {
      res.writeHead(400);
      res.end('No code received');
      return;
    }

    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json() as Record<string, unknown>;

      if (tokens.refresh_token) {
        console.log('\n✅ SUCCESS! Add these to your .env.local:\n');
        console.log(`GDRIVE_CLIENT_ID=${CLIENT_ID}`);
        console.log(`GDRIVE_CLIENT_SECRET=${CLIENT_SECRET}`);
        console.log(`GDRIVE_REFRESH_TOKEN=${String(tokens.refresh_token)}`);
        console.log('\n');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>✅ Token obtenu !</h1><p>Tu peux fermer cet onglet et retourner dans le terminal.</p>');
      } else {
        console.error('❌ No refresh_token in response:', JSON.stringify(tokens, null, 2));
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>❌ Erreur</h1><pre>' + JSON.stringify(tokens, null, 2) + '</pre>');
      }
    } catch (error) {
      console.error('❌ Error exchanging code:', error);
      res.writeHead(500);
      res.end('Error exchanging code');
    }

    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 1000);
  }
});

server.listen(3456, () => {
  console.log('🔐 Opening browser for Google Drive authorization...');
  console.log(`\nIf browser does not open, go to:\n${authUrl}\n`);
  exec(`open "${authUrl}"`, (error) => {
    if (error) {
      console.log('Could not open browser automatically. Copy the URL above.');
    }
  });
});
