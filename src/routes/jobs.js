import express from 'express';
import multer from 'multer';
import { getDB, run, get, all } from '../db/database.js';
import { parseCSV, validateCSVStructure, enrichCSV } from '../utils/csv.js';
import { generateJobId } from '../utils/job.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /jobs - Create a new job
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file provided' });
    }

    const { url_column, variables, cooldown_seconds = 0, job_name } = req.body;

    if (!url_column) {
      return res.status(400).json({ error: 'url_column is required' });
    }

    if (!variables) {
      return res.status(400).json({ error: 'variables array is required' });
    }

    // Parse variables if it's a string
    let parsedVariables;
    try {
      parsedVariables = typeof variables === 'string' ? JSON.parse(variables) : variables;
    } catch (err) {
      return res.status(400).json({ error: 'variables must be valid JSON' });
    }

    if (!Array.isArray(parsedVariables) || parsedVariables.length === 0) {
      return res.status(400).json({ error: 'variables must be a non-empty array' });
    }

    // Parse CSV
    const parseResult = parseCSV(req.file.buffer);
    if (!parseResult.success) {
      return res.status(400).json({ error: `CSV parsing failed: ${parseResult.error}` });
    }

    // Validate CSV structure
    const validation = validateCSVStructure(parseResult.records, url_column, parsedVariables);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Create job
    const jobId = generateJobId();
    const now = new Date().toISOString();

    await run(
      `INSERT INTO jobs (id, job_name, status, url_column, variables_json, cooldown_seconds, api_key_name, row_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jobId,
        job_name || `Job ${jobId.slice(0, 8)}`,
        'pending',
        url_column,
        JSON.stringify(parsedVariables),
        cooldown_seconds,
        req.apiKeyName,
        parseResult.records.length,
        now,
        now,
      ]
    );

    // Insert rows
    for (let i = 0; i < parseResult.records.length; i++) {
      await run(
        `INSERT INTO rows (job_id, row_index, input_json, status)
         VALUES (?, ?, ?, ?)`,
        [jobId, i, JSON.stringify(parseResult.records[i]), 'pending']
      );
    }

    res.status(201).json({
      job_id: jobId,
      status: 'pending',
      row_count: parseResult.records.length,
      columns: Object.keys(parseResult.records[0]),
    });
  } catch (err) {
    console.error('Error creating job:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /jobs/:job_id - Get job status
router.get('/:job_id', async (req, res) => {
  try {
    const { job_id } = req.params;
    const job = await get('SELECT * FROM jobs WHERE id = ?', [job_id]);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const rowStats = await get(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'extracted' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM rows WHERE job_id = ?`,
      [job_id]
    );

    res.json({
      ...job,
      variables_json: JSON.parse(job.variables_json),
      rows: rowStats,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /jobs/:job_id/usage - Get usage breakdown
router.get('/:job_id/usage', async (req, res) => {
  try {
    const { job_id } = req.params;
    const usage = await all(
      `SELECT provider, SUM(tokens_input) as total_input, SUM(tokens_output) as total_output, SUM(usd_equivalent) as total_cost
       FROM provider_usage WHERE job_id = ? GROUP BY provider`,
      [job_id]
    );

    const totalCost = usage.reduce((sum, u) => sum + (u.total_cost || 0), 0);

    res.json({ usage, total_cost: totalCost.toFixed(4) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /jobs/:job_id/export - Export enriched CSV
router.get('/:job_id/export', async (req, res) => {
  try {
    const { job_id } = req.params;
    const job = await get('SELECT * FROM jobs WHERE id = ?', [job_id]);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const variables = JSON.parse(job.variables_json);
    const rows = await all('SELECT * FROM rows WHERE job_id = ? ORDER BY row_index', [job_id]);

    // Reconstruct original data
    const originalRecords = rows.map(r => JSON.parse(r.input_json));

    // Enrich with results
    const enrichedCSV = enrichCSV(originalRecords, rows, variables);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="enriched_${job_id}.csv"`);
    res.send(enrichedCSV);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /jobs/:job_id/cancel - Cancel a job
router.post('/:job_id/cancel', async (req, res) => {
  try {
    const { job_id } = req.params;
    const job = await get('SELECT * FROM jobs WHERE id = ?', [job_id]);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status === 'done') {
      return res.status(400).json({ error: 'Cannot cancel a completed job' });
    }

    await run('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?', [
      'cancelled',
      new Date().toISOString(),
      job_id,
    ]);

    res.json({ job_id, status: 'cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
