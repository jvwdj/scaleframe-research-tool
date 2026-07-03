import express from 'express';
import { getDB, run, get, all } from '../db/database.js';

const router = express.Router();

// POST /jobs - Create a new job
router.post('/', async (req, res) => {
  try {
    // TODO: Implement job creation
    res.status(501).json({ error: 'Not implemented' });
  } catch (err) {
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

    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /jobs/:job_id/usage - Get usage breakdown
router.get('/:job_id/usage', async (req, res) => {
  try {
    // TODO: Implement usage breakdown
    res.status(501).json({ error: 'Not implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /jobs/:job_id?format=csv - Export enriched CSV
router.get('/:job_id/export', async (req, res) => {
  try {
    // TODO: Implement CSV export
    res.status(501).json({ error: 'Not implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /jobs/:job_id/cancel - Cancel a job
router.post('/:job_id/cancel', async (req, res) => {
  try {
    // TODO: Implement job cancellation
    res.status(501).json({ error: 'Not implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
