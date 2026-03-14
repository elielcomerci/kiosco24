import { defineConfig } from '@prisma/config';
import * as fs from 'fs';
import * as path from 'path';

// Manually load .env.local for CLI commands (Next.js loads it automatically at runtime)
function loadEnvFile(filename: string) {
  const filePath = path.resolve(process.cwd(), filename);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
