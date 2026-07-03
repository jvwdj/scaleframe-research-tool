import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './db/database.js';
import { authMiddleware } from './middleware/auth.js';
import jobRoutes from './routes/jobs.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth middleware for all routes except health
app.use(authMiddleware);

// Routes
app.use('/jobs', jobRoutes);

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
