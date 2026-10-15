// Mirror the verified Angular output into a supported static hosting directory.
import { cp, mkdir, rm } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await rm('dist/client', { recursive: true, force: true });
await cp('dist/gymtrack/browser', 'dist/client', { recursive: true });
console.log('Build statica preparata in dist/client');
