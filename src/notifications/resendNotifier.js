// ============================================================
// JackFlix Resend Email Notifier
// Production Ready - Environment Based Authentication
// ============================================================
// Sends:
// 1. Missing file alerts
// 2. Upload success reports
// 3. Upload failure / retry alerts
//
// Requires:
//   npm install resend
// ============================================================

const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '../../.env'),
});

const { Resend } = require('resend');

// ============================================================
// ENV
// ============================================================

const RESEND_API_KEY =
  process.env.RESEND_API_KEY;

const ALERT_EMAIL =
  process.env.ALERT_EMAIL;

const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  'JackFlix <onboarding@resend.dev>';

if (!RESEND_API_KEY) {
  throw new Error(
    'RESEND_API_KEY is missing in .env'
  );
}

if (!ALERT_EMAIL) {
  throw new Error(
    'ALERT_EMAIL is missing in .env'
  );
}

// ============================================================
// RESEND CLIENT
// ============================================================

const resend =
  new Resend(
    RESEND_API_KEY
  );

// ============================================================
// HELPERS
// ============================================================

function escapeHtml(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTags(tags) {
  if (!Array.isArray(tags)) {
    return '';
  }

  return tags
    .map(
      (tag) =>
        `<span style="
          display:inline-block;
          background:#f1f5f9;
          color:#334155;
          padding:5px 9px;
          border-radius:6px;
          margin:3px;
          font-size:12px;
        ">
          ${escapeHtml(tag)}
        </span>`
    )
    .join('');
}

function formatDateTime(date = new Date()) {
  return new Intl.DateTimeFormat(
    'en-IN',
    {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'medium',
    }
  ).format(date);
}

function buildEmailLayout({
  heading,
  statusLabel,
  statusColor,
  content,
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport"
        content="width=device-width, initial-scale=1.0" />
</head>

<body style="
  margin:0;
  padding:0;
  background:#f8fafc;
  font-family:Arial,Helvetica,sans-serif;
  color:#0f172a;
">

  <div style="
    max-width:680px;
    margin:30px auto;
    background:#ffffff;
    border:1px solid #e2e8f0;
    border-radius:14px;
    overflow:hidden;
  ">

    <!-- Header -->
    <div style="
      padding:24px;
      background:#0f172a;
      color:#ffffff;
    ">
      <div style="
        font-size:12px;
        letter-spacing:1.5px;
        opacity:.75;
        margin-bottom:8px;
      ">
        JACKFLIX AUTOMATION
      </div>

      <div style="
        font-size:26px;
        font-weight:700;
      ">
        ${escapeHtml(heading)}
      </div>
    </div>

    <!-- Status -->
    <div style="
      padding:18px 24px;
      background:${statusColor};
      color:#ffffff;
      font-weight:700;
      font-size:14px;
    ">
      ${escapeHtml(statusLabel)}
    </div>

    <!-- Content -->
    <div style="
      padding:26px 24px;
    ">
      ${content}
    </div>

    <!-- Footer -->
    <div style="
      border-top:1px solid #e2e8f0;
      padding:18px 24px;
      color:#64748b;
      font-size:12px;
    ">
      JackFlix automation system
      <br />
      ${escapeHtml(formatDateTime())}
    </div>

  </div>

</body>
</html>
`;
}

// ============================================================
// SEND EMAIL
// ============================================================

async function sendEmail({
  subject,
  html,
  idempotencyKey,
}) {
  try {
    console.log(
      `\n📧 Sending email: ${subject}`
    );

    const requestOptions =
      idempotencyKey
        ? {
            idempotencyKey,
          }
        : undefined;

    const {
      data,
      error,
    } = await resend.emails.send(
      {
        from:
          RESEND_FROM_EMAIL,

        to: [
          ALERT_EMAIL,
        ],

        subject,

        html,
      },
      requestOptions
    );

    if (error) {
      throw new Error(
        error.message ||
        'Resend email failed.'
      );
    }

    console.log(
      '✅ Email sent successfully.'
    );

    console.log(
      'Email ID:',
      data?.id || 'unknown'
    );

    return {
      success: true,
      id: data?.id || null,
    };

  } catch (error) {
    console.error(
      '\n❌ Email sending failed:'
    );

    console.error(
      error?.message ||
      error
    );

    throw error;
  }
}

// ============================================================
// MISSING FILE EMAIL
// ============================================================

async function sendMissingFileAlert({
  expectedFile,
  partNumber,
  lastUploadedPart,
  nextCheckAt,
  alertNumber,
}) {
  const content = `
    <h3 style="margin-top:0;">
      Expected video is not available
    </h3>

    <table style="
      width:100%;
      border-collapse:collapse;
      margin:20px 0;
    ">
      <tr>
        <td style="padding:10px 0;color:#64748b;">
          Expected File
        </td>
        <td style="padding:10px 0;font-weight:700;">
          ${escapeHtml(expectedFile)}
        </td>
      </tr>

      <tr>
        <td style="padding:10px 0;color:#64748b;">
          Part Number
        </td>
        <td style="padding:10px 0;font-weight:700;">
          ${escapeHtml(partNumber)}
        </td>
      </tr>

      <tr>
        <td style="padding:10px 0;color:#64748b;">
          Last Uploaded Part
        </td>
        <td style="padding:10px 0;font-weight:700;">
          ${escapeHtml(lastUploadedPart)}
        </td>
      </tr>

      <tr>
        <td style="padding:10px 0;color:#64748b;">
          Alert Number
        </td>
        <td style="padding:10px 0;font-weight:700;">
          #${escapeHtml(alertNumber)}
        </td>
      </tr>

      <tr>
        <td style="padding:10px 0;color:#64748b;">
          Next Drive Check
        </td>
        <td style="padding:10px 0;font-weight:700;">
          ${escapeHtml(nextCheckAt)}
        </td>
      </tr>
    </table>

    <div style="
      padding:14px;
      background:#fff7ed;
      border:1px solid #fed7aa;
      border-radius:8px;
      color:#9a3412;
    ">
      The automation will continue searching for the exact
      expected file. Later parts will not be uploaded out of order.
    </div>
  `;

  return sendEmail({
    subject:
      `⚠️ JackFlix: ${expectedFile} is missing`,

    html:
      buildEmailLayout({
        heading:
          'Missing Video Alert',

        statusLabel:
          'WAITING FOR FILE',

        statusColor:
          '#ea580c',

        content,
      }),

    idempotencyKey:
      `missing-file-${partNumber}-${alertNumber}`,
  });
}

// ============================================================
// UPLOAD SUCCESS EMAIL
// ============================================================

async function sendUploadSuccessEmail({
  partNumber,
  fileName,
  title,
  description,
  tags,
  keywords,
  youtubeVideoId,
  youtubeUrl,
  privacy,
  uploadDate,
  uploadTime,
  nextPart,
  nextStatus,
}) {
  const content = `
    <h3 style="margin-top:0;">
      Video uploaded successfully
    </h3>

    <table style="
      width:100%;
      border-collapse:collapse;
      margin:20px 0;
    ">
      <tr>
        <td style="padding:10px 0;color:#64748b;">
          Part
        </td>
        <td style="padding:10px 0;font-weight:700;">
          ${escapeHtml(partNumber)}
        </td>
      </tr>

      <tr>
        <td style="padding:10px 0;color:#64748b;">
          File
        </td>
        <td style="padding:10px 0;font-weight:700;">
          ${escapeHtml(fileName)}
        </td>
      </tr>

      <tr>
        <td style="padding:10px 0;color:#64748b;">
          Privacy
        </td>
        <td style="padding:10px 0;font-weight:700;">
          ${escapeHtml(privacy || '')}
        </td>
      </tr>

      <tr>
        <td style="padding:10px 0;color:#64748b;">
          Upload Date
        </td>
        <td style="padding:10px 0;font-weight:700;">
          ${escapeHtml(uploadDate || '')}
        </td>
      </tr>

      <tr>
        <td style="padding:10px 0;color:#64748b;">
          Upload Time
        </td>
        <td style="padding:10px 0;font-weight:700;">
          ${escapeHtml(uploadTime || '')}
        </td>
      </tr>
    </table>

    <h4>Title</h4>

    <div style="
      padding:14px;
      background:#f8fafc;
      border:1px solid #e2e8f0;
      border-radius:8px;
    ">
      ${escapeHtml(title)}
    </div>

    <h4>Description</h4>

    <div style="
      padding:14px;
      background:#f8fafc;
      border:1px solid #e2e8f0;
      border-radius:8px;
      line-height:1.6;
      white-space:pre-wrap;
    ">
      ${escapeHtml(description)}
    </div>

    <h4>Tags</h4>

    <div style="
      margin-bottom:20px;
    ">
      ${formatTags(tags)}
    </div>

    <h4>Keywords</h4>

    <div style="
      padding:14px;
      background:#f8fafc;
      border:1px solid #e2e8f0;
      border-radius:8px;
    ">
      ${escapeHtml(
        Array.isArray(keywords)
          ? keywords.join(', ')
          : keywords || ''
      )}
    </div>

    <div style="
      margin-top:24px;
      padding:18px;
      background:#f0fdf4;
      border:1px solid #bbf7d0;
      border-radius:8px;
    ">
      <div style="
        color:#166534;
        font-weight:700;
        margin-bottom:10px;
      ">
        Next File
      </div>

      <div style="font-size:18px;font-weight:700;">
        ${escapeHtml(`${nextPart}.mp4`)}
      </div>

      <div style="
        margin-top:6px;
        color:#166534;
      ">
        ${escapeHtml(nextStatus || '')}
      </div>
    </div>

    <div style="margin-top:24px;">
      <a
        href="${escapeHtml(youtubeUrl)}"
        style="
          display:inline-block;
          padding:12px 18px;
          background:#dc2626;
          color:#ffffff;
          text-decoration:none;
          border-radius:8px;
          font-weight:700;
        "
      >
        Watch on YouTube
      </a>
    </div>

    <div style="
      margin-top:20px;
      color:#64748b;
      font-size:12px;
    ">
      Video ID: ${escapeHtml(youtubeVideoId)}
    </div>
  `;

  return sendEmail({
    subject:
      `✅ JackFlix: Part ${partNumber} uploaded successfully`,

    html:
      buildEmailLayout({
        heading:
          'Upload Successful',

        statusLabel:
          'YOUTUBE UPLOAD SUCCESS',

        statusColor:
          '#16a34a',

        content,
      }),

    idempotencyKey:
      `upload-success-${partNumber}-${youtubeVideoId}`,
  });
}

// ============================================================
// FAILURE EMAIL
// ============================================================

async function sendFailureEmail({
  partNumber,
  fileName,
  stage,
  error,
  retryCount,
  nextRetryAt,
}) {
  const content = `
    <h3 style="margin-top:0;">
      Automation step failed
    </h3>

    <table style="
      width:100%;
      border-collapse:collapse;
      margin:20px 0;
    ">
      <tr>
        <td style="padding:10px 0;color:#64748b;">
          Part
        </td>
        <td style="padding:10px 0;font-weight:700;">
          ${escapeHtml(partNumber)}
        </td>
      </tr>

      <tr>
        <td style="padding:10px 0;color:#64748b;">
          File
        </td>
        <td style="padding:10px 0;font-weight:700;">
          ${escapeHtml(fileName || '')}
        </td>
      </tr>

      <tr>
        <td style="padding:10px 0;color:#64748b;">
          Failed Stage
        </td>
        <td style="padding:10px 0;font-weight:700;">
          ${escapeHtml(stage || '')}
        </td>
      </tr>

      <tr>
        <td style="padding:10px 0;color:#64748b;">
          Retry Count
        </td>
        <td style="padding:10px 0;font-weight:700;">
          ${escapeHtml(retryCount)}
        </td>
      </tr>

      <tr>
        <td style="padding:10px 0;color:#64748b;">
          Next Retry
        </td>
        <td style="padding:10px 0;font-weight:700;">
          ${escapeHtml(nextRetryAt || '')}
        </td>
      </tr>
    </table>

    <h4>Error</h4>

    <div style="
      padding:14px;
      background:#fef2f2;
      border:1px solid #fecaca;
      border-radius:8px;
      color:#991b1b;
      white-space:pre-wrap;
    ">
      ${escapeHtml(error || 'Unknown error')}
    </div>

    <div style="
      margin-top:20px;
      padding:14px;
      background:#fff7ed;
      border:1px solid #fed7aa;
      border-radius:8px;
      color:#9a3412;
    ">
      The job remains retryable unless the pipeline marks this
      failure as permanent.
    </div>
  `;

  return sendEmail({
    subject:
      `❌ JackFlix: Part ${partNumber} failed`,

    html:
      buildEmailLayout({
        heading:
          'Automation Failure',

        statusLabel:
          'RETRYABLE FAILURE',

        statusColor:
          '#dc2626',

        content,
      }),

    idempotencyKey:
      `upload-failure-${partNumber}-${retryCount}`,
  });
}

// ============================================================
// TEST EMAIL
// ============================================================

async function sendTestEmail() {
  return sendEmail({
    subject:
      '🧪 JackFlix Automation Email Test',

    html:
      buildEmailLayout({
        heading:
          'Email System Test',

        statusLabel:
          'EMAIL SYSTEM WORKING',

        statusColor:
          '#2563eb',

        content: `
          <h3 style="margin-top:0;">
            Resend integration is working ✅
          </h3>

          <p>
            This is a test email from the JackFlix
            YouTube automation system.
          </p>

          <div style="
            padding:14px;
            background:#eff6ff;
            border:1px solid #bfdbfe;
            border-radius:8px;
            color:#1e40af;
          ">
            The notification system is ready for the
            sequential publishing pipeline.
          </div>
        `,
      }),

    idempotencyKey:
      `test-email-${Date.now()}`,
  });
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  sendEmail,
  sendMissingFileAlert,
  sendUploadSuccessEmail,
  sendFailureEmail,
  sendTestEmail,
};