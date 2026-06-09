import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const unified = path.join(scriptDir, 'patch-expo-ios-swift.mjs');
const result = spawnSync(process.execPath, [unified], { stdio: 'inherit' });
process.exit(result.status ?? 1);
