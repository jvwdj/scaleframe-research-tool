import { get, all, run } from '../db/database.js';
import { scrapeURL } from './firecrawl.js';
import { extractVariables } from './deepseek.js';

const BATCH_SIZE = 20;
const CONCURRENT_SCRAPES = 5;
let isRunning = false;

export function startProcessor() {
  if (isRunning) return;
  isRunning = true;

  // Run processor every 10 seconds
  setInterval(processJobs, 10000);
  console.log('✓ Job processor started');
}

async function processJobs() {
  try {
    // Find pending jobs
    const pendingJobs = await all(`
      SELECT id FROM jobs WHERE status = 'pending' LIMIT 1
    `);

    for (const job of pendingJobs) {
      await processJob(job.id);
    }
  } catch (err) {
    console.error('Processor error:', err);
  }
}

async function processJob(jobId) {
  try {
    // Get job details
    const job = await get('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) return;

    // Update status to running
    await run('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?', [
      'running',
      new Date().toISOString(),
      jobId,
    ]);

    console.log(`📋 Processing job ${jobId.slice(0, 8)}...`);

    const variables = JSON.parse(job.variables_json);
    const urlColumn = job.url_column;
    const cooldown = job.cooldown_seconds || 0;

    // Get all pending rows for this job
    const pendingRows = await all(
      'SELECT * FROM rows WHERE job_id = ? AND status = ? ORDER BY row_index',
      [jobId, 'pending']
    );

    // Process in batches
    for (let i = 0; i < pendingRows.length; i += BATCH_SIZE) {
      const batch = pendingRows.slice(i, i + BATCH_SIZE);

      // Process batch with concurrency
      await processBatch(batch, jobId, variables, urlColumn);

      // Cooldown between batches
      if (cooldown > 0 && i + BATCH_SIZE < pendingRows.length) {
        console.log(`⏳ Cooling down for ${cooldown}s...`);
        await new Promise(resolve => setTimeout(resolve, cooldown * 1000));
      }
    }

    // Mark job as done
    await run('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?', [
      'done',
      new Date().toISOString(),
      jobId,
    ]);

    console.log(`✓ Job ${jobId.slice(0, 8)} completed`);
  } catch (err) {
    console.error(`Error processing job ${jobId}:`, err);
    await run('UPDATE jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?', [
      'failed',
      err.message,
      new Date().toISOString(),
      jobId,
    ]);
  }
}

async function processBatch(rows, jobId, variables, urlColumn) {
  // Process CONCURRENT_SCRAPES at a time
  for (let i = 0; i < rows.length; i += CONCURRENT_SCRAPES) {
    const chunk = rows.slice(i, i + CONCURRENT_SCRAPES);
    await Promise.all(chunk.map(row => processRow(row, jobId, variables, urlColumn)));
  }
}

async function processRow(row, jobId, variables, urlColumn) {
  try {
    const inputData = JSON.parse(row.input_json);
    const url = inputData[urlColumn];

    if (!url) {
      throw new Error(`Missing URL in column "${urlColumn}"`);
    }

    // Scrape website
    console.log(`  🌐 Scraping ${url}`);
    const scrapeResult = await scrapeURL(url);

    if (!scrapeResult.success) {
      throw new Error(`Scrape failed: ${scrapeResult.error}`);
    }

    const mdLength = scrapeResult.markdown?.length || 0;
    console.log(`  📄 Got ${mdLength} bytes of markdown`);

    if (mdLength < 100) {
      throw new Error(`Scraped content too small (${mdLength} bytes) - possibly blocked or empty page`);
    }

    // Extract variables
    console.log(`  🤖 Extracting with DeepSeek...`);
    const extractResult = await extractVariables(scrapeResult.markdown, variables, inputData);

    if (!extractResult.success) {
      throw new Error(`Extraction failed: ${extractResult.error}`);
    }

    // Update row with results
    await run(
      'UPDATE rows SET output_json = ?, status = ? WHERE id = ?',
      [JSON.stringify(extractResult.extracted), 'extracted', row.id]
    );

    // Log usage
    await run(
      `INSERT INTO provider_usage
       (job_id, api_key_name, provider, purpose, row_index, tokens_input, tokens_output, status, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jobId,
        (await get('SELECT api_key_name FROM jobs WHERE id = ?', [jobId])).api_key_name,
        'deepseek',
        'extraction',
        row.row_index,
        extractResult.usage?.input_tokens || 0,
        extractResult.usage?.output_tokens || 0,
        'success',
        new Date().toISOString(),
      ]
    );

    console.log(`  ✓ Row ${row.row_index} done`);
  } catch (err) {
    console.error(`  ✗ Row ${row.row_index} failed: ${err.message}`);
    await run(
      'UPDATE rows SET error = ?, status = ? WHERE id = ?',
      [err.message, 'failed', row.id]
    );
  }
}
