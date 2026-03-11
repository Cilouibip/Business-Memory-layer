const { google } = require('googleapis');
const http = require('http');
const { exec } = require('child_process');
const url = require('url');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'select_account consent',
});

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname === '/' && parsed.query.code) {
    const code = parsed.query.code;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Autorisation réussie !</h1><p>Vous pouvez fermer cet onglet et retourner au terminal.</p>');

    try {
      const { tokens } = await oauth2Client.getToken(code);
      console.log('\n=== TOKENS ===');
      console.log('Access Token:', tokens.access_token);
      console.log('\nRefresh Token:', tokens.refresh_token);
      console.log('\nExpiry:', new Date(tokens.expiry_date).toISOString());
      console.log('===============\n');
    } catch (err) {
      console.error("Erreur lors de l'échange du code :", err.message);
    }

    server.close();
    process.exit(0);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(3000, () => {
  console.log('Serveur en écoute sur http://localhost:3000');
  console.log('Ouverture du navigateur...\n');
  console.log('URL OAuth:', authUrl);

  if (process.platform === 'darwin') {
    exec(`open -na "Google Chrome" --args "${authUrl}"`);
    return;
  }

  const openCmd = process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${openCmd} "${authUrl}"`);
});
