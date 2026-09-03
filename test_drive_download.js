// ============================================================
// Drive Download Test
// ============================================================

const path = require('path');
// Robust dotenv path configuration
require('dotenv').config({ path: path.join(__dirname, '.env') });

const {
  listRawVideos,
  downloadVideo,
  deleteTempFile,
} = require('./src/drive/driveService');

async function main() {
  try {
    console.log('\n==========================================');
    console.log(' DRIVE DOWNLOAD TEST');
    console.log('==========================================\n');

    const videos =
      await listRawVideos();

    if (videos.length === 0) {
      console.log(
        '⚠️ RAW folder mein abhi koi video nahi hai.'
      );

      console.log(
        '\n✅ Drive scanner working correctly.'
      );

      return;
    }

    const video =
      videos[0];

    console.log(
      '\n🎬 Testing first video:'
    );

    console.log(
      'Name:',
      video.name
    );

    console.log(
      'ID:',
      video.id
    );

    console.log(
      'MIME:',
      video.mimeType
    );

    const downloaded =
      await downloadVideo(
        video
      );

    console.log(
      '\n✅ DOWNLOAD TEST PASSED'
    );

    console.log(
      '\nDownloaded file:'
    );

    console.log(
      downloaded.filePath
    );

    console.log(
      '\nSize:',
      downloaded.size,
      'bytes'
    );

    // --------------------------------------------------------
    // Test cleanup
    // --------------------------------------------------------

    await deleteTempFile(
      downloaded.filePath
    );

    console.log(
      '\n✅ Temporary file cleanup passed.'
    );

  } catch (error) {
    console.error(
      '\n❌ DRIVE DOWNLOAD TEST FAILED'
    );

    console.error(
      error.message ||
      error
    );

    process.exit(1);
  }
}

main();