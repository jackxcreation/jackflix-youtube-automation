// ============================================================
// Test Script: Gemini Metadata Generator
// ============================================================
// Responsibilities:
// 1. Check if 'test-video.mp4' exists in project root.
// 2. Call generateYouTubeMetadata from src/gemini/metadataGenerator.js
// 3. Print the final JSON result cleanly.
// ============================================================

const path = require('path');
// Robust dotenv path configuration
require('dotenv').config({ path: path.join(__dirname, '.env') });

const fs = require('fs');

const {
  generateYouTubeMetadata,
} = require('./src/gemini/metadataGenerator');

async function main() {
  try {
    const videoPath = path.resolve(
      './test-video.mp4'
    );

    console.log(
      '\nChecking test video...'
    );

    if (!fs.existsSync(videoPath)) {
      throw new Error(
        `Test video not found:\n${videoPath}\n\n` +
        'Put an MP4 file named "test-video.mp4" in the project root.'
      );
    }

    console.log(
      '✅ Test video found.'
    );

    const metadata =
      await generateYouTubeMetadata(
        videoPath
      );

    console.log(
      '\n=========================================='
    );

    console.log(
      ' FINAL GEMINI RESULT ✅'
    );

    console.log(
      '==========================================\n'
    );

    console.log(
      JSON.stringify(
        metadata,
        null,
        2
      )
    );

    console.log(
      '\n✅ TEST COMPLETED SUCCESSFULLY\n'
    );

  } catch (error) {
    console.error(
      '\n❌ TEST FAILED\n'
    );

    console.error(
      error?.message ||
      error
    );

    process.exit(1);
  }
}

main();