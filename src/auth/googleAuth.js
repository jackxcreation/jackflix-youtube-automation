// ============================================================
// Google OAuth2 & API Clients Configuration
// ============================================================

const path = require('path');
// Safe dotenv path configuration for root directory
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { google } = require('googleapis');

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
} = process.env;

if (!GOOGLE_CLIENT_ID) {
  throw new Error('GOOGLE_CLIENT_ID is missing.');
}

if (!GOOGLE_CLIENT_SECRET) {
  throw new Error('GOOGLE_CLIENT_SECRET is missing.');
}

if (!GOOGLE_REFRESH_TOKEN) {
  throw new Error('GOOGLE_REFRESH_TOKEN is missing.');
}

const REDIRECT_URI =
  'http://localhost:3000/oauth2callback';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
];

function createGoogleAuth() {
  const auth = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );

  auth.setCredentials({
    refresh_token: GOOGLE_REFRESH_TOKEN,
  });

  return auth;
}

function getGoogleClients() {
  const auth = createGoogleAuth();

  return {
    auth,

    drive: google.drive({
      version: 'v3',
      auth,
    }),

    youtube: google.youtube({
      version: 'v3',
      auth,
    }),

    sheets: google.sheets({
      version: 'v4',
      auth,
    }),
  };
}

module.exports = {
  createGoogleAuth,
  getGoogleClients,
  SCOPES,
};