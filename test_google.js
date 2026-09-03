// ============================================================
// Test Script: Google APIs Integration (Drive & YouTube)
// ============================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { getGoogleClients } = require('./src/auth/googleAuth');

// ============================================================
// INITIALIZE GOOGLE CLIENTS VIA CENTRAL AUTH MODULE
// ============================================================

const { drive, youtube } = getGoogleClients();

async function testGoogleAPIs() {
  try {
    console.log('\n==============================');
    console.log(' GOOGLE API TEST');
    console.log('==============================\n');

    // -------------------------
    // TEST DRIVE
    // -------------------------

    const driveResponse = await drive.files.list({
      pageSize: 10,
      fields: 'files(id,name,mimeType)'
    });

    console.log('✅ Google Drive API: WORKING');

    console.log('\nDrive files:');

    if (driveResponse.data.files.length === 0) {
      console.log('   No files found.');
    } else {
      driveResponse.data.files.forEach((file) => {
        console.log(
          `   ${file.name} | ${file.mimeType}`
        );
      });
    }

    // -------------------------
    // TEST YOUTUBE
    // -------------------------

    const youtubeResponse = await youtube.channels.list({
      part: ['snippet', 'contentDetails'],
      mine: true
    });

    console.log('\n✅ YouTube Data API: WORKING');

    const channels = youtubeResponse.data.items || [];

    if (channels.length === 0) {
      console.log('⚠️ No YouTube channel found for this account.');
    } else {
      channels.forEach((channel) => {
        console.log(
          `   Channel: ${channel.snippet.title}`
        );

        console.log(
          `   Channel ID: ${channel.id}`
        );
      });
    }

    console.log('\n==============================');
    console.log(' ALL TESTS PASSED ✅');
    console.log('==============================\n');

  } catch (error) {
    console.error('\n❌ GOOGLE API TEST FAILED\n');

    console.error(
      error.response?.data || error.message || error
    );
  }
}

testGoogleAPIs();