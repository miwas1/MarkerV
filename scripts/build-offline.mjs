import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'

const assetEntries = await readdir('dist/assets', { withFileTypes: true })
const files = ['index.html', 'mark.svg', ...assetEntries.filter((entry) => entry.isFile()).map((entry) => 'assets/' + entry.name)]
// The optional sample entry and landing editorial images are cached on demand rather than during SW install.
const shellFiles = files.filter((file) => !/\/(?:Sample-|sample-page-|fixtures-|hero_marking_desk_|seminar_teaching_notes_|workflow_handwritten_capture_)/.test(file))
const version = createHash('sha256')
for (const file of files) version.update(await readFile('dist/' + file))

const worker = `
const name = 'marking-assistant-' + ${JSON.stringify(version.digest('hex').slice(0, 16))};
const assets = ${JSON.stringify(files.map((file) => '/' + file))};
const shell = ${JSON.stringify(shellFiles.map((file) => '/' + file))};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(name).then((cache) => cache.addAll(shell)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('marking-assistant-') && key !== name)
      .map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await caches.open(name)).match('/index.html')));
  } else if (!url.search && assets.includes(url.pathname)) {
    event.respondWith(caches.open(name).then(async (cache) => {
      // The build allowlist contains immutable, same-origin files. Module and font
      // requests can carry Origin where the install-time fetch did not.
      const cached = await cache.match(url.pathname, { ignoreVary: true });
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    }));
  }
});
`
await writeFile('dist/sw.js', worker)
