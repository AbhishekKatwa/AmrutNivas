#!/usr/bin/env node
/**
 * Direct apply script for migration 049 (password authentication).
 * Bypasses the sequential migration script to avoid issues with 035-048.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '..');
const REPO_ROOT = dirname(DB_DIR);
const ENV_FILE = join(REPO_ROOT, '.env');
const API = 'https://api.supabase.com/v1';

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync(ENV_FILE)) return null;
  const line = readFileSync(ENV_FILE, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : null;
}

function projectRef() {
  const base = readEnv('VITE_SUPABASE_URL');
  const match = base ? /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(base) : null;
  if (!match) {
    throw new Error(`VITE_SUPABASE_URL is missing or invalid`);
  }
  return match[1];
}

function accessToken() {
  const token = readEnv('SUPABASE_ACCESS_TOKEN');
  if (!token) {
    throw new Error('No SUPABASE_ACCESS_TOKEN');
  }
  return token;
}

async function query(ref, sql) {
  const response = await fetch(`${API}/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 2000)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function applyMigration049() {
  const ref = projectRef();
  console.log(`Project: ${ref}`);
  console.log('Reading migration 049...');
  const sql = readFileSync(join(DB_DIR, 'supabase/049_password_authentication.sql'), 'utf-8');

  console.log('Applying migration 049 to hosted database...');
  await query(ref, sql);
  console.log('Migration 049 applied successfully');

  console.log('Recording in schema_migrations...');
  await query(
    ref,
    `insert into app.schema_migrations (name) values ('049_password_authentication.sql')
     on conflict (name) do nothing`,
  );
  console.log('Migration 049 recorded in schema_migrations');
}

applyMigration049().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
