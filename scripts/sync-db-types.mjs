#!/usr/bin/env node
/**
 * Sync database types from Supabase
 * 
 * This script regenerates src/types/database.types.ts from the live Supabase schema.
 * Only the project maintainer can run this (requires Supabase auth).
 * 
 * Usage: npm run sync-db-types
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'hglcltvwunzynnzduauy';
const OUTPUT_PATH = join(__dirname, '..', 'src', 'types', 'database.types.ts');

const HEADER = `/**
 * ⚠️  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY ⚠️
 * 
 * This file is generated from the Supabase schema.
 * Run \`npm run sync-db-types\` to regenerate (maintainer only).
 * 
 * Contributors: Treat this as READ-ONLY.
 * If you need schema changes, open an issue describing the required modifications.
 * 
 * Generated: ${new Date().toISOString().split('T')[0]}
 */

`;

try {
  console.log('🔄 Fetching database types from Supabase...');
  
  const output = execSync(
    `npx -y supabase gen types typescript --project-id ${PROJECT_ID}`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  
  // Check if output looks like valid TypeScript (not an error message)
  if (!output.includes('export type') && !output.includes('export interface')) {
    throw new Error('Received invalid output from Supabase CLI. You may need to run: npx supabase login');
  }
  
  writeFileSync(OUTPUT_PATH, HEADER + output);
  console.log('✅ Database types synced to src/types/database.types.ts');
  
} catch (error) {
  console.error('❌ Failed to sync database types:', error.message);
  console.error('\nMake sure you are logged in: npx supabase login');
  process.exit(1);
}
