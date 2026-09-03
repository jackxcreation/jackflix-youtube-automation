// ============================================================
// Google Drive Service
// Production Ready - Environment Based Authentication
// ============================================================
// Responsibilities:
// 1. Scan RAW folder
// 2. Find video files
// 3. Return complete file metadata
// 4. Download videos to a temporary local directory
// 5. Safely clean up failed/partial downloads
//
// Works on:
// - Windows (development)
// - Linux / Oracle Cloud (production)
// ============================================================

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

require('dotenv').config({
  path: path.join(__dirname, '../../.env'),
});

const { getGoogleClients } = require('../auth/googleAuth');

// ============================================================
// GOOGLE DRIVE CLIENT
// ============================================================

const { drive } = getGoogleClients();

// ============================================================
// CONFIG
// ============================================================

const RAW_FOLDER_ID =
  process.env.RAW_FOLDER_ID ||
  '17Dwa_YGoXm0m8qF0lEhQ91dhlLjiajxb';

// Temporary processing directory.
//
// IMPORTANT:
// Do NOT use a Windows-specific path.
// os.tmpdir() works on Windows + Linux.
//
// Example:
// Windows → C:\Users\...\AppData\Local\Temp
// Linux   → /tmp
// ============================================================

const TEMP_ROOT =
  path.join(
    require('os').tmpdir(),
    'jackflix-automation'
  );

const PROCESSING_DIR =
  path.join(
    TEMP_ROOT,
    'processing'
  );

// ============================================================
// SUPPORTED VIDEO MIME TYPES
// ============================================================

const VIDEO_MIME_PREFIX = 'video/';

// ============================================================
// INITIALIZE TEMP DIRECTORIES
// ============================================================

function ensureTempDirectories() {
  if (!fs.existsSync(TEMP_ROOT)) {
    fs.mkdirSync(
      TEMP_ROOT,
      {
        recursive: true,
      }
    );
  }

  if (!fs.existsSync(PROCESSING_DIR)) {
    fs.mkdirSync(
      PROCESSING_DIR,
      {
        recursive: true,
      }
    );
  }
}

// Create directories immediately.
ensureTempDirectories();

// ============================================================
// NORMALIZE FILE NAME
// ============================================================

function sanitizeFileName(fileName) {
  if (
    !fileName ||
    typeof fileName !== 'string'
  ) {
    return 'video';
  }

  return fileName
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

// ============================================================
// GENERATE UNIQUE TEMP FILE NAME
// ============================================================

function createTempFilePath(
  fileId,
  originalFileName
) {
  const safeName =
    sanitizeFileName(
      originalFileName
    );

  const uniquePart =
    crypto
      .createHash('sha256')
      .update(
        `${fileId}-${Date.now()}`
      )
      .digest('hex')
      .slice(0, 16);

  return path.join(
    PROCESSING_DIR,
    `${uniquePart}-${safeName}`
  );
}

// ============================================================
// CHECK WHETHER FILE IS A VIDEO
// ============================================================

function isVideoFile(file) {
  return (
    file &&
    typeof file.mimeType === 'string' &&
    file.mimeType.startsWith(
      VIDEO_MIME_PREFIX
    )
  );
}

// ============================================================
// LIST RAW VIDEOS
// ============================================================

async function listRawVideos() {
  try {
    if (!RAW_FOLDER_ID) {
      throw new Error(
        'RAW_FOLDER_ID is missing.'
      );
    }

    console.log(
      '\n📂 Scanning Google Drive RAW folder...'
    );

    console.log(
      'RAW Folder ID:',
      RAW_FOLDER_ID
    );

    const allFiles = [];

    let pageToken = undefined;

    do {
      const response =
        await drive.files.list({
          q:
            `'${RAW_FOLDER_ID}' in parents ` +
            `and trashed = false`,

          pageSize: 100,

          pageToken,

          orderBy:
            'createdTime asc',

          fields:
            'nextPageToken,files(' +
            'id,' +
            'name,' +
            'mimeType,' +
            'size,' +
            'createdTime,' +
            'modifiedTime,' +
            'webViewLink' +
            ')',
        });

      const files =
        response.data.files || [];

      allFiles.push(
        ...files
      );

      pageToken =
        response.data.nextPageToken;

    } while (pageToken);

    const videos =
      allFiles.filter(
        isVideoFile
      );

    console.log(
      `✅ Found ${videos.length} video(s) in RAW folder.`
    );

    return videos;

  } catch (error) {
    console.error(
      '\n❌ Drive scan failed:'
    );

    console.error(
      error.response?.data ||
      error.message ||
      error
    );

    throw error;
  }
}

// ============================================================
// GET SINGLE FILE METADATA
// ============================================================

async function getFileMetadata(
  fileId
) {
  if (!fileId) {
    throw new Error(
      'fileId is required.'
    );
  }

  try {
    const response =
      await drive.files.get({
        fileId,

        fields:
          'id,name,mimeType,size,createdTime,modifiedTime,webViewLink',
      });

    return response.data;

  } catch (error) {
    console.error(
      `❌ Failed to get metadata for file ${fileId}:`,
      error.response?.data ||
      error.message ||
      error
    );

    throw error;
  }
}

// ============================================================
// DOWNLOAD DRIVE FILE
// ============================================================

async function downloadDriveFile(
  fileId,
  fileName
) {
  if (!fileId) {
    throw new Error(
      'fileId is required for download.'
    );
  }

  ensureTempDirectories();

  const outputPath =
    createTempFilePath(
      fileId,
      fileName || 'video'
    );

  console.log(
    '\n📥 Downloading Drive file...'
  );

  console.log(
    'File ID:',
    fileId
  );

  console.log(
    'File Name:',
    fileName
  );

  console.log(
    'Temporary Path:',
    outputPath
  );

  let writeStream;

  try {
    writeStream =
      fs.createWriteStream(
        outputPath
      );

    const response =
      await drive.files.get(
        {
          fileId,

          alt: 'media',
        },
        {
          responseType: 'stream',
        }
      );

    const totalSize =
      Number(
        response.headers[
          'content-length'
        ] || 0
      );

    let downloadedBytes = 0;

    response.data.on(
      'data',
      (chunk) => {
        downloadedBytes +=
          chunk.length;

        if (totalSize > 0) {
          const percent =
            (
              (downloadedBytes /
                totalSize) *
              100
            ).toFixed(1);

          process.stdout.write(
            `\r⬇️ Downloading: ${percent}%`
          );
        }
      }
    );

    await new Promise(
      (
        resolve,
        reject
      ) => {
        response.data.on(
          'error',
          reject
        );

        writeStream.on(
          'error',
          reject
        );

        writeStream.on(
          'finish',
          resolve
        );

        response.data.pipe(
          writeStream
        );
      }
    );

    process.stdout.write(
      '\n'
    );

    // --------------------------------------------------------
    // VERIFY FILE
    // --------------------------------------------------------

    if (!fs.existsSync(
      outputPath
    )) {
      throw new Error(
        'Download finished but output file does not exist.'
      );
    }

    const stats =
      fs.statSync(
        outputPath
      );

    if (stats.size <= 0) {
      throw new Error(
        'Downloaded file is empty.'
      );
    }

    // If Google supplied Content-Length,
    // compare it with actual downloaded size.
    if (
      totalSize > 0 &&
      stats.size !== totalSize
    ) {
      throw new Error(
        `Download size mismatch. Expected ${totalSize} bytes but received ${stats.size} bytes.`
      );
    }

    console.log(
      '✅ Download complete.'
    );

    console.log(
      'Downloaded bytes:',
      stats.size
    );

    console.log(
      'Local file:',
      outputPath
    );

    return {
      fileId,
      fileName,
      filePath: outputPath,
      size: stats.size,
    };

  } catch (error) {
    console.error(
      '\n❌ Drive download failed:'
    );

    console.error(
      error.response?.data ||
      error.message ||
      error
    );

    // --------------------------------------------------------
    // CLEAN PARTIAL FILE
    // --------------------------------------------------------

    try {
      if (
        fs.existsSync(
          outputPath
        )
      ) {
        fs.unlinkSync(
          outputPath
        );

        console.log(
          '🧹 Partial download removed.'
        );
      }
    } catch (cleanupError) {
      console.error(
        '⚠️ Could not remove partial file:',
        cleanupError.message
      );
    }

    throw error;

  } finally {
    // Safety:
    // If stream is still open because of an unexpected failure,
    // close it.
    try {
      if (
        writeStream &&
        !writeStream.destroyed
      ) {
        writeStream.destroy();
      }
    } catch (_) {
      // Ignore stream cleanup errors.
    }
  }
}

// ============================================================
// DOWNLOAD VIDEO BY FILE OBJECT
// ============================================================

async function downloadVideo(
  file
) {
  if (
    !file ||
    !file.id
  ) {
    throw new Error(
      'Valid Drive file object is required.'
    );
  }

  if (
    !isVideoFile(file)
  ) {
    throw new Error(
      `File is not a supported video: ${file.name}`
    );
  }

  return downloadDriveFile(
    file.id,
    file.name
  );
}

// ============================================================
// DELETE TEMP FILE
// ============================================================

async function deleteTempFile(
  filePath
) {
  if (!filePath) {
    return false;
  }

  try {
    if (
      fs.existsSync(
        filePath
      )
    ) {
      await fs.promises.unlink(
        filePath
      );

      console.log(
        '🧹 Temporary file deleted:',
        filePath
      );

      return true;
    }

    return false;

  } catch (error) {
    console.error(
      '⚠️ Failed to delete temporary file:',
      error.message
    );

    return false;
  }
}

// ============================================================
// CLEAN ENTIRE PROCESSING DIRECTORY
// ============================================================
//
// Useful during startup/recovery.
// ============================================================

async function cleanupProcessingDirectory() {
  ensureTempDirectories();

  try {
    const entries =
      await fs.promises.readdir(
        PROCESSING_DIR
      );

    let removed = 0;

    for (
      const entry of entries
    ) {
      const fullPath =
        path.join(
          PROCESSING_DIR,
          entry
        );

      try {
        const stats =
          await fs.promises.stat(
            fullPath
          );

        if (stats.isFile()) {
          await fs.promises.unlink(
            fullPath
          );

          removed++;
        }
      } catch (error) {
        console.error(
          `⚠️ Could not clean ${entry}:`,
          error.message
        );
      }
    }

    console.log(
      `🧹 Processing directory cleanup complete. Removed ${removed} file(s).`
    );

    return removed;

  } catch (error) {
    console.error(
      '⚠️ Processing directory cleanup failed:',
      error.message
    );

    return 0;
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  drive,

  RAW_FOLDER_ID,

  TEMP_ROOT,

  PROCESSING_DIR,

  listRawVideos,

  getFileMetadata,

  downloadDriveFile,

  downloadVideo,

  deleteTempFile,

  cleanupProcessingDirectory,

  isVideoFile,
};