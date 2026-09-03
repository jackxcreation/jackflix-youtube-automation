// ============================================================
// Test Script: Cloud Auth & Multi-API Integration Test
// ============================================================

const path = require('path');
// Robust dotenv path configuration
require('dotenv').config({ path: path.join(__dirname, '.env') });

const {
  getGoogleClients,
} = require('./src/auth/googleAuth');

async function main() {
  try {
    console.log('\n================================');
    console.log(' CLOUD AUTH TEST');
    console.log('================================\n');

    const {
      drive,
      youtube,
      sheets,
    } = getGoogleClients();

    console.log('✅ Google clients created.');

    // Drive test
    const driveResult =
      await drive.files.list({
        pageSize: 1,
        fields: 'files(id,name,mimeType)',
      });

    console.log(
      '✅ Drive authentication working.'
    );

    console.log(
      'Drive files:',
      driveResult.data.files?.length || 0
    );

    // YouTube test
    const youtubeResult =
      await youtube.channels.list({
        part: ['snippet'],
        mine: true,
      });

    const channel =
      youtubeResult.data.items?.[0];

    if (!channel) {
      throw new Error(
        'No YouTube channel found.'
      );
    }

    console.log(
      '✅ YouTube authentication working.'
    );

    console.log(
      'Channel:',
      channel.snippet.title
    );

    // Sheets client creation test
    if (!sheets) {
      throw new Error(
        'Google Sheets client creation failed.'
      );
    }

    console.log(
      '✅ Sheets client created.'
    );

    console.log(
      '\n================================'
    );
    console.log(
      ' CLOUD AUTH TEST PASSED ✅'
    );
    console.log(
      '================================\n'
    );

  } catch (error) {
    console.error(
      '\n❌ CLOUD AUTH TEST FAILED\n'
    );

    console.error(
      error.response?.data ||
      error.message ||
      error
    );

    process.exit(1);
  }
}

main();