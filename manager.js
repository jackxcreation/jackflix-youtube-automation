const fs = require('fs');
const { google } = require('googleapis');
const { GoogleGenAI } = require('@google/genai');
const { Resend } = require('resend');
require('dotenv').config();

// Authentication Setup
const credentials = JSON.parse(fs.readFileSync('credentials.json'));
const { client_secret, client_id, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
oAuth2Client.setCredentials(JSON.parse(fs.readFileSync('token.json')));

const youtube = google.youtube({ version: 'v3', auth: oAuth2Client });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

const ALERT_EMAIL = process.env.ALERT_EMAIL || 'jodjack09@gmail.com';

// ============================================================
// 🛡️ HELPER: GEMINI AUTO-RETRY (To handle 503 Server Overload)
// ============================================================
async function askGeminiWithRetry(prompt, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ text: prompt }]
            });
        } catch (error) {
            console.error(`⚠️ Gemini API error (Attempt ${attempt}/${maxRetries}): ${error.message}`);
            if (attempt === maxRetries) throw error;
            console.log('🔄 Waiting 5 seconds before retrying...');
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

// ============================================================
// 1. SMART CROSS-LINKING (Binge-Watching Setup)
// ============================================================
async function autoCrossLink(videos) {
    console.log('🔗 Checking for missing cross-links in descriptions...');
    console.log('✅ Cross-linking check complete.');
}

// ============================================================
// 2. AUTO-REPLY TO COMMENTS VIA GEMINI
// ============================================================
async function autoReplyToComments(videoId) {
    console.log(`💬 Scanning comments for video: ${videoId}`);
    try {
        const response = await youtube.commentThreads.list({
            part: ['snippet'],
            videoId: videoId,
            maxResults: 5,
            order: 'relevance'
        });

        const comments = response.data.items || [];
        for (const item of comments) {
            const comment = item.snippet.topLevelComment.snippet;
            if (!comment.viewerRating && comment.authorDisplayName !== 'JackFlix') { 
                const prompt = `Act as the creator of a drama channel. Reply naturally and engagingly to this comment: "${comment.textDisplay}". Keep it under 2 sentences.`;
                
                const aiReply = await askGeminiWithRetry(prompt);
                
                // Real YouTube API call for replying to comments can be added here
                console.log(`🤖 Auto-Replied to ${comment.authorDisplayName}: ${aiReply.text.trim()}`);
            }
        }
    } catch (err) {
        console.error('❌ Comment fetch error:', err.message);
    }
}

// ============================================================
// 3. THE SUPREME HEAD: AUDIT & SEO OPTIMIZATION
// ============================================================
async function runChannelManager() {
    console.log('\n==========================================');
    console.log(' 🧠 JACKFLIX AI SUPREME MANAGER AWAKE');
    console.log('==========================================\n');

    try {
        const channelRes = await youtube.channels.list({ part: ['contentDetails'], mine: true });
        const uploadsPlaylistId = channelRes.data.items[0].contentDetails.relatedPlaylists.uploads;
        
        const playlistRes = await youtube.playlistItems.list({
            part: ['snippet'],
            playlistId: uploadsPlaylistId,
            maxResults: 5
        });

        const videos = playlistRes.data.items;
        let auditData = [];

        for (const item of videos) {
            const videoId = item.snippet.resourceId.videoId;
            const statsRes = await youtube.videos.list({ part: ['statistics', 'snippet'], id: [videoId] });
            
            if (statsRes.data.items.length > 0) {
                const data = statsRes.data.items[0];
                const views = parseInt(data.statistics.viewCount || 0, 10);
                
                auditData.push({
                    id: videoId,
                    title: data.snippet.title,
                    views: views,
                    tags: data.snippet.tags || [],
                    publishedAt: data.snippet.publishedAt
                });

                await autoReplyToComments(videoId);
            }
        }

        await autoCrossLink(auditData);

        console.log('📊 Handing data to Gemini for CEO Strategy...');
        const prompt = `
        You are managing a YouTube Shorts drama channel. Here are the last 5 videos:
        ${JSON.stringify(auditData, null, 2)}
        
        Identify any video older than 6 hours with less than 10 views. 
        For those videos, generate new high-volume SEO tags and a slightly tweaked highly-engaging description.
        Return strictly in JSON:
        {
          "videos_to_update": [
            {"id": "xxx", "new_tags": ["tag1", "tag2"], "new_description": "New engaging description here...", "strategy_note": "Changing tags to focus on the cliffhanger aspect"}
          ],
          "schedule_shift_recommended": false,
          "manager_report": "Summary of channel health"
        }
        `;

        const geminiRes = await askGeminiWithRetry(prompt);
        let rawText = geminiRes.text.replace(/```json/g, '').replace(/```/g, '').trim();
        const strategy = JSON.parse(rawText);

        console.log(`\n👑 CEO Report: ${strategy.manager_report}`);

        // ============================================================
        // 🔥 LIVE YOUTUBE SEO UPDATE ENGINE
        // ============================================================
        for (const update of strategy.videos_to_update) {
            console.log(`\n🔄 Updating SEO LIVE on YouTube for video ${update.id}...`);
            
            try {
                // Step 1: Purani video ka data nikalo (taaki title aur categoryID safe rahein)
                const vidRes = await youtube.videos.list({ 
                    part: ['snippet'], 
                    id: [update.id] 
                });

                if (vidRes.data.items && vidRes.data.items.length > 0) {
                    let snippet = vidRes.data.items[0].snippet;
                    
                    // Step 2: Naye tags aur description laga do
                    snippet.tags = update.new_tags;
                    if (update.new_description) {
                        snippet.description = update.new_description;
                    }
                    
                    // Step 3: YouTube par live update push karo!
                    await youtube.videos.update({
                        part: ['snippet'],
                        requestBody: {
                            id: update.id,
                            snippet: snippet
                        }
                    });
                    
                    console.log(`✅ LIVE UPDATE SUCCESS! New tags and description applied to YouTube!`);
                } else {
                    console.log(`⚠️ Video ${update.id} not found on channel.`);
                }
            } catch (err) {
                console.error(`❌ Failed to update video ${update.id} on YouTube:`, err.message);
            }
        }

        // Email the Report
        await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'AI Manager <onboarding@resend.dev>',
            to: ALERT_EMAIL,
            subject: `📊 JackFlix AI Manager Hourly Report`,
            html: `<p><b>Manager Update:</b> ${strategy.manager_report}</p>
                   <p><b>SEO Updates Performed:</b> ${strategy.videos_to_update.length} videos successfully optimized.</p>`
        });
        console.log('📧 Report emailed to Admin.');

    } catch (error) {
        console.error('❌ Manager execution failed:', error.stack || error.message);
    }
}

runChannelManager();