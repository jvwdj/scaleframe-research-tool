import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './db/database.js';
import { authMiddleware } from './middleware/auth.js';
import jobRoutes from './routes/jobs.js';
import cleanTitlesRoutes from './routes/clean-titles.js';
import cleanCompaniesRoutes from './routes/clean-companies.js';
import { startProcessor } from './services/processor.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth middleware disabled for internal use
// app.use(authMiddleware);

// Routes
app.use('/jobs', jobRoutes);
app.use('/api/clean-titles', cleanTitlesRoutes);
app.use('/api/clean-companies', cleanCompaniesRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Initialize database and start server
async function start() {
  try {
    await initDB();
    console.log('✓ Database initialized');

    // Start background job processor
    startProcessor();

    app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`  GET  http://localhost:${PORT}/health`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
