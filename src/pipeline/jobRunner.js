// ============================================================
// JackFlix Automation - Single Execution
// GitHub Actions / Cron Friendly
// ============================================================
//
// One workflow run = one execution cycle.
//
// Flow:
//   Sheets
//      ↓
//   Determine next part
//      ↓
//   Search exact N.mp4 in Drive
//      ↓
//   If missing -> WAITING + email
//   If found  -> Download -> Shorts check -> Gemini
//                         -> YouTube -> Sheets -> Email
//
// IMPORTANT:
// This file does NOT use setInterval().
// GitHub Actions will start it again on the next schedule.
// ============================================================

const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '../../.env'),
});

// ============================================================
// IMPORT PIPELINE
// ============================================================

const {
  publishNextPart,
} = require('./publishVideo');

// ============================================================
// IMPORT SHEETS
// ============================================================

const {
  getLastUploadedPart,
  getNextRequiredPart,
  getJobState,
} = require('../sheets/sheetsLogger');

// ============================================================
// IMPORT EMAIL
// ============================================================

const {
  sendMissingFileAlert,
  sendFailureEmail,
} = require('../notifications/resendNotifier');

// ============================================================
// CONFIG
// ============================================================

const JOB_START_TIME =
  process.env.JOB_START_TIME || '00:00';

const JOB_TIMEZONE =
  process.env.JOB_TIMEZONE || 'Asia/Kolkata';

const MISSING_FILE_EMAIL_INTERVAL_MINUTES =
  Number(
    process.env.MISSING_FILE_EMAIL_INTERVAL_MINUTES || 5
  );

// ============================================================
// TIME HELPERS
// ============================================================

function getCurrentTime() {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: JOB_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date());
}

function getCurrentTimestamp() {
  return new Date().toISOString();
}

// ============================================================
// ENV CHECK
// ============================================================

function validateEnvironment() {
  const required = [
    'GEMINI_API_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'GOOGLE_SHEET_ID',
    'GOOGLE_SHEET_NAME',
    'RESEND_API_KEY',
    'ALERT_EMAIL',
    'RESEND_FROM_EMAIL',
    'RAW_FOLDER_ID',
  ];

  const missing = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.join('\n')}`
    );
  }
}

// ============================================================
// MISSING FILE ALERT
// ============================================================
//
// GitHub Actions will invoke this script every 5 minutes.
// Therefore a missing file can trigger an alert every 5 minutes.
//
// We rely on the Sheets job state so only the currently required
// part is alerted.
// ============================================================

async function handleWaitingForFile(
  result
) {
  const partNumber =
    result.partNumber;

  const expectedFile =
    `${partNumber}.mp4`;

  console.log('\n==========================================');
  console.log(' WAITING FOR NEXT VIDEO');
  console.log('==========================================\n');

  console.log(
    `Expected file: ${expectedFile}`
  );

  console.log(
    `Next Drive check will happen with the next workflow run.`
  );

  try {
    const job =
      await getJobState(
        partNumber
      );

    const lastUploadedPart =
      Math.max(
        0,
        partNumber - 1
      );

    const alertNumber =
      Number(
        job?.retryCount || 0
      ) + 1;

    await sendMissingFileAlert({
      expectedFile,

      partNumber,

      lastUploadedPart,

      nextCheckAt:
        `Next scheduled run (~${MISSING_FILE_EMAIL_INTERVAL_MINUTES} minutes)`,

      alertNumber,
    });

    console.log(
      `✅ Missing file alert sent for ${expectedFile}.`
    );

  } catch (error) {
    console.error(
      '⚠️ Could not send missing file alert:'
    );

    console.error(
      error?.message || error
    );

    // Missing-file email failure should NOT make the whole
    // automation job fail because the primary state is already
    // stored in Sheets.
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const startedAt =
    Date.now();

  console.log('\n==========================================');
  console.log(' JACKFLIX AUTOMATION - SINGLE RUN');
  console.log('==========================================\n');

  console.log(
    'Current time:',
    getCurrentTime()
  );

  console.log(
    'Configured job start:',
    JOB_START_TIME
  );

  console.log(
    'Timezone:',
    JOB_TIMEZONE
  );

  console.log(
    'Execution mode:',
    'ONE SHOT'
  );

  try {
    // --------------------------------------------------------
    // Validate environment
    // --------------------------------------------------------

    console.log(
      '\n🔐 Checking environment...'
    );

    validateEnvironment();

    console.log(
      '✅ Required environment variables are present.'
    );

    // --------------------------------------------------------
    // Show current sequence state
    // --------------------------------------------------------

    const lastUploaded =
      await getLastUploadedPart();

    const nextRequired =
      await getNextRequiredPart();

    console.log(
      '\n📊 Current sequence state:'
    );

    console.log(
      'Last uploaded part:',
      lastUploaded
    );

    console.log(
      'Next required part:',
      nextRequired
    );

    // --------------------------------------------------------
    // RUN PUBLISH PIPELINE
    // --------------------------------------------------------

    console.log(
      '\n🚀 Starting one publishing cycle...'
    );

    const result =
      await publishNextPart();

    // --------------------------------------------------------
    // RESULT: UPLOADED
    // --------------------------------------------------------

    if (
      result?.status === 'UPLOADED'
    ) {
      console.log('\n==========================================');
      console.log(' ✅ AUTOMATION RUN SUCCESSFUL');
      console.log('==========================================\n');

      console.log(
        'Uploaded part:',
        result.partNumber
      );

      console.log(
        'File:',
        result.fileName
      );

      console.log(
        'YouTube Video ID:',
        result.videoId
      );

      console.log(
        'YouTube URL:',
        result.videoUrl
      );

      console.log(
        'Next part:',
        result.nextPart
      );

      console.log(
        'Next status:',
        result.nextStatus
      );

      return;
    }

    // --------------------------------------------------------
    // RESULT: WAITING
    // --------------------------------------------------------

    if (
      result?.status === 'WAITING'
    ) {
      await handleWaitingForFile(
        result
      );

      console.log('\n==========================================');
      console.log(' ⏳ RUN COMPLETED - WAITING');
      console.log('==========================================\n');

      console.log(
        `Waiting for ${result.partNumber}.mp4`
      );

      return;
    }

    // --------------------------------------------------------
    // RESULT: ALREADY UPLOADED
    // --------------------------------------------------------

    if (
      result?.status === 'ALREADY_UPLOADED'
    ) {
      console.log('\n==========================================');
      console.log(' ✅ PART ALREADY PROCESSED');
      console.log('==========================================\n');

      console.log(
        `Part ${result.partNumber} is already marked UPLOADED.`
      );

      return;
    }

    // --------------------------------------------------------
    // RESULT: BUSY
    // --------------------------------------------------------

    if (
      result?.status === 'BUSY'
    ) {
      console.log('\n==========================================');
      console.log(' ⏳ PIPELINE BUSY');
      console.log('==========================================\n');

      console.log(
        'Another publishing process is already running.'
      );

      return;
    }

    // --------------------------------------------------------
    // RESULT: FAILED
    // --------------------------------------------------------

    if (
      result?.status === 'FAILED'
    ) {
      console.error('\n==========================================');
      console.error(' ❌ PIPELINE FAILED');
      console.error('==========================================\n');

      console.error(
        'Part:',
        result.partNumber
      );

      console.error(
        'Error:',
        result.error
      );

      // publishNextPart already saves the failure state
      // and sends failure email.

      process.exitCode = 1;

      return;
    }

    // --------------------------------------------------------
    // UNKNOWN RESULT
    // --------------------------------------------------------

    console.log(
      '\n⚠️ Unknown pipeline result:'
    );

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );

  } catch (error) {
    console.error('\n==========================================');
    console.error(' ❌ RUN ONCE FAILED');
    console.error('==========================================\n');

    console.error(
      error?.message ||
      error
    );

    // --------------------------------------------------------
    // Try to notify by email
    // --------------------------------------------------------

    try {
      const nextPart =
        await getNextRequiredPart();

      const job =
        await getJobState(
          nextPart
        );

      await sendFailureEmail({
        partNumber:
          nextPart,

        fileName:
          job?.fileName ||
          `${nextPart}.mp4`,

        stage:
          'RUN_ONCE',

        error:
          error?.message ||
          String(error),

        retryCount:
          Number(
            job?.retryCount || 0
          ) + 1,

        nextRetryAt:
          'Next scheduled GitHub Actions run',
      });

      console.log(
        '📧 Failure notification sent.'
      );

    } catch (emailError) {
      console.error(
        '⚠️ Could not send failure notification:',
        emailError.message
      );
    }

    process.exitCode = 1;

  } finally {
    const elapsed =
      Date.now() -
      startedAt;

    console.log(
      `\n⏱️ Total execution time: ${(
        elapsed / 1000
      ).toFixed(2)} seconds`
    );

    console.log(
      '🏁 GitHub Actions run finished.'
    );
  }
}

// ============================================================
// START
// ============================================================

main();