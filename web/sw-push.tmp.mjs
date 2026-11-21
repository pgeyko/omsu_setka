import { chromium } from 'playwright-core';
const chrome = '/home/dev/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
const page = await context.newPage();
await page.goto('https://s.pgeyko.ru/g/15103/today', { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/firebase-cloud-messaging-push-scope' });
  if (reg.installing) await new Promise((resolve) => reg.installing.addEventListener('statechange', () => reg.installing?.state === 'activated' && resolve()));
});
await page.waitForTimeout(1000);
const sw = context.serviceWorkers().find((w) => w.url().includes('firebase-messaging-sw.js'));
const result = await sw.evaluate(async () => {
  const target = 'https://s.pgeyko.ru/g/15103/changes';
  const event = new Event('push');
  event.data = { json: () => ({ data: { title: 'Test', body: 'Body', click_url: target, tag: 'test-tag' } }) };
  let done;
  event.waitUntil = (p) => { done = p; };
  self.dispatchEvent(event);
  if (done) await done;
  const notes = await self.registration.getNotifications();
  const note = notes.find((n) => n.tag === 'test-tag');
  const data = note ? { title: note.title, body: note.body, url: note.data?.url } : null;
  if (note) note.close();
  return data;
});
console.log(result);
await browser.close();
