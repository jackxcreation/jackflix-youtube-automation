// ============================================================
// YouTube Video Uploader (Production Ready - Env Based Auth)
// ============================================================

const path = require('path');

// Safe dotenv and root path configuration
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const fs = require('fs');
const { getGoogleClients } = require('../auth/googleAuth');

// ============================================================
// YOUTUBE CLIENT VIA CENTRAL GOOGLE AUTH MODULE
// ============================================================

const { youtube } = getGoogleClients();

// ============================================================
// VALIDATION
// ============================================================

function validateUploadInput(videoPath, metadata) {
  if (!videoPath) {
    throw new Error('videoPath is required.');
  }

  if (!fs.existsSync(videoPath)) {
    throw new Error(
      `Video file not found:\n${videoPath}`
    );
  }

  const stats = fs.statSync(videoPath);

  if (!stats.isFile()) {
    throw new Error(
      `Not a file:\n${videoPath}`
    );
  }

  if (stats.size === 0) {
    throw new Error(
      'Video file is empty.'
    );
  }

  if (!metadata || typeof metadata !== 'object') {
    throw new Error(
      'metadata object is required.'
    );
  }

  if (
    typeof metadata.title !== 'string' ||
    !metadata.title.trim()
  ) {
    throw new Error(
      'Valid metadata.title is required.'
    );
  }

  if (
    typeof metadata.description !== 'string'
  ) {
    throw new Error(
      'metadata.description must be a string.'
    );
  }

  if (!Array.isArray(metadata.tags)) {
    throw new Error(
      'metadata.tags must be an array.'
    );
  }
}

// ============================================================
// UPLOAD FUNCTION
// ============================================================

async function uploadVideoToYouTube(
  videoPath,
  metadata,
  options = {}
) {
  validateUploadInput(
    videoPath,
    metadata
  );

  const privacyStatus =
    options.privacyStatus ||
    'private';

  const categoryId =
    options.categoryId ||
    '22';

  console.log('\n==========================================');
  console.log(' YOUTUBE VIDEO UPLOAD');
  console.log('==========================================\n');

  console.log('📁 Video:');
  console.log(videoPath);

  console.log('\n🎬 Title:');
  console.log(metadata.title);

  console.log('\n🔒 Privacy:');
  console.log(privacyStatus);

  try {
    console.log(
      '\n📤 Starting YouTube upload...'
    );

    const response =
      await youtube.videos.insert({
        part: [
          'snippet',
          'status'
        ],

        requestBody: {
          snippet: {
            title:
              metadata.title.trim(),

            description:
              metadata.description.trim(),

            tags:
              metadata.tags,

            categoryId,
          },

          status: {
            privacyStatus,
          },
        },

        media: {
          body: fs.createReadStream(
            videoPath
          ),
        },
      });

    const video =
      response.data;

    const videoId =
      video.id;

    if (!videoId) {
      throw new Error(
        'YouTube upload returned no video ID.'
      );
    }

    const videoUrl =
      `https://www.youtube.com/watch?v=${videoId}`;

    console.log(
      '\n=========================================='
    );

    console.log(
      ' YOUTUBE UPLOAD SUCCESS ✅'
    );

    console.log(
      '==========================================\n'
    );

    console.log('Video ID:');
    console.log(videoId);

    console.log('\nVideo URL:');
    console.log(videoUrl);

    console.log('\nPrivacy:');
    console.log(
      video.status?.privacyStatus ||
      privacyStatus
    );

    return {
      success: true,
      videoId,
      videoUrl,
      privacyStatus:
        video.status?.privacyStatus ||
        privacyStatus,
    };

  } catch (error) {
    console.error(
      '\n=========================================='
    );

    console.error(
      ' ❌ YOUTUBE UPLOAD FAILED'
    );

    console.error(
      '==========================================\n'
    );

    const apiError =
      error?.response?.data;

    if (apiError) {
      console.error(
        JSON.stringify(
          apiError,
          null,
          2
        )
      );
    } else {
      console.error(
        error?.message ||
        error
      );
    }

    throw error;
  }
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  uploadVideoToYouTube,
};