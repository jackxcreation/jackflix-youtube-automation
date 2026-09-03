// ============================================================
// End-to-End YouTube Automation Pipeline
// ============================================================
// Responsibilities:
// 1. Verify 'test-video.mp4' in root folder.
// 2. Generate SEO Title, Description & Tags using Gemini AI.
// 3. Automatically upload video + metadata to YouTube channel.
// ============================================================

const path = require('path');
// Robust dotenv path configuration
require('dotenv').config({ path: path.join(__dirname, '.env') });

const fs = require('fs');

const {
  generateYouTubeMetadata,
} = require('./src/gemini/metadataGenerator');

const {
  uploadVideoToYouTube,
} = require('./src/youtube/youtubeUploader');

async function main() {
  try {
    const videoPath =
      path.resolve('./test-video.mp4');

    console.log(
      '\n=========================================='
    );
    console.log(
      ' YOUTUBE AUTOMATION PIPELINE TEST'
    );
    console.log(
      '==========================================\n'
    );

    // --------------------------------------------------------
    // STEP 1: CHECK TEST VIDEO
    // --------------------------------------------------------

    if (!fs.existsSync(videoPath)) {
      throw new Error(
        `Test video not found:\n${videoPath}\n\n` +
        'Please put an MP4 file named "test-video.mp4" in the project root.'
      );
    }

    console.log(
      '✅ Test video found.'
    );

    // --------------------------------------------------------
    // STEP 2: GEMINI METADATA GENERATION
    // --------------------------------------------------------

    console.log(
      '\n1️⃣ Generating metadata with Gemini AI...'
    );

    const metadata =
      await generateYouTubeMetadata(
        videoPath
      );

    console.log(
      '\n✅ Gemini metadata generated successfully.'
    );

    // --------------------------------------------------------
    // STEP 3: YOUTUBE AUTO-UPLOAD
    // --------------------------------------------------------

    console.log(
      '\n2️⃣ Uploading video to YouTube channel...'
    );

    const result =
      await uploadVideoToYouTube(
        videoPath,
        metadata,
        {
          // Change to 'public' or 'unlisted' when ready
          privacyStatus: 'private',

          // 22 = People & Blogs (You can adjust this category ID later)
          categoryId: '22',
        }
      );

    // --------------------------------------------------------
    // STEP 4: FINAL SUCCESS RESULT
    // --------------------------------------------------------

    console.log(
      '\n=========================================='
    );

    console.log(
      ' COMPLETE PIPELINE SUCCESS ✅'
    );

    console.log(
      '==========================================\n'
    );

    console.log(
      JSON.stringify(
        {
          success: true,
          metadata,
          youtube: result,
        },
        null,
        2
      )
    );

    console.log(
      '\n🎉 CONGRATULATIONS! Your automated pipeline works end-to-end!\n'
    );

  } catch (error) {
    console.error(
      '\n=========================================='
    );

    console.error(
      ' ❌ AUTOMATION PIPELINE FAILED'
    );

    console.error(
      '==========================================\n'
    );

    console.error(
      error?.message ||
      error
    );

    process.exit(1);
  }
}

main();