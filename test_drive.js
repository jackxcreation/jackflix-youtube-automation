// ============================================================
// Test Script: Google Drive Raw Folder Scanner
// ============================================================

const {
  listRawVideos,
  RAW_FOLDER_ID
} = require('./src/drive/driveService');

async function testDrive() {
  console.log('\n==============================');
  console.log(' DRIVE RAW FOLDER TEST');
  console.log('==============================\n');

  console.log('RAW Folder ID:');
  console.log(RAW_FOLDER_ID);

  try {
    const videos = await listRawVideos();

    if (videos.length === 0) {
      console.log('\n⚠️ RAW folder mein abhi koi video nahi mila.');
      return;
    }

    console.log(`\n✅ ${videos.length} video(s) found:\n`);

    videos.forEach((video, index) => {
      console.log(`${index + 1}. ${video.name}`);
      console.log(`   ID: ${video.id}`);
      console.log(`   Type: ${video.mimeType}`);
      console.log(`   Size: ${video.size || 'Unknown'}`);
      console.log(`   Created: ${video.createdTime}`);
      console.log('');
    });

  } catch (error) {
    console.error('\n❌ Test failed.');
    console.error(error?.message || error);
  }
}

testDrive();