import express from 'express';
import multer from 'multer';
import { parseCSV } from '../utils/csv.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const SYSTEM_PROMPT = `You are a title cleaning expert. Your job is to take messy job titles and clean them for use in cold emails.

Cleaning Rules:
1. If there are multiple titles (separated by | or &), pick the most relevant/senior one
2. Remove company names (anything after @ or after the title)
3. Remove qualifications in parentheses like (CEO)
4. Keep the language of the title (Dutch stays Dutch, English stays English)
5. Lowercase the output (except for acronyms)
6. Make it natural and suitable for a cold email placeholder
7. Special replacements:
   - Any form of "owner" (Owner, owner, Owner, owner, co-owner, co owner, coowner, etc.) → translate to Dutch:
     * If it starts with "co-" or contains "co ": → "mede-eigenaar"
     * Otherwise: → "eigenaar"
   - "founder" and "co-founder" keep their current form (founder, co-founder)

CRITICAL RULES:
- Return ONLY the cleaned title. Nothing else.
- Do NOT explain, ask questions, or provide context.
- Do NOT return conversational text of any kind.
- If you cannot interpret the input as a title, return the input unchanged.
- Output must be exactly one line with just the title.`;

async function cleanTitle(title) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log('cleanTitle called with:', title);
  console.log('API Key exists:', !!apiKey);

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
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: title,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`API Error for "${title}":`, error);
      return '';
    }

    const data = await response.json();
    return data.content[0].type === 'text' ? data.content[0].text.trim() : '';
  } catch (error) {
    console.error(`Error cleaning title "${title}":`, error.message);
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

    if (parseResult.records.length === 0 || !parseResult.records[0].Title) {
      return res.status(400).json({ error: 'CSV must have a "Title" column' });
    }

    const jobId = Date.now().toString();
    const abortController = new AbortController();
    activeJobs.set(jobId, abortController);

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Job-ID', jobId);

    const enrichedRecords = [];
    const totalTitles = parseResult.records.length;

    for (let i = 0; i < parseResult.records.length; i++) {
      if (abortController.signal.aborted) {
        res.write(JSON.stringify({ type: 'cancelled' }) + '\n');
        res.end();
        activeJobs.delete(jobId);
        return;
      }

      const record = parseResult.records[i];
      const originalTitle = record.Title?.trim();

      let cleanedTitle = '';
      if (originalTitle) {
        try {
          cleanedTitle = await cleanTitle(originalTitle);
        } catch (error) {
          console.error(`Error processing title:`, error);
        }
      }

      // Keep all original columns and add title_clean
      enrichedRecords.push({
        ...record,
        title_clean: cleanedTitle,
      });

      if ((i + 1) % 5 === 0 || i === parseResult.records.length - 1) {
        const progress = Math.round(((i + 1) / totalTitles) * 100);
        res.write(JSON.stringify({
          type: 'progress',
          progress,
          processed: i + 1,
          total: totalTitles,
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
