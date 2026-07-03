import sqlite3 from 'sqlite3';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db;

export function getDB() {
  return db;
}

export async function initDB() {
  return new Promise((resolve, reject) => {
    const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'ronnie.db');

    db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);

      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) return reject(err);

        // Read and execute schema
        const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
        db.exec(schema, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  });
}

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}
