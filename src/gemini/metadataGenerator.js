// ============================================================
// Gemini YouTube Metadata Generator (Production & Network Safe)
// ============================================================
// Responsibilities:
// 1. Load GEMINI_API_KEY from .env (Fixed root path)
// 2. Upload a local video to Gemini Files API (with auto-retry)
// 3. Wait until Gemini finishes processing the video
// 4. Analyze the video with auto-retry on network drop (fetch failed fix)
// 5. Generate YouTube title, description and tags
// 6. Parse + validate the JSON response
//
// Required packages:
//   npm install @google/genai dotenv
// ============================================================

const path = require('path');
// Fixed path so it finds .env from the root yt-automation folder
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');

// ============================================================
// CONFIG
// ============================================================

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  throw new Error(
    '❌ GEMINI_API_KEY is missing. Add it to your .env file.'
  );
}

const MODEL = 'gemini-2.5-flash';

// How often we check Gemini video processing status.
const PROCESSING_POLL_INTERVAL_MS = 5000;

// Safety timeout so the bot doesn't wait forever.
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

// ============================================================
// GEMINI CLIENT
// ============================================================

const ai = new GoogleGenAI({
  apiKey: API_KEY,
});

// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Smart Retry Wrapper to handle network drops ('fetch failed') automatically.
 */
async function retryOperation(fn, retries = 3, delay = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      console.warn(
        `⚠️ Network/API glitch on attempt ${attempt}/${retries}: ${error?.message || error}. Retrying in ${delay / 1000}s...`
      );
      if (attempt === retries) {
        throw error;
      }
      await sleep(delay);
      delay *= 2; // Double the delay each time (Exponential Backoff)
    }
  }
}

/**
 * Get MIME type from file extension.
 */
function getMimeType(filePath) {
  const extension = path
    .extname(filePath)
    .toLowerCase();

  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.mpeg': 'video/mpeg',
    '.mpg': 'video/mpeg',
    '.3gp': 'video/3gpp',
    '.m4v': 'video/x-m4v',
  };

  return mimeTypes[extension] || 'video/mp4';
}

/**
 * Basic file validation before upload.
 */
function validateVideoFile(videoPath) {
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
      `Provided path is not a file:\n${videoPath}`
    );
  }

  if (stats.size === 0) {
    throw new Error(
      `Video file is empty:\n${videoPath}`
    );
  }
}

/**
 * Clean a Gemini response before JSON.parse().
 *
 * Handles:
 * - ```json ... ```
 * - ``` ... ```
 * - accidental surrounding whitespace
 */
function cleanJsonResponse(text) {
  if (!text || typeof text !== 'string') {
    throw new Error(
      'Gemini returned an empty response.'
    );
  }

  let cleaned = text.trim();

  // Remove markdown code fence if Gemini adds one.
  cleaned = cleaned.replace(
    /^```json\s*/i,
    ''
  );

  cleaned = cleaned.replace(
    /^```\s*/i,
    ''
  );

  cleaned = cleaned.replace(
    /\s*```$/i,
    ''
  );

  return cleaned.trim();
}

/**
 * Validate + normalize generated metadata.
 */
function validateMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    throw new Error(
      'Gemini metadata is not a valid object.'
    );
  }

  // ----------------------------
  // TITLE
  // ----------------------------

  if (
    typeof metadata.title !== 'string' ||
    !metadata.title.trim()
  ) {
    throw new Error(
      'Gemini returned an invalid or empty title.'
    );
  }

  // ----------------------------
  // DESCRIPTION
  // ----------------------------

  if (
    typeof metadata.description !== 'string'
  ) {
    throw new Error(
      'Gemini returned an invalid description.'
    );
  }

  // ----------------------------
  // TAGS
  // ----------------------------

  if (!Array.isArray(metadata.tags)) {
    throw new Error(
      'Gemini returned tags in an invalid format.'
    );
  }

  // Trim title.
  metadata.title =
    metadata.title.trim();

  // Trim description.
  metadata.description =
    metadata.description.trim();

  // Clean tags.
  metadata.tags = metadata.tags
    .filter(
      (tag) => typeof tag === 'string'
    )
    .map(
      (tag) => tag.trim()
    )
    .filter(Boolean);

  // Remove duplicate tags while
  // preserving original spelling.
  const seen = new Set();

  metadata.tags = metadata.tags.filter(
    (tag) => {
      const normalized =
        tag.toLowerCase();

      if (seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);

      return true;
    }
  );

  if (metadata.tags.length === 0) {
    throw new Error(
      'Gemini returned zero valid tags.'
    );
  }

  return metadata;
}

// ============================================================
// PROMPT
// ============================================================

function buildPrompt() {
  return `
You are an expert YouTube content strategist and SEO metadata generator.

Analyze the ENTIRE provided video carefully.

Your job is to create accurate, compelling metadata for publishing
this exact video on YouTube.

CRITICAL ACCURACY RULES:
- Base your output ONLY on information supported by the video.
- Do NOT invent people, names, places, dates, events, products,
  statistics, claims, quotes, or facts.
- Do NOT assume information that is not visible or understandable
  from the video.
- Do NOT create misleading clickbait.
- Do NOT mention that AI generated the metadata.
- Do NOT use unrelated keywords.
- Do NOT keyword-stuff the description or tags.

TITLE REQUIREMENTS:
- Catchy and interesting.
- Accurate to the actual video.
- Clear enough that viewers understand the topic.
- Keep it reasonably concise.
- Avoid fake claims.
- Avoid excessive capitalization.
- Avoid unnecessary emojis.

DESCRIPTION REQUIREMENTS:
- Write a natural YouTube description.
- Clearly summarize the actual video.
- Include important keywords naturally.
- Make it useful to the viewer.
- Do not invent information.
- Do not add fake social links, websites, sponsors,
  products, discounts, or calls to action that are not provided.
- Do not mention this metadata-generation process.

TAGS REQUIREMENTS:
- Generate between 5 and 15 relevant tags.
- Mix broad and specific search phrases.
- Tags must relate directly to the video.
- Do not add unrelated trending terms.
- Do not duplicate tags.

OUTPUT REQUIREMENTS:
Return ONLY valid JSON.
Do NOT return markdown.
Do NOT wrap the JSON in code fences.
Do NOT add commentary before or after the JSON.

Use EXACTLY this structure:

{
  "title": "Your accurate YouTube title",
  "description": "Your natural YouTube description",
  "tags": [
    "tag 1",
    "tag 2",
    "tag 3"
  ]
}
`;
}

// ============================================================
// MAIN FUNCTION
// ============================================================

/**
 * Upload a local video to Gemini,
 * analyze it,
 * and generate YouTube metadata.
 *
 * @param {string} videoPath
 * @returns {Promise<{
 *   title: string,
 *   description: string,
 *   tags: string[]
 * }>}
 */
async function generateYouTubeMetadata(
  videoPath
) {
  console.log('\n==========================================');
  console.log(' GEMINI VIDEO ANALYSIS');
  console.log('==========================================\n');

  validateVideoFile(videoPath);

  console.log('📁 Video:');
  console.log(videoPath);

  console.log('\n📦 MIME Type:');
  console.log(getMimeType(videoPath));

  try {
    // ========================================================
    // STEP 1: UPLOAD VIDEO (Protected with Retry)
    // ========================================================

    console.log('\n📤 Uploading video to Gemini Files API...');

    let videoFile = await retryOperation(async () => {
      return await ai.files.upload({
        file: videoPath,
        config: {
          mimeType: getMimeType(videoPath),
        },
      });
    });

    if (!videoFile) {
      throw new Error(
        'Gemini Files API returned no file object.'
      );
    }

    console.log('✅ Video uploaded successfully.');

    console.log('\nGemini File:');
    console.log(videoFile.name);

    console.log('\nGemini URI:');
    console.log(videoFile.uri);

    console.log('\nInitial State:');
    console.log(videoFile.state);

    // ========================================================
    // STEP 2: WAIT FOR PROCESSING
    // ========================================================

    console.log(
      '\n⏳ Waiting for Gemini to finish processing the video...'
    );

    const processingStartedAt =
      Date.now();

    while (true) {
      const state =
        videoFile.state
          ? videoFile.state.toString()
          : '';

      // ----------------------------
      // ACTIVE = READY
      // ----------------------------

      if (state === 'ACTIVE') {
        console.log(
          '✅ Gemini video processing complete.'
        );

        break;
      }

      // ----------------------------
      // FAILED
      // ----------------------------

      if (state === 'FAILED') {
        throw new Error(
          'Gemini reported that video processing FAILED.'
        );
      }

      // ----------------------------
      // TIMEOUT
      // ----------------------------

      const elapsed =
        Date.now() -
        processingStartedAt;

      if (
        elapsed >=
        PROCESSING_TIMEOUT_MS
      ) {
        throw new Error(
          'Gemini video processing timed out after 10 minutes.'
        );
      }

      // ----------------------------
      // WAIT
      // ----------------------------

      await sleep(
        PROCESSING_POLL_INTERVAL_MS
      );

      // Refresh file state with retry protection.
      videoFile = await retryOperation(async () => {
        return await ai.files.get({
          name: videoFile.name,
        });
      });

      console.log(
        `⏳ Current Gemini state: ${
          videoFile.state || 'UNKNOWN'
        }`
      );
    }

    // ========================================================
    // STEP 3: BUILD PROMPT
    // ========================================================

    const prompt =
      buildPrompt();

    // ========================================================
    // STEP 4: GENERATE CONTENT (Protected with Retry against 'fetch failed')
    // ========================================================

    console.log(
      '\n🧠 Sending video to Gemini for analysis...'
    );

    const response = await retryOperation(async () => {
      return await ai.models.generateContent({
        model: MODEL,

        contents: [
          {
            role: 'user',

            parts: [
              {
                fileData: {
                  fileUri: videoFile.uri,
                  mimeType:
                    videoFile.mimeType ||
                    getMimeType(videoPath),
                },
              },

              {
                text: prompt,
              },
            ],
          },
        ],
      });
    });

    // ========================================================
    // STEP 5: GET TEXT RESPONSE
    // ========================================================

    const rawText =
      response &&
      typeof response.text === 'string'
        ? response.text
        : '';

    console.log(
      '\n✅ Gemini response received.'
    );

    console.log(
      '\n---------------- RAW RESPONSE ----------------\n'
    );

    console.log(rawText);

    console.log(
      '\n----------------------------------------------'
    );

    // ========================================================
    // STEP 6: PARSE JSON
    // ========================================================

    const cleanedText =
      cleanJsonResponse(
        rawText
      );

    let metadata;

    try {
      metadata =
        JSON.parse(
          cleanedText
        );
    } catch (parseError) {
      throw new Error(
        'Gemini returned invalid JSON.\n\n' +
        'Cleaned response:\n' +
        cleanedText
      );
    }

    // ========================================================
    // STEP 7: VALIDATE METADATA
    // ========================================================

    metadata =
      validateMetadata(
        metadata
      );

    // ========================================================
    // STEP 8: SUCCESS
    // ========================================================

    console.log(
      '\n=========================================='
    );

    console.log(
      ' GEMINI METADATA READY ✅'
    );

    console.log(
      '==========================================\n'
    );

    console.log(
      '🎬 TITLE:'
    );

    console.log(
      metadata.title
    );

    console.log(
      '\n📝 DESCRIPTION:'
    );

    console.log(
      metadata.description
    );

    console.log(
      '\n🏷️ TAGS:'
    );

    console.log(
      metadata.tags
    );

    console.log(
      '\n==========================================\n'
    );

    return metadata;

  } catch (error) {
    console.error(
      '\n=========================================='
    );

    console.error(
      '❌ GEMINI VIDEO ANALYSIS FAILED'
    );

    console.error(
      '==========================================\n'
    );

    console.error(
      error?.message ||
      error
    );

    // Re-throw so the pipeline can decide
    // whether to retry / mark the job failed.
    throw error;
  }
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  generateYouTubeMetadata,
};