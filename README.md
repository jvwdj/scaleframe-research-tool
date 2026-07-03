# Scaleframe Research Tool

CSV lead enrichment service using web scraping and LLM extraction.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your API keys
npm run dev
```

## API

- `GET /health` — Health check
- `POST /jobs` — Create enrichment job
- `GET /jobs/:job_id` — Get job status
- `GET /jobs/:job_id/usage` — Usage breakdown
- `GET /jobs/:job_id/export?format=csv` — Export results
- `POST /jobs/:job_id/cancel` — Cancel job

All endpoints (except `/health`) require `X-API-Key` header.

## Stack

- Node.js + Express
- SQLite (file-based)
- Firecrawl (web scraping)
- DeepSeek (LLM extraction)
