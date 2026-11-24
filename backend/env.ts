// Loads backend/.env regardless of the working directory. Import this before anything that
// reads process.env at import time. On Vercel the file is absent and real env vars are used.
import {config} from 'dotenv';
import {fileURLToPath} from 'node:url';

config({path: fileURLToPath(new URL('./.env', import.meta.url)), quiet: true});
