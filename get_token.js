const { google } = require('googleapis');
const http = require('http');
const fs = require('fs');

const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

// credentials.json read karo
const keys = JSON.parse(
  fs.readFileSync('./credentials.json', 'utf8')
);

// IMPORTANT:
// Web application credentials ke andar "web" hota hai.
// Agar tumhare JSON mein "installed" hai, to neeche fallback rakha hai.
const config = keys.web || keys.installed;

if (!config) {
  throw new Error(
    'credentials.json mein "web" ya "installed" credentials nahi mile.'
  );
}

const oAuth2Client = new google.auth.OAuth2(
  config.client_id,
  config.client_secret,
  REDIRECT_URI
);

// 🔥 SCOPES FIXED: Google doesn't allow mixing broad (force-ssl) and narrow (upload/readonly) scopes.
// Yeh 3 "Master Scopes" tere saare kaam (Upload, Read, Comment, Drive, Sheets) akele kar denge.
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.force-ssl', 
  'https://www.googleapis.com/auth/drive',             
  'https://www.googleapis.com/auth/spreadsheets'       
];

function generateToken() {
  const authorizeUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  });

  console.log('\n==========================================');
  console.log(' GOOGLE OAUTH AUTHENTICATION');
  console.log('==========================================\n');

  console.log('Browser mein ye URL open karo:\n');
  console.log(authorizeUrl);

  console.log('\nWaiting for Google callback...');
  console.log(`Expected callback: ${REDIRECT_URI}\n`);

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, 'http://localhost:3000');

      // Sirf OAuth callback handle karo
      if (requestUrl.pathname !== '/oauth2callback') {
        res.writeHead(404, {
          'Content-Type': 'text/plain'
        });
        res.end('Not Found');
        return;
      }

      // Google ne error diya?
      const error = requestUrl.searchParams.get('error');

      if (error) {
        console.error('\n❌ Google OAuth Error:', error);

        res.writeHead(400, {
          'Content-Type': 'text/html'
        });

        res.end(`
          <h2>Authentication failed</h2>
          <p>Error: ${error}</p>
          <p>You can close this tab.</p>
        `);

        server.close();
        return;
      }

      const code = requestUrl.searchParams.get('code');

      if (!code) {
        console.error('\n❌ Authorization code nahi mila.');

        res.writeHead(400, {
          'Content-Type': 'text/html'
        });

        res.end(`
          <h2>Authentication failed</h2>
          <p>Authorization code missing.</p>
        `);

        server.close();
        return;
      }

      console.log('\n✅ Authorization code received!');
      console.log('🔄 Exchanging code for tokens...');

      const { tokens } = await oAuth2Client.getToken(code);

      if (!tokens.refresh_token) {
        throw new Error(
          'Refresh token nahi mila. Google account/app access ko revoke karke dobara authorize karo.'
        );
      }

      // Token save karo
      fs.writeFileSync(
        './token.json',
        JSON.stringify(tokens, null, 2),
        'utf8'
      );

      console.log('\n==========================================');
      console.log('✅ AUTHENTICATION SUCCESSFUL');
      console.log('==========================================');
      console.log('✅ token.json created');
      console.log('✅ Refresh token received');
      console.log('✅ YouTube + Drive + Sheets + Manager OAuth ready');
      console.log('==========================================\n');

      res.writeHead(200, {
        'Content-Type': 'text/html'
      });

      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Successful</title>
          </head>
          <body>
            <h2>✅ Authentication successful!</h2>
            <p>You can close this tab and return to VS Code.</p>
          </body>
        </html>
      `);

      // Server close
      setTimeout(() => {
        server.close(() => {
          console.log('OAuth server stopped.');
        });
      }, 500);

    } catch (err) {
      console.error('\n❌ TOKEN ERROR:\n');

      console.error(err.response?.data || err.message || err);

      res.writeHead(500, {
        'Content-Type': 'text/html'
      });

      res.end(`
        <h2>Authentication error</h2>
        <p>${err.message}</p>
        <p>Check the terminal for details.</p>
      `);

      server.close();
    }
  });

  server.listen(3000, 'localhost', () => {
    console.log('🚀 Local OAuth server running on:');
    console.log(`   ${REDIRECT_URI}\n`);
  });

  server.on('error', (err) => {
    console.error('\n❌ Server error:', err.message);

    if (err.code === 'EADDRINUSE') {
      console.error(
        'Port 3000 already use ho raha hai. Pehle old Node process stop karo.'
      );
    }
  });
}

generateToken();