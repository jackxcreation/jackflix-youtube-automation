// ============================================================
// Google Sheets Test Script
// ============================================================

const path = require('path');
// Robust dotenv path configuration
require('dotenv').config({ path: path.join(__dirname, '.env') });

const {
  getHeaderRow,
  getLastUploadedPart,
  getNextRequiredPart,
  getUploadHistory,
  createJob,
} = require('./src/sheets/sheetsLogger');

async function main() {
  try {
    console.log('\n==========================================');
    console.log(' GOOGLE SHEETS TEST');
    console.log('==========================================\n');

    // --------------------------------------------------------
    // Headers
    // --------------------------------------------------------

    const headers =
      await getHeaderRow();

    console.log(
      '✅ Sheet connected.'
    );

    console.log(
      '\nHeaders:'
    );

    console.log(
      headers
    );

    // --------------------------------------------------------
    // Last uploaded
    // --------------------------------------------------------

    const lastUploaded =
      await getLastUploadedPart();

    const nextPart =
      await getNextRequiredPart();

    console.log(
      '\n✅ Last uploaded part:',
      lastUploaded
    );

    console.log(
      '✅ Next required part:',
      nextPart
    );

    // --------------------------------------------------------
    // History
    // --------------------------------------------------------

    const history =
      await getUploadHistory();

    console.log(
      '\n✅ Upload history rows:',
      history.length
    );

    // --------------------------------------------------------
    // IMPORTANT:
    // We do NOT create a fake upload row automatically.
    // --------------------------------------------------------

    console.log(
      '\n=========================================='
    );

    console.log(
      ' SHEETS TEST PASSED ✅'
    );

    console.log(
      '==========================================\n'
    );

  } catch (error) {
    console.error(
      '\n❌ SHEETS TEST FAILED\n'
    );

    console.error(
      error.response?.data ||
      error.message ||
      error
    );

    process.exit(1);
  }
}

main();