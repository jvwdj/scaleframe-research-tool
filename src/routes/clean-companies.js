import express from 'express';
import multer from 'multer';
import { parseCSV } from '../utils/csv.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const DEFAULT_SYSTEM_PROMPT = `You are an expert at cleaning company names to extract the core brand name only.

PRIORITY RULES (in order):
1. Extract the BRAND NAME - usually the first 1-2 words
2. Remove GENERIC DESCRIPTORS that follow the brand:
   - Service types: Consulting, Services, Support, Agency, Bureau, Staffing
   - Product types: Software, Solutions, Platform, Tools, Application, System
   - Business entity: BV, AG, B.V., Ltd, Inc, LLC, Development, Management
   - Industry/Process: Automatisering, Horeca, Commerce, Finance, Digital
   - Other: Data, Technologies, Systems, Online (unless part of brand name)

3. Keep multi-word BRAND NAMES if both words are clearly brand identity:
   - "Informer Online" → "Informer Online" (both are brand)
   - "BlueBear Data" → "BlueBear" (Data is generic, not brand)

EXAMPLES:
- "LPCS | License Partners Cloud Solutions B.V." → "LCPS"
- "SMRTR Consulting BV" → "SMRTR"
- "Altronic Automatisering BV" → "Altronic"
- "Prodist ERP Software" → "Prodist"
- "Informer Online Nederland B.V." → "Informer Online"
- "Sifters process performance & audit support" → "Sifters"

CRITICAL RULES:
- Return ONLY the cleaned brand name. Nothing else.
- Do NOT explain, ask questions, or provide context.
- If you cannot determine a brand name, return the first 1-2 words as-is.
- Output must be exactly one line with just the company name.`;

async function cleanCompanyName(name, systemPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not configured');
    return '';
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        system: systemPrompt || DEFAULT_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: name,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`API Error for "${name}":`, error);
      return '';
    }

    const data = await response.json();
    return data.content[0].type === 'text' ? data.content[0].text.trim() : '';
  } catch (error) {
    console.error(`Error cleaning company name "${name}":`, error.message);
    return '';
  }
}

const activeJobs = new Map();

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file provided' });
    }

    const parseResult = parseCSV(req.file.buffer);
    if (!parseResult.success) {
      return res.status(400).json({ error: `CSV parsing failed: ${parseResult.error}` });
    }

    if (parseResult.records.length === 0) {
      return res.status(400).json({ error: 'CSV is empty' });
    }

    // Find the company name column - prioritize "Company name" column
    const firstRecord = parseResult.records[0];
    const companyCol = Object.keys(firstRecord).find(col =>
      col.toLowerCase() === 'company name' || col.toLowerCase().includes('company')
    ) || Object.keys(firstRecord).find(col =>
      col.toLowerCase().includes('name')
    );

    if (!companyCol) {
      return res.status(400).json({ error: 'CSV must have a column with "Company name", "company", or "name" in the header' });
    }

    const systemPrompt = req.body.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const jobId = Date.now().toString();
    const abortController = new AbortController();
    activeJobs.set(jobId, abortController);

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Job-ID', jobId);

    const enrichedRecords = [];
    const totalRecords = parseResult.records.length;

    for (let i = 0; i < parseResult.records.length; i++) {
      if (abortController.signal.aborted) {
        res.write(JSON.stringify({ type: 'cancelled' }) + '\n');
        res.end();
        activeJobs.delete(jobId);
        return;
      }

      const record = parseResult.records[i];
      const companyName = record[companyCol]?.trim();

      let cleanedName = '';
      if (companyName) {
        try {
          cleanedName = await cleanCompanyName(companyName, systemPrompt);
        } catch (error) {
          console.error(`Error processing company:`, error);
        }
      }

      enrichedRecords.push({
        ...record,
        company_name_clean: cleanedName,
      });

      if ((i + 1) % 5 === 0 || i === parseResult.records.length - 1) {
        const progress = Math.round(((i + 1) / totalRecords) * 100);
        res.write(JSON.stringify({
          type: 'progress',
          progress,
          processed: i + 1,
          total: totalRecords,
          records: enrichedRecords,
        }) + '\n');
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    res.write(JSON.stringify({ type: 'complete', records: enrichedRecords, total: enrichedRecords.length }) + '\n');
    res.end();
    activeJobs.delete(jobId);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/cancel/:jobId', (req, res) => {
  const { jobId } = req.params;
  const abortController = activeJobs.get(jobId);

  if (abortController) {
    abortController.abort();
    activeJobs.delete(jobId);
    return res.json({ status: 'cancelled' });
  }

  res.status(404).json({ error: 'Job not found' });
});

export default router;
