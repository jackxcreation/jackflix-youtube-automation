// ============================================================
// Resend Email Test Script
// ============================================================

const path = require('path');
// Robust dotenv path configuration
require('dotenv').config({ path: path.join(__dirname, '.env') });

const {
  sendTestEmail,
} = require('./src/notifications/resendNotifier'); // 💡 Note: Agar tumne notification file ka naam emailNotifier.js rakha hai, toh yahan './src/notifications/emailNotifier' kar lena.

async function main() {
  try {
    console.log('\n==========================================');
    console.log(' RESEND EMAIL TEST');
    console.log('==========================================\n');

    const result =
      await sendTestEmail();

    console.log(
      '\n=========================================='
    );

    console.log(
      ' RESEND TEST PASSED ✅'
    );

    console.log(
      '==========================================\n'
    );

    console.log(
      'Email ID:',
      result.id
    );

  } catch (error) {
    console.error(
      '\n=========================================='
    );

    console.error(
      ' RESEND TEST FAILED ❌'
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