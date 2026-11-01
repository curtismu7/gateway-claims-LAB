import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Path-based (not new URL) so it also loads under the web tests' jsdom, whose URL class is not Node's. Written by `npm run mock-table`.
export const MOCK_TABLE = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'consoleTable.json'), 'utf8'));
