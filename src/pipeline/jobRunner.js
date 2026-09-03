// ============================================================
// JackFlix Automation Job Runner
// Production Ready - Environment Based Authentication
// ============================================================

const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '../../.env'),
});

const {
  publishNextPart,
} = require('./publishVideo');

const {
  getNextRequiredPart,
  getJobState,
} = require('../sheets/sheetsLogger');

const {
  sendMissingFileAlert,
} = require('../notifications/resendNotifier');

// ============================================================
// CONFIG
// ============================================================

const JOB_START_TIME =
  process.env.JOB_START_TIME ||
  '20:00';

const JOB_TIMEZONE =
  process.env.JOB_TIMEZONE ||
  'Asia/Kolkata';

const DRIVE_CHECK_INTERVAL_MINUTES =
  Number(
    process.env.DRIVE_CHECK_INTERVAL_MINUTES ||
    10
  );

const MISSING_EMAIL_INTERVAL_MINUTES =
  Number(
    process.env.MISSING_FILE_EMAIL_INTERVAL_MINUTES ||
    5
  );

const MAX_MISSING_FILE_EMAILS =
  Number(
    process.env.MAX_MISSING_FILE_EMAILS_PER_JOB ||
    20
  );

// ============================================================
// STATE
// ============================================================

let jobStartedForToday =
  false;

let jobActive =
  false;

let processingTimer =
  null;

let missingEmailTimer =
  null;

let missingEmailCount =
  0;

let lastMissingPart =
  null;

let lastJobDate =
  null;

// ============================================================
// TIME HELPERS
// ============================================================

function getCurrentTimeInTimezone() {
  const formatter =
    new Intl.DateTimeFormat(
      'en-GB',
      {
        timeZone:
          JOB_TIMEZONE,

        hour:
          '2-digit',

        minute:
          '2-digit',

        hour12:
          false,
      }
    );

  return formatter.format(
    new Date()
  );
}

function getCurrentDateInTimezone() {
  const formatter =
    new Intl.DateTimeFormat(
      'en-GB',
      {
        timeZone:
          JOB_TIMEZONE,

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',
      }
    );

  return formatter.format(
    new Date()
  );
}

function isStartTimeReached() {
  const now =
    getCurrentTimeInTimezone();

  return now >=
    JOB_START_TIME;
}

// ============================================================
// PROCESS CHECK
// ============================================================

async function runProcessingCheck() {
  if (!jobActive) {
    return;
  }

  console.log(
    '\n🕐 Running Drive/publish check...'
  );

  try {
    const result =
      await publishNextPart();

    console.log(
      '\nJob result:',
      result
    );

    // --------------------------------------------------------
    // UPLOAD SUCCESS
    // --------------------------------------------------------

    if (
      result.status ===
      'UPLOADED'
    ) {
      console.log(
        `✅ Part ${result.partNumber} uploaded.`
      );

      // Reset missing alert state.
      missingEmailCount =
        0;

      lastMissingPart =
        null;

      return;
    }

    // --------------------------------------------------------
    // WAITING
    // --------------------------------------------------------

    if (
      result.status ===
      'WAITING'
    ) {
      const part =
        result.partNumber;

      if (
        lastMissingPart !==
        part
      ) {
        missingEmailCount =
          0;

        lastMissingPart =
          part;

        console.log(
          `⏳ Waiting for ${part}.mp4`
        );
      }

      return;
    }

  } catch (error) {
    console.error(
      '❌ Processing check error:',
      error.message
    );
  }
}

// ============================================================
// MISSING FILE EMAIL
// ============================================================

async function sendMissingEmailCheck() {
  if (!jobActive) {
    return;
  }

  try {
    const nextPart =
      await getNextRequiredPart();

    const job =
      await getJobState(
        nextPart
      );

    // Only send missing alerts when
    // we're actually waiting.
    if (
      job &&
      (
        job.status ===
        'WAITING'
        ||
        job.status ===
        'FAILED_RETRYABLE'
      )
    ) {
      if (
        lastMissingPart !==
        nextPart
      ) {
        lastMissingPart =
          nextPart;

        missingEmailCount =
          0;
      }

      if (
        missingEmailCount >=
        MAX_MISSING_FILE_EMAILS
      ) {
        console.log(
          `⚠️ Maximum missing-file email limit reached for part ${nextPart}.`
        );

        return;
      }

      missingEmailCount++;

      await sendMissingFileAlert({
        expectedFile:
          `${nextPart}.mp4`,

        partNumber:
          nextPart,

        lastUploadedPart:
          nextPart - 1,

        nextCheckAt:
          `In ${DRIVE_CHECK_INTERVAL_MINUTES} minutes`,

        alertNumber:
          missingEmailCount,
      });

      console.log(
        `📧 Missing-file alert #${missingEmailCount} sent for ${nextPart}.mp4`
      );
    }

  } catch (error) {
    console.error(
      '❌ Missing email check failed:',
      error.message
    );
  }
}

// ============================================================
// START JOB
// ============================================================

async function startJob() {
  if (jobActive) {
    console.log(
      '⚠️ Job is already active.'
    );

    return;
  }

  jobActive =
    true;

  missingEmailCount =
    0;

  lastMissingPart =
    null;

  console.log(
    '\n=========================================='
  );

  console.log(
    ' 🚀 JACKFLIX JOB STARTED'
  );

  console.log(
    '==========================================\n'
  );

  console.log(
    'Start time:',
    JOB_START_TIME
  );

  console.log(
    'Timezone:',
    JOB_TIMEZONE
  );

  console.log(
    'Drive check interval:',
    `${DRIVE_CHECK_INTERVAL_MINUTES} min`
  );

  console.log(
    'Missing email interval:',
    `${MISSING_EMAIL_INTERVAL_MINUTES} min`
  );

  // First check immediately.
  await runProcessingCheck();

  // Drive processing checks.
  processingTimer =
    setInterval(
      runProcessingCheck,
      DRIVE_CHECK_INTERVAL_MINUTES *
      60 *
      1000
    );

  // Missing alerts.
  missingEmailTimer =
    setInterval(
      sendMissingEmailCheck,
      MISSING_EMAIL_INTERVAL_MINUTES *
      60 *
      1000
    );
}

// ============================================================
// SCHEDULER LOOP
// ============================================================

function scheduleLoop() {
  const currentDate =
    getCurrentDateInTimezone();

  // Reset at a new day.
  if (
    lastJobDate &&
    lastJobDate !==
    currentDate
  ) {
    jobStartedForToday =
      false;
  }

  lastJobDate =
    currentDate;

  if (
    isStartTimeReached() &&
    !jobStartedForToday
  ) {
    jobStartedForToday =
      true;

    startJob().catch(
      (error) => {
        console.error(
          '❌ Job startup failed:',
          error.message
        );
      }
    );
  }
}

// ============================================================
// STOP JOB
// ============================================================

function stopJob() {
  jobActive =
    false;

  if (
    processingTimer
  ) {
    clearInterval(
      processingTimer
    );

    processingTimer =
      null;
  }

  if (
    missingEmailTimer
  ) {
    clearInterval(
      missingEmailTimer
    );

    missingEmailTimer =
      null;
  }

  console.log(
    '\n🛑 JackFlix job stopped.'
  );
}

// ============================================================
// START RUNNER
// ============================================================

function startRunner() {
  console.log(
    '\n=========================================='
  );

  console.log(
    ' JACKFLIX AUTOMATION RUNNER'
  );

  console.log(
    '==========================================\n'
  );

  console.log(
    'Current time:',
    getCurrentTimeInTimezone()
  );

  console.log(
    'Configured start:',
    JOB_START_TIME
  );

  console.log(
    'Timezone:',
    JOB_TIMEZONE
  );

  scheduleLoop();

  // Check start time every 30 seconds.
  const schedulerTimer =
    setInterval(
      scheduleLoop,
      30 * 1000
    );

  const shutdown =
    () => {
      clearInterval(
        schedulerTimer
      );

      stopJob();

      process.exit(
        0
      );
    };

  process.on(
    'SIGINT',
    shutdown
  );

  process.on(
    'SIGTERM',
    shutdown
  );
}

// ============================================================
// EXPORTS & DIRECT EXECUTION
// ============================================================

module.exports = {
  startRunner,
  startJob,
  stopJob,
  runProcessingCheck,
};

if (require.main === module) {
  startRunner();
}