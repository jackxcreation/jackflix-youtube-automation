// ============================================================
// Master Test Runner: Runs All Tests Sequentially
// ============================================================

const { execSync } = require('child_process');

function runTest(scriptName) {
  console.log(`\n==================================================`);
  console.log(` ▶️ STARTING: ${scriptName}`);
  console.log(`==================================================\n`);
  
  execSync(`node ${scriptName}`, { stdio: 'inherit' });
}

async function runAll() {
  try {
    console.log('\n🚀 RUNNING ALL PROJECT TESTS ONE BY ONE...\n');

    // 1. Google API Test (Drive & YouTube Connection)
    runTest('test_google.js');

    // 2. Drive Folder Specific Test
    runTest('test_drive.js');

    // 3. Gemini Metadata Generation Test (Requires test-video.mp4)
    runTest('test_gemini.js');

    console.log('\n==================================================');
    console.log(' 🎉 ALL TESTS PASSED SUCCESSFULLY! 🚀');
    console.log('==================================================\n');

  } catch (error) {
    console.error('\n==================================================');
    console.error(' ❌ ONE OR MORE TESTS FAILED.');
    console.error('==================================================\n');
    process.exit(1);
  }
}

runAll();