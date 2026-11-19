import { defineConfig } from 'drizzle-kit';

// Generating migrations reads only the schema; no database connection is needed.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
});
