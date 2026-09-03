// ============================================================
// JackFlix - Sequential Video Publisher
// Production Ready - Environment Based Authentication
// ============================================================
// STRICT RULE:
// 1.mp4 -> 2.mp4 -> 3.mp4 -> 4.mp4 -> ...
//
// Never uploads a later part before the expected part.
// ============================================================

const path = require('path');
const fs = require('fs');

require('dotenv').config({
  path: path.join(__dirname, '../../.env'),
});

const {
  listRawVideos,
  downloadVideo,
  deleteTempFile,
} = require('../drive/driveService');

const {
  generateYouTubeMetadata,
} = require('../gemini/metadataGenerator');

const {
  uploadVideoToYouTube,
} = require('../youtube/youtubeUploader');

const {
  getLastUploadedPart,
  getNextRequiredPart,
  getJobState,
  createJob,
  updateJob,
  markGeminiComplete,
  markUploadSuccess,
  markFailure,
} = require('../sheets/sheetsLogger');

const {
  sendMissingFileAlert,
  sendUploadSuccessEmail,
  sendFailureEmail,
} = require('../notifications/resendNotifier');

// ============================================================
// CONFIG
// ============================================================

const YOUTUBE_PRIVACY =
  process.env.YOUTUBE_PRIVACY || 'private';

const YOUTUBE_CATEGORY_ID =
  process.env.YOUTUBE_CATEGORY_ID || '22';

// Shorts defaults.
const SHORTS_MAX_DURATION_SECONDS =
  Number(
    process.env.SHORTS_MAX_DURATION_SECONDS || 180
  );

const SHORTS_MAX_FILE_SIZE_MB =
  Number(
    process.env.SHORTS_MAX_FILE_SIZE_MB || 2048
  );

// ============================================================
// INTERNAL LOCK
// ============================================================

let isPublishing = false;

// ============================================================
// HELPERS
// ============================================================

function normalizeFileName(fileName) {
  return (
    fileName || ''
  )
    .trim()
    .toLowerCase();
}

function expectedFileName(partNumber) {
  return `${partNumber}.mp4`;
}

/**
 * Find ONLY exact expected filename.
 *
 * Example:
 * Expected: 2.mp4
 *
 * Valid:
 *   2.mp4
 *
 * Invalid:
 *   02.mp4
 *   2 (1).mp4
 *   video2.mp4
 *   2.mov
 *   3.mp4
 */
function findExactVideo(
  videos,
  partNumber
) {
  const expected =
    expectedFileName(partNumber);

  return (
    videos.find(
      (video) =>
        normalizeFileName(
          video.name
        ) === expected &&
        normalizeFileName(
          video.mimeType
        ) === 'video/mp4'
    ) || null
  );
}

function formatEta(minutes) {
  const date =
    new Date(
      Date.now() +
      minutes * 60 * 1000
    );

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    }
  ).format(date);
}

// ============================================================
// SHORTS VALIDATION
// ============================================================

async function getVideoInfo(
  filePath
) {
  const {
    execFile
  } = require('child_process');

  return new Promise(
    (resolve, reject) => {
      execFile(
        'ffprobe',
        [
          '-v',
          'error',

          '-show_entries',
          'format=duration,size',

          '-show_entries',
          'stream=width,height',

          '-of',
          'json',

          filePath,
        ],
        {
          windowsHide: true,
        },
        (
          error,
          stdout,
          stderr
        ) => {
          if (error) {
            reject(
              new Error(
                'ffprobe is not installed or video information could not be read.'
              )
            );

            return;
          }

          try {
            const data =
              JSON.parse(
                stdout
              );

            const videoStream =
              data.streams?.[0];

            const duration =
              Number(
                data.format?.duration || 0
              );

            const size =
              Number(
                data.format?.size || 0
              );

            const width =
              Number(
                videoStream?.width || 0
              );

            const height =
              Number(
                videoStream?.height || 0
              );

            resolve({
              duration,
              size,
              width,
              height,
            });

          } catch (parseError) {
            reject(
              new Error(
                `Could not parse ffprobe output: ${parseError.message}`
              )
            );
          }
        }
      );
    }
  );
}

async function validateShortsVideo(
  filePath
) {
  console.log(
    '\n📱 Validating video for Shorts...'
  );

  const stats =
    fs.statSync(
      filePath
    );

  const fileSizeMB =
    stats.size /
    (1024 * 1024);

  if (
    fileSizeMB >
    SHORTS_MAX_FILE_SIZE_MB
  ) {
    throw new Error(
      `Video file is ${fileSizeMB.toFixed(
        2
      )} MB, exceeding configured maximum of ${SHORTS_MAX_FILE_SIZE_MB} MB.`
    );
  }

  const info =
    await getVideoInfo(
      filePath
    );

  console.log(
    `Duration: ${info.duration.toFixed(2)} sec`
  );

  console.log(
    `Resolution: ${info.width}x${info.height}`
  );

  console.log(
    `File size: ${fileSizeMB.toFixed(2)} MB`
  );

  if (
    info.duration <= 0
  ) {
    throw new Error(
      'Could not determine video duration.'
    );
  }

  if (
    info.duration >
    SHORTS_MAX_DURATION_SECONDS
  ) {
    throw new Error(
      `Video duration ${info.duration.toFixed(
        2
      )} sec exceeds configured Shorts limit of ${SHORTS_MAX_DURATION_SECONDS} sec.`
    );
  }

  if (
    info.width <= 0 ||
    info.height <= 0
  ) {
    throw new Error(
      'Could not determine video dimensions.'
    );
  }

  const isPortrait =
    info.height >
    info.width;

  if (!isPortrait) {
    throw new Error(
      `Video is not portrait/vertical: ${info.width}x${info.height}`
    );
  }

  console.log(
    '✅ Shorts validation passed.'
  );

  return {
    ...info,
    fileSizeMB,
    isPortrait,
  };
}

// ============================================================
// PROCESS ONE PART
// ============================================================

async function publishNextPart() {
  if (isPublishing) {
    console.log(
      '\n⏳ Another publish job is already running.'
    );

    return {
      status: 'BUSY',
    };
  }

  isPublishing = true;

  let downloadedFilePath =
    null;

  let currentRowNumber =
    null;

  let currentPartNumber =
    null;

  try {
    const lastUploadedPart =
      await getLastUploadedPart();

    const nextPart =
      await getNextRequiredPart();

    currentPartNumber =
      nextPart;

    const expectedFile =
      expectedFileName(
        nextPart
      );

    console.log('\n==========================================');
    console.log(
      ' JACKFLIX SEQUENTIAL PUBLISHER'
    );
    console.log('==========================================\n');

    console.log(
      'Last uploaded part:',
      lastUploadedPart
    );

    console.log(
      'Next required part:',
      nextPart
    );

    console.log(
      'Expected file:',
      expectedFile
    );

    let job =
      await getJobState(
        nextPart
      );

    if (job?.status === 'UPLOADED') {
      console.log(
        `✅ Part ${nextPart} is already uploaded.`
      );

      return {
        status: 'ALREADY_UPLOADED',
        partNumber: nextPart,
      };
    }

    console.log(
      '\n📂 Searching Drive for exact file...'
    );

    const videos =
      await listRawVideos();

    const video =
      findExactVideo(
        videos,
        nextPart
      );

    if (!video) {
      console.log(
        `\n⏳ ${expectedFile} not found.`
      );

      if (!job) {
        const created =
          await createJob({
            partNumber:
              nextPart,

            fileName:
              expectedFile,

            driveFileId:
              '',

            status:
              'WAITING',

            retryCount:
              0,
          });

        currentRowNumber =
          created.rowNumber;
      } else {
        currentRowNumber =
          job.rowNumber;

        await updateJob(
          currentRowNumber,
          {
            status: 'WAITING',
            error: '',
          }
        );
      }

      return {
        status: 'WAITING',
        partNumber: nextPart,
        expectedFile,
      };
    }

    console.log(
      `\n✅ Found exact file: ${video.name}`
    );

    if (!job) {
      const created =
        await createJob({
          partNumber:
            nextPart,

          fileName:
            video.name,

          driveFileId:
            video.id,

          status:
            'PROCESSING',

          retryCount:
            0,
        });

      currentRowNumber =
        created.rowNumber;

    } else {
      currentRowNumber =
        job.rowNumber;

      await updateJob(
        currentRowNumber,
        {
          fileName:
            video.name,

          driveFileId:
            video.id,

          status:
            'PROCESSING',
        }
      );
    }

    const currentJob =
      await getJobState(
        nextPart
      );

    const retryCount =
      Number(
        currentJob?.retryCount || 0
      );

    console.log(
      '\n📥 Downloading exact video...'
    );

    const downloaded =
      await downloadVideo(
        video
      );

    downloadedFilePath =
      downloaded.filePath;

    await updateJob(
      currentRowNumber,
      {
        status:
          'DOWNLOADED',
        error:
          '',
      }
    );

    await updateJob(
      currentRowNumber,
      {
        status:
          'VALIDATING_SHORT',
      }
    );

    const videoInfo =
      await validateShortsVideo(
        downloadedFilePath
      );

    console.log(
      '\n✅ Video qualifies for Shorts.'
    );

    await updateJob(
      currentRowNumber,
      {
        status:
          'GEMINI_PROCESSING',

        geminiStatus:
          'PROCESSING',
      }
    );

    console.log(
      '\n🤖 Sending video to Gemini...'
    );

    const metadata =
      await generateYouTubeMetadata(
        downloadedFilePath
      );

    await markGeminiComplete(
      currentRowNumber,
      metadata
    );

    await updateJob(
      currentRowNumber,
      {
        status:
          'YOUTUBE_UPLOADING',

        uploadStatus:
          'PROCESSING',
      }
    );

    console.log(
      '\n📤 Uploading Short to YouTube...'
    );

    const uploadResult =
      await uploadVideoToYouTube(
        downloadedFilePath,
        metadata,
        {
          privacyStatus:
            YOUTUBE_PRIVACY,

          categoryId:
            YOUTUBE_CATEGORY_ID,
        }
      );

    await markUploadSuccess(
      currentRowNumber,
      uploadResult,
      metadata
    );

    await deleteTempFile(
      downloadedFilePath
    );

    downloadedFilePath =
      null;

    const nextNextPart =
      nextPart + 1;

    let nextNextStatus =
      'WAITING';

    const nextVideoRows =
      await listRawVideos();

    const nextVideo =
      findExactVideo(
        nextVideoRows,
        nextNextPart
      );

    if (nextVideo) {
      nextNextStatus =
        'FOUND';
    } else {
      nextNextStatus =
        'WAITING_FOR_FILE';
    }

    await sendUploadSuccessEmail({
      partNumber:
        nextPart,

      fileName:
        video.name,

      title:
        metadata.title,

      description:
        metadata.description,

      tags:
        metadata.tags,

      keywords:
        metadata.keywords ||
        '',

      youtubeVideoId:
        uploadResult.videoId,

      youtubeUrl:
        uploadResult.videoUrl,

      privacy:
        uploadResult.privacyStatus,

      uploadDate:
        '',

      uploadTime:
        '',

      nextPart:
        nextNextPart,

      nextStatus:
        nextNextStatus,
    });

    console.log(
      '\n=========================================='
    );

    console.log(
      ` ✅ PART ${nextPart} COMPLETED`
    );

    console.log(
      '==========================================\n'
    );

    return {
      status:
        'UPLOADED',

      partNumber:
        nextPart,

      fileName:
        video.name,

      videoId:
        uploadResult.videoId,

      videoUrl:
        uploadResult.videoUrl,

      nextPart:
        nextNextPart,

      nextStatus:
        nextNextStatus,

      shortsInfo:
        videoInfo,
    };

  } catch (error) {
    console.error(
      '\n=========================================='
    );

    console.error(
      ' ❌ PUBLISH FAILED'
    );

    console.error(
      '==========================================\n'
    );

    console.error(
      error?.message ||
      error
    );

    if (currentRowNumber) {
      try {
        const job =
          await getJobState(
            currentPartNumber
          );

        const retryCount =
          Number(
            job?.retryCount || 0
          ) + 1;

        await markFailure(
          currentRowNumber,
          error,
          retryCount
        );

        await sendFailureEmail({
          partNumber:
            currentPartNumber,

          fileName:
            job?.fileName ||
            expectedFileName(
              currentPartNumber
            ),

          stage:
            job?.status ||
            'UNKNOWN',

          error:
            error?.message ||
            String(error),

          retryCount,

          nextRetryAt:
            formatEta(10),
        });

      } catch (sheetError) {
        console.error(
          '⚠️ Could not save failure state:',
          sheetError.message
        );
      }
    }

    return {
      status:
        'FAILED',

      partNumber:
        currentPartNumber,

      error:
        error?.message ||
        String(error),
    };

  } finally {
    if (
      downloadedFilePath
    ) {
      try {
        await deleteTempFile(
          downloadedFilePath
        );
      } catch (_) {
        // Ignore cleanup failure.
      }
    }

    isPublishing = false;
  }
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  publishNextPart,
  validateShortsVideo,
  getVideoInfo,
};