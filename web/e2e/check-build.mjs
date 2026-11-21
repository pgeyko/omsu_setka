// Validates the production build artifacts that the PWA and Dockerfile rely on.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function nonEmpty(path) {
  return existsSync(path) && statSync(path).size > 0;
}

check(nonEmpty(join(DIST, 'index.html')), 'dist/index.html is missing or empty');
check(nonEmpty(join(DIST, 'sw.js')), 'dist/sw.js is missing — run npm run build');
check(nonEmpty(join(DIST, 'manifest.webmanifest')), 'dist/manifest.webmanifest is missing');
check(nonEmpty(join(DIST, 'og.png')), 'dist/og.png is missing — link previews will be blank');
check(nonEmpty(join(DIST, 'share-redirect.js')), 'dist/share-redirect.js is missing — /g/:id cannot redirect');
check(nonEmpty(join(DIST, 'notification-badge.png')), 'dist/notification-badge.png is missing — Android shows an empty tray icon');
check(
  nonEmpty(join(DIST, 'firebase-messaging-sw.js')),
  'dist/firebase-messaging-sw.js is missing (Docker injects Firebase secrets into it)',
);

const index = existsSync(join(DIST, 'index.html')) ? readFileSync(join(DIST, 'index.html'), 'utf8') : '';
check(index.includes('rel="manifest"'), 'index.html does not link the web manifest');
check(!index.includes('/registerSW.js'), 'index.html references the missing /registerSW.js');
check(index.includes('id="root"'), 'index.html does not contain the app root');

const manifestPath = join(DIST, 'manifest.webmanifest');
if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    check(manifest.name && manifest.short_name, 'manifest has no name');
    check(manifest.display === 'standalone', 'manifest display must be standalone');
    check(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest has no icons');
    for (const icon of manifest.icons || []) {
      const file = join(DIST, icon.src.replace(/^\//, ''));
      check(nonEmpty(file), `manifest icon ${icon.src} is missing from dist`);
    }
  } catch (error) {
    errors.push(`manifest is not valid JSON: ${error.message}`);
  }
}

const swPath = join(DIST, 'sw.js');
if (existsSync(swPath)) {
  const sw = readFileSync(swPath, 'utf8');
  const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((match) => match[1]);
  check(urls.length > 0, 'sw.js has an empty precache manifest');
  for (const url of urls) {
    check(nonEmpty(join(DIST, url.replace(/^\//, ''))), `sw precache references missing file ${url}`);
  }
  check(/NavigationRoute/.test(sw), 'sw.js has no navigation fallback for SPA routes');
  check(/firebase-messaging-sw/.test(sw) === false, 'sw.js must not precache firebase-messaging-sw.js');
}

const firebaseWorker = join(DIST, 'firebase-messaging-sw.js');
if (existsSync(firebaseWorker)) {
  const worker = readFileSync(firebaseWorker, 'utf8');
  check(
    worker.includes('VITE_FIREBASE_API_KEY'),
    'firebase-messaging-sw.js lost its VITE_ placeholders for Docker injection',
  );
}

if (errors.length) {
  console.error('Build check failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('Build check passed: PWA shell, manifest, precache and FCM worker are consistent.');
