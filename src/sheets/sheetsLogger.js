// ============================================================
// Google Sheets Logger / Job State Manager (Column S Compatible)
// ============================================================

const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '../../.env'),
});

const {
  getGoogleClients,
} = require('../auth/googleAuth');

// ============================================================
// CONFIG
// ============================================================

const {
  sheets,
} = getGoogleClients();

const SHEET_ID =
  process.env.GOOGLE_SHEET_ID;

const SHEET_NAME =
  process.env.GOOGLE_SHEET_NAME ||
  'Uploads';

if (!SHEET_ID) {
  throw new Error(
    'GOOGLE_SHEET_ID is missing in .env'
  );
}

// ============================================================
// COLUMN INDEXES (A to S)
// ============================================================

const COLUMNS = {
  PART_NUMBER: 0,      // A
  FILE_NAME: 1,        // B
  DRIVE_FILE_ID: 2,    // C
  STATUS: 3,           // D
  TITLE: 4,            // E
  DESCRIPTION: 5,      // F
  TAGS: 6,             // G
  KEYWORDS: 7,         // H
  YOUTUBE_VIDEO_ID: 8, // I
  YOUTUBE_URL: 9,      // J
  PRIVACY: 10,         // K
  UPLOAD_DATE: 11,     // L
  UPLOAD_TIME: 12,     // M
  GEMINI_STATUS: 13,   // N
  UPLOAD_STATUS: 14,   // O
  RETRY_COUNT: 15,     // P
  ERROR: 16,           // Q
  CREATED_AT: 17,      // R
  UPDATED_AT: 18,      // S
};

// ============================================================
// HELPERS
// ============================================================

function getNow() {
  return new Date();
}

function formatDate(date) {
  return new Intl.DateTimeFormat(
    'en-IN',
    {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }
  ).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat(
    'en-IN',
    {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }
  ).format(date);
}

function formatTags(tags) {
  if (!Array.isArray(tags)) {
    return '';
  }

  return tags.join(', ');
}

function normalizePartNumber(value) {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number < 1
  ) {
    return null;
  }

  return number;
}

// ============================================================
// GET ALL ROWS
// ============================================================

async function getAllRows() {
  const response =
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:S`,
    });

  return response.data.values || [];
}

// ============================================================
// GET HEADER ROW
// ============================================================

async function getHeaderRow() {
  const response =
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1:S1`,
    });

  return response.data.values?.[0] || [];
}

// ============================================================
// FIND ROW BY DRIVE FILE ID
// ============================================================

async function findRowByDriveFileId(
  driveFileId
) {
  const rows =
    await getAllRows();

  for (
    let index = 1;
    index < rows.length;
    index++
  ) {
    const row =
      rows[index] || [];

    if (
      row[COLUMNS.DRIVE_FILE_ID] ===
      driveFileId
    ) {
      return {
        rowNumber: index + 1,
        row,
      };
    }
  }

  return null;
}

// ============================================================
// FIND ROW BY PART NUMBER
// ============================================================

async function findRowByPartNumber(
  partNumber
) {
  const normalized =
    normalizePartNumber(
      partNumber
    );

  if (!normalized) {
    return null;
  }

  const rows =
    await getAllRows();

  for (
    let index = 1;
    index < rows.length;
    index++
  ) {
    const row =
      rows[index] || [];

    const rowPart =
      normalizePartNumber(
        row[COLUMNS.PART_NUMBER]
      );

    if (
      rowPart === normalized
    ) {
      return {
        rowNumber: index + 1,
        row,
      };
    }
  }

  return null;
}

// ============================================================
// GET LAST SUCCESSFULLY UPLOADED PART
// ============================================================

async function getLastUploadedPart() {
  const rows =
    await getAllRows();

  let highestPart = 0;

  for (
    let index = 1;
    index < rows.length;
    index++
  ) {
    const row =
      rows[index] || [];

    const part =
      normalizePartNumber(
        row[COLUMNS.PART_NUMBER]
      );

    const status =
      (
        row[COLUMNS.STATUS] ||
        ''
      )
        .toString()
        .trim()
        .toUpperCase();

    if (
      part &&
      status === 'UPLOADED' &&
      part > highestPart
    ) {
      highestPart =
        part;
    }
  }

  return highestPart;
}

// ============================================================
// GET NEXT REQUIRED PART
// ============================================================

async function getNextRequiredPart() {
  const lastUploaded =
    await getLastUploadedPart();

  return lastUploaded + 1;
}

// ============================================================
// APPEND NEW JOB ROW
// ============================================================

async function createJob({
  partNumber,
  fileName,
  driveFileId,
  status = 'PROCESSING',
  retryCount = 0,
}) {
  const existing =
    await findRowByPartNumber(
      partNumber
    );

  if (existing) {
    return {
      created: false,
      rowNumber:
        existing.rowNumber,
      message:
        `Part ${partNumber} already exists.`,
    };
  }

  const now =
    getNow();

  const row = [
    partNumber,
    fileName || '',
    driveFileId || '',
    status,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'PENDING',
    'PENDING',
    retryCount,
    '',
    now.toISOString(),
    now.toISOString(),
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,

    range:
      `${SHEET_NAME}!A:S`,

    valueInputOption:
      'USER_ENTERED',

    insertDataOption:
      'INSERT_ROWS',

    requestBody: {
      values: [row],
    },
  });

  const created =
    await findRowByPartNumber(
      partNumber
    );

  return {
    created: true,
    rowNumber:
      created?.rowNumber || null,
    row,
  };
}

// ============================================================
// UPDATE ROW
// ============================================================

async function updateJob(
  rowNumber,
  updates = {}
) {
  if (!rowNumber) {
    throw new Error(
      'rowNumber is required.'
    );
  }

  const existing =
    await getAllRows();

  const currentRow =
    existing[rowNumber - 1] ||
    [];

  const row = [];

  for (
    let index = 0;
    index <= 18;
    index++
  ) {
    row[index] =
      currentRow[index] ??
      '';
  }

  if (
    updates.partNumber !==
    undefined
  ) {
    row[COLUMNS.PART_NUMBER] =
      updates.partNumber;
  }

  if (
    updates.fileName !==
    undefined
  ) {
    row[COLUMNS.FILE_NAME] =
      updates.fileName;
  }

  if (
    updates.driveFileId !==
    undefined
  ) {
    row[COLUMNS.DRIVE_FILE_ID] =
      updates.driveFileId;
  }

  if (
    updates.status !==
    undefined
  ) {
    row[COLUMNS.STATUS] =
      updates.status;
  }

  if (
    updates.title !==
    undefined
  ) {
    row[COLUMNS.TITLE] =
      updates.title;
  }

  if (
    updates.description !==
    undefined
  ) {
    row[COLUMNS.DESCRIPTION] =
      updates.description;
  }

  if (
    updates.tags !==
    undefined
  ) {
    row[COLUMNS.TAGS] =
      Array.isArray(updates.tags)
        ? formatTags(updates.tags)
        : updates.tags;
  }

  if (
    updates.keywords !==
    undefined
  ) {
    row[COLUMNS.KEYWORDS] =
      Array.isArray(updates.keywords)
        ? formatTags(
            updates.keywords
          )
        : updates.keywords;
  }

  if (
    updates.youtubeVideoId !==
    undefined
  ) {
    row[
      COLUMNS.YOUTUBE_VIDEO_ID
    ] =
      updates.youtubeVideoId;
  }

  if (
    updates.youtubeUrl !==
    undefined
  ) {
    row[COLUMNS.YOUTUBE_URL] =
      updates.youtubeUrl;
  }

  if (
    updates.privacy !==
    undefined
  ) {
    row[COLUMNS.PRIVACY] =
      updates.privacy;
  }

  if (
    updates.uploadDate !==
    undefined
  ) {
    row[COLUMNS.UPLOAD_DATE] =
      updates.uploadDate;
  }

  if (
    updates.uploadTime !==
    undefined
  ) {
    row[COLUMNS.UPLOAD_TIME] =
      updates.uploadTime;
  }

  if (
    updates.geminiStatus !==
    undefined
  ) {
    row[COLUMNS.GEMINI_STATUS] =
      updates.geminiStatus;
  }

  if (
    updates.uploadStatus !==
    undefined
  ) {
    row[COLUMNS.UPLOAD_STATUS] =
      updates.uploadStatus;
  }

  if (
    updates.retryCount !==
    undefined
  ) {
    row[COLUMNS.RETRY_COUNT] =
      updates.retryCount;
  }

  if (
    updates.error !==
    undefined
  ) {
    row[COLUMNS.ERROR] =
      updates.error;
  }

  // Always update timestamp.
  row[COLUMNS.UPDATED_AT] =
    getNow().toISOString();

  const range =
    `${SHEET_NAME}!A${rowNumber}:S${rowNumber}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,

    range,

    valueInputOption:
      'USER_ENTERED',

    requestBody: {
      values: [row],
    },
  });

  return {
    rowNumber,
    row,
  };
}

// ============================================================
// MARK GEMINI COMPLETE
// ============================================================

async function markGeminiComplete(
  rowNumber,
  metadata
) {
  return updateJob(
    rowNumber,
    {
      geminiStatus: 'COMPLETED',

      title:
        metadata.title,

      description:
        metadata.description,

      tags:
        metadata.tags,
    }
  );
}

// ============================================================
// MARK UPLOAD SUCCESS
// ============================================================

async function markUploadSuccess(
  rowNumber,
  result,
  metadata
) {
  const now =
    getNow();

  return updateJob(
    rowNumber,
    {
      status:
        'UPLOADED',

      title:
        metadata?.title,

      description:
        metadata?.description,

      tags:
        metadata?.tags,

      youtubeVideoId:
        result.videoId,

      youtubeUrl:
        result.videoUrl,

      privacy:
        result.privacyStatus,

      uploadDate:
        formatDate(now),

      uploadTime:
        formatTime(now),

      uploadStatus:
        'SUCCESS',

      error:
        '',
    }
  );
}

// ============================================================
// MARK RETRYABLE FAILURE
// ============================================================

async function markFailure(
  rowNumber,
  error,
  retryCount
) {
  return updateJob(
    rowNumber,
    {
      status:
        'FAILED_RETRYABLE',

      uploadStatus:
        'FAILED',

      retryCount:
        retryCount || 0,

      error:
        error?.message ||
        String(error),
    }
  );
}

// ============================================================
// GET CURRENT JOB STATE
// ============================================================

async function getJobState(
  partNumber
) {
  const result =
    await findRowByPartNumber(
      partNumber
    );

  if (!result) {
    return null;
  }

  const row =
    result.row || [];

  return {
    rowNumber:
      result.rowNumber,

    partNumber:
      normalizePartNumber(
        row[COLUMNS.PART_NUMBER]
      ),

    fileName:
      row[COLUMNS.FILE_NAME] ||
      '',

    driveFileId:
      row[COLUMNS.DRIVE_FILE_ID] ||
      '',

    status:
      row[COLUMNS.STATUS] ||
      '',

    title:
      row[COLUMNS.TITLE] ||
      '',

    description:
      row[COLUMNS.DESCRIPTION] ||
      '',

    tags:
      row[COLUMNS.TAGS] || '',

    keywords:
      row[COLUMNS.KEYWORDS] || '',

    youtubeVideoId:
      row[COLUMNS.YOUTUBE_VIDEO_ID] ||
      '',

    youtubeUrl:
      row[COLUMNS.YOUTUBE_URL] ||
      '',

    privacy:
      row[COLUMNS.PRIVACY] ||
      '',

    uploadDate:
      row[COLUMNS.UPLOAD_DATE] ||
      '',

    uploadTime:
      row[COLUMNS.UPLOAD_TIME] ||
      '',

    geminiStatus:
      row[COLUMNS.GEMINI_STATUS] ||
      '',

    uploadStatus:
      row[COLUMNS.UPLOAD_STATUS] ||
      '',

    retryCount:
      Number(
        row[COLUMNS.RETRY_COUNT] ||
        0
      ),

    error:
      row[COLUMNS.ERROR] ||
      '',
  };
}

// ============================================================
// GET COMPLETE UPLOAD HISTORY
// ============================================================

async function getUploadHistory() {
  const rows =
    await getAllRows();

  if (
    rows.length <= 1
  ) {
    return [];
  }

  return rows
    .slice(1)
    .map(
      (row, index) => ({
        rowNumber:
          index + 2,

        partNumber:
          normalizePartNumber(
            row[COLUMNS.PART_NUMBER]
          ),

        fileName:
          row[COLUMNS.FILE_NAME] ||
          '',

        driveFileId:
          row[
            COLUMNS.DRIVE_FILE_ID
          ] || '',

        status:
          row[COLUMNS.STATUS] ||
          '',

        youtubeVideoId:
          row[
            COLUMNS.YOUTUBE_VIDEO_ID
          ] || '',

        youtubeUrl:
          row[COLUMNS.YOUTUBE_URL] ||
          '',

        title:
          row[COLUMNS.TITLE] ||
          '',

        uploadDate:
          row[COLUMNS.UPLOAD_DATE] ||
          '',

        uploadTime:
          row[COLUMNS.UPLOAD_TIME] ||
          '',
      })
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getAllRows,
  getHeaderRow,
  findRowByDriveFileId,
  findRowByPartNumber,
  getLastUploadedPart,
  getNextRequiredPart,
  createJob,
  updateJob,
  markGeminiComplete,
  markUploadSuccess,
  markFailure,
  getJobState,
  getUploadHistory,
};