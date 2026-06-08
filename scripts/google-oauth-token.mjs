import { google } from 'googleapis';
import http from 'node:http';

const clientId = requireEnv('GOOGLE_OAUTH_CLIENT_ID');
const clientSecret = requireEnv('GOOGLE_OAUTH_CLIENT_SECRET');
const port = Number(process.env.GOOGLE_OAUTH_PORT ?? '53682');
const redirectUri = `http://localhost:${port}/oauth2callback`;
const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const scopes = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
];

const url = auth.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: scopes,
});

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, redirectUri);

  if (requestUrl.pathname !== '/oauth2callback') {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  const code = requestUrl.searchParams.get('code');

  if (!code) {
    response.writeHead(400);
    response.end('Missing OAuth code.');
    return;
  }

  try {
    const { tokens } = await auth.getToken(code);

    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Google OAuth token received. You can close this tab.');

    console.log('\nAdd this as the GitHub secret GOOGLE_OAUTH_REFRESH_TOKEN:\n');
    console.log(tokens.refresh_token);
    console.log('\nKeep GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET as GitHub secrets too.\n');
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('OAuth token exchange failed. Check the terminal output.');
    console.error(error);
  } finally {
    server.close();
  }
});

server.listen(port, () => {
  console.log(`OAuth callback listening on ${redirectUri}`);
  console.log('\nOpen this URL in your browser:\n');
  console.log(url);
});

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
