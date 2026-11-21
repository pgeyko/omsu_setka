// Browser smoke tests for the frontend.
// Starts the deterministic mock API and the Vite dev server, freezes the page
// clock to 2026-11-19T09:00 and walks through the main user flows.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MOCK_PORT = Number(process.env.E2E_MOCK_PORT || 18082);
const APP_PORT = Number(process.env.E2E_APP_PORT || 15174);
const BASE = `http://127.0.0.1:${APP_PORT}`;
const ARTIFACTS = join(ROOT, 'e2e', 'artifacts');

function findChromium() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const probe = spawnSync('which', [name], { encoding: 'utf8' });
    if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim();
  }
  const cache = join(homedir(), '.cache', 'ms-playwright');
  if (existsSync(cache)) {
    const builds = readdirSync(cache)
      .filter((name) => name.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const build of builds) {
      const binary = join(cache, build, 'chrome-linux64', 'chrome');
      if (existsSync(binary)) return binary;
      const legacy = join(cache, build, 'chrome-linux', 'chrome');
      if (existsSync(legacy)) return legacy;
    }
  }
  throw new Error('Chromium not found. Set CHROME_PATH to a Chrome/Chromium binary.');
}

async function waitForHttp(url, timeout = 25_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function start(args, options = {}) {
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  child.stdout.on('data', (chunk) => process.env.E2E_VERBOSE && process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.env.E2E_VERBOSE && process.stderr.write(chunk));
  return child;
}

const results = [];
const pageErrors = [];
const consoleErrors = [];
let page;
let context;
let browser;

async function scenario(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  ok  ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error });
    console.log(`  FAIL ${name}: ${error.message}`);
    if (page) {
      mkdirSync(ARTIFACTS, { recursive: true });
      const file = join(ARTIFACTS, `${String(results.length).padStart(2, '0')}-failure.png`);
      await page.screenshot({ path: file, fullPage: true }).catch(() => {});
      console.log(`       screenshot: ${file}`);
    }
  }
}

async function goto(path, wait = 'networkidle') {
  await page.goto(`${BASE}${path}`, { waitUntil: wait, timeout: 20_000 });
}

async function text(selector) {
  const value = await page.locator(selector).first().textContent({ timeout: 8000 });
  return (value || '').replace(/\s+/g, ' ').trim();
}

async function count(selector) {
  return page.locator(selector).count();
}

async function waitForText(selector, expected, timeout = 8000) {
  const asRegex = expected instanceof RegExp;
  await page.waitForFunction(
    ({ selector, source, flags, text }) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const value = (node.textContent || '').replace(/\s+/g, ' ').trim();
      return source ? new RegExp(source, flags).test(value) : value === text;
    },
    {
      selector,
      source: asRegex ? expected.source : null,
      flags: asRegex ? expected.flags : '',
      text: asRegex ? null : expected,
    },
    { timeout },
  );
}

async function waitForSheetClosed() {
  await page.waitForFunction(() => !document.querySelector('dialog.sheet')?.open);
}

async function resetStorage() {
  await goto('/search');
  await page.evaluate(() => localStorage.clear());
}

async function seedToken() {
  await page.evaluate(() => localStorage.setItem('setka-fcm-token', 'e2e-token'));
}

async function setSubgroup(value) {
  await goto('/g/472/settings');
  await page.getByRole('button', { name: value ? `${value}-я подгруппа` : 'Все подгруппы' }).click();
  await page.waitForTimeout(150);
}

async function screenshot(name) {
  mkdirSync(ARTIFACTS, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS, `${name}.png`), fullPage: false });
}

async function main() {
  console.log(`\nfrontend e2e → ${BASE}`);
  const mock = start(['e2e/mock-server.mjs', String(MOCK_PORT)]);
  const vite = start(
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'],
    { env: { ...process.env, VITE_PROXY_TARGET: `http://127.0.0.1:${MOCK_PORT}`, BROWSER: 'none' } },
  );

  const shutdown = () => {
    for (const child of [vite, mock]) {
      if (child && !child.killed) child.kill('SIGTERM');
    }
  };
  process.on('exit', shutdown);

  try {
    await waitForHttp(`http://127.0.0.1:${MOCK_PORT}/__state`);
    await waitForHttp(BASE);

    const executablePath = findChromium();
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
    page = await context.newPage();
    page.setDefaultTimeout(10_000);

    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.clock.setFixedTime(new Date('2026-11-19T09:00:00'));

    await scenario('onboarding: search, select group, today band', async () => {
      await resetStorage();
      await goto('/');
      await page.waitForURL('**/search');
      await page.getByRole('searchbox').fill('юсс');
      await page.waitForSelector('.result-row');
      assert.equal(await count('.result-row'), 2);
      assert.match(await text('.group-name'), /Группы/);
      await page.locator('.result-row').first().click();
      await page.waitForURL('**/g/472/today');
      assert.equal(await text('.m-group-name'), 'ЮСС-003-О-02');
      assert.equal(await text('.now-chip'), 'сейчас');
      assert.equal(await text('.now-subject'), 'Математический анализ');
      assert.equal(await text('.now-left'), 'до конца 80 мин');
      assert.match(await text('.section-note'), /3 пары и 1 окно/);
      assert.match(
        await page.evaluate(() => localStorage.getItem('setka-preferences') || ''),
        /"id":472/,
      );
      await screenshot('01-today');
    });

    await scenario('short group link redirects by viewport', async () => {
      await goto('/g/472');
      await page.waitForURL('**/g/472/today');
      await page.setViewportSize({ width: 1440, height: 900 });
      await goto('/g/472');
      await page.waitForURL('**/g/472/week');
      await page.setViewportSize({ width: 390, height: 844 });
      await goto('/g/472/today');
      await page.waitForSelector('.now-detail');
    });

    await scenario('navigation cross-fades through a view transition', async () => {
      await goto('/g/472/today');
      await page.evaluate(() => {
        const view = window;
        view.__vtCount = 0;
        if (typeof document.startViewTransition === 'function') {
          const original = document.startViewTransition.bind(document);
          document.startViewTransition = (callback) => {
            view.__vtCount += 1;
            return original(callback);
          };
        }
      });
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.querySelector('#content')).viewTransitionName),
        'page',
      );
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.querySelector('.bottom-nav')).viewTransitionName),
        'app-nav',
      );
      await page.locator('.bn-item', { hasText: 'Неделя' }).click();
      await page.waitForURL('**/g/472/week');
      assert.equal(await page.evaluate(() => window.__vtCount), 1);
      await page.locator('.bn-item', { hasText: 'Изменения' }).click();
      await page.waitForURL('**/g/472/changes');
      assert.equal(await page.evaluate(() => window.__vtCount), 2);
      await goto('/g/472/today');
    });

    await scenario('sheet closes smoothly before its links navigate', async () => {
      await goto('/g/472/week');
      await page.locator('.wrow').first().click();
      await page.waitForSelector('dialog.sheet[open]');
      await page.locator('dialog.sheet a').first().click();
      await page.waitForSelector('dialog.sheet.is-closing');
      await page.waitForURL('**/search?q=*');
      await goto('/g/472/today');
      await page.waitForSelector('.now-detail');
    });

    await scenario('today: detail sheet and day switching', async () => {
      await page.locator('.now-detail').click();
      await page.waitForSelector('dialog.sheet[open]');
      assert.equal(await text('.sheet-title'), '1 пара · 08:45–10:20');
      assert.match(await text('.sheet-sub'), /Четверг, 19 ноября · 1 занятие/);
      await page.locator('.sheet-close').click();
      await waitForSheetClosed();

      await page.locator('.day-cell').nth(2).click();
      await page.waitForURL(/day=2026-11-18/);
      await waitForText('.now-subject', 'Среда');
      await waitForText('.now-left', 'первая пара в 08:45');
      await waitForText('.section-note', 'до 17:50');
      await page.locator('.lesson-btn').first().click();
      await page.waitForSelector('dialog.sheet[open]');
      assert.match(await text('.sheet-sub'), /Среда, 18 ноября/);
      await page.locator('.sheet-close').click();
      await screenshot('02-today-other-day');
    });

    await scenario('today: passed lessons stay visible', async () => {
      await goto('/g/472/today?day=2026-11-19&now=13:00');
      await page.waitForSelector('.lesson-btn.is-past');
      assert.equal(await text('.section-title >> nth=1'), 'Уже прошли');
      assert.equal(await count('.lesson-btn.is-past'), 1);
      assert.match(await text('.lesson-btn.is-past'), /Математический анализ/);
      assert.match(await text('.now-subject'), /Программирование/);
    });

    await scenario('today: automatically shows the next day in the evening', async () => {
      await goto('/g/472/today?now=19:00');
      await page.waitForSelector('.next-day-note');
      assert.match(await text('.next-day-note'), /Показано расписание на 20 ноября/);
      assert.equal(await text('.now-subject'), 'Пятница');
      assert.equal(
        await page.locator('.day-cell[aria-pressed="true"] .day-num').textContent(),
        '20',
      );
      await page.getByRole('button', { name: 'Показать сегодня' }).click();
      await waitForText('.next-day-note', /Показано расписание на сегодня/);
      assert.equal(await text('.now-subject'), 'Четверг');
      await page.getByRole('button', { name: /Показать 20 ноября/ }).click();
      await waitForText('.now-subject', 'Пятница');
    });

    await scenario('auditory map: free rooms and room link', async () => {
      await goto('/map');
      await page.waitForSelector('.map-room');
      assert.match(await text('.map-summary'), /свободно 2 из 3/);
      const free = page.locator('.map-room').filter({ hasText: '4-112' });
      assert.match(await free.locator('.map-room-state').textContent(), /свободна/);
      const busy = page.locator('.map-room').filter({ hasText: '4-313' });
      assert.match(await busy.locator('.map-room-state').textContent(), /занята/);
      await free.click();
      await page.waitForURL('**/auditory/3311');
      await waitForText('.entity-title', '4-112');
      await page.waitForSelector('.entity-status');
    });

    await scenario('week: list, ranges and empty week', async () => {
      await goto('/g/472/week?week_start=2026-11-16');
      assert.equal(await text('.week-range'), '16–21 ноября');
      assert.equal(await count('.wday'), 6);
      assert.equal(await count('.wrow-btn'), 21);
      await page.getByRole('button', { name: 'Следующая неделя' }).click();
      await page.waitForURL(/week_start=2026-11-23/);
      await waitForText('.week-range', '23–28 ноября');
      assert.equal(await count('.wday'), 6);
      assert.equal(await count('.wrow-btn'), 0);
      await screenshot('03-week-empty');
      await page.getByRole('button', { name: 'Предыдущая неделя' }).click();
      await page.waitForURL(/week_start=2026-11-16/);
      await waitForText('.week-range', '16–21 ноября');
    });

    await scenario('week: deep link opens the pair sheet', async () => {
      await goto('/g/472/week?week_start=2026-11-16&day=2026-11-18&slot=4');
      await page.waitForSelector('dialog.sheet[open]');
      assert.equal(await text('.sheet-title'), '4 пара · 14:30–16:05');
      assert.equal(await text('.sheet-sub'), 'Среда, 18 ноября · 2 занятия');
      assert.doesNotMatch(page.url(), /slot=/);
      await page.locator('.sheet-close').click();
    });

    await scenario('subgroup: filters lessons and resets from settings', async () => {
      await setSubgroup('1');
      await goto('/g/472/today?day=2026-11-18');
      assert.match(await text('.m-group-label'), /подгруппа 1/);
      const subjects = await page.locator('.lesson-btn .subject').allTextContents();
      assert.ok(subjects.includes('Базы данных'), subjects.join(', '));
      assert.ok(!subjects.includes('Иностранный язык'), subjects.join(', '));
      await setSubgroup('');
    });

    await scenario('search: tutor page and back link', async () => {
      await goto('/search?q=иван');
      await page.waitForSelector('.result-row');
      assert.equal(await text('.result-type'), 'преподаватель');
      await page.locator('.result-row').first().click();
      await page.waitForURL('**/tutor/15');
      await waitForText('.entity-title', 'Иванов Иван Иванович');
      await waitForText('.entity-meta', /преподаватель · 4 пары на этой неделе/);
      assert.ok((await count('.wday')) >= 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
      assert.equal(await text('.back-link'), 'К расписанию группы');
      await screenshot('04-tutor');
    });

    await scenario('auditory page', async () => {
      await goto('/auditory/3310');
      await waitForText('.entity-title', '4-308');
      await waitForText('.entity-meta', /аудитория · корпус 4 · 6 пар на этой неделе/);
    });

    await scenario('changes: own group, all groups and deep links', async () => {
      await goto('/g/472/changes');
      assert.equal(await text('.change-day-head'), 'Изменения на 18 ноября');
      const ownArticle = page.locator('.change-item').filter({ hasText: 'Математический анализ' });
      assert.equal(
        await ownArticle.locator('.change-open').getAttribute('href'),
        '/g/472/week?week_start=2026-11-16&day=2026-11-18&slot=2',
      );
      await page.getByRole('button', { name: 'Все группы' }).click();
      const otherArticle = page.locator('.change-item').filter({ hasText: 'Иностранный язык' });
      await otherArticle.waitFor();
      assert.equal(
        await otherArticle.locator('.change-open').getAttribute('href'),
        '/g/468/week?week_start=2026-11-16&day=2026-11-17&slot=3',
      );
      assert.match(await otherArticle.textContent(), /2-я подгруппа/);
      const legacyArticle = page.locator('.change-item').filter({ hasText: 'Правовое регулирование' });
      await legacyArticle.waitFor();
      assert.match(await legacyArticle.textContent(), /Вишнякова Марина Анатольевна/);
      assert.match(await legacyArticle.textContent(), /4-101/);
      assert.match(await legacyArticle.textContent(), /5/);
      await screenshot('05-changes-all');
    });

    await scenario('settings: theme, subgroup and digest selectors, unsubscribe', async () => {
      await seedToken();
      await goto('/g/472/settings');
      await page.waitForSelector('#digest-hour');
      assert.equal(await page.locator('#digest-hour').inputValue(), '19');
      assert.equal(await page.locator('#digest-minute').inputValue(), '00');
      const subgroupButtons = page.getByRole('group', { name: 'Моя подгруппа' }).getByRole('button');
      assert.equal(await subgroupButtons.count(), 3);
      await page.getByRole('button', { name: '2-я подгруппа' }).click();
      await page.getByRole('button', { name: 'Все подгруппы' }).click();

      await page.getByRole('button', { name: 'Тёмная' }).click();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
      await screenshot('06-settings-dark');
      await page.getByRole('button', { name: 'Светлая' }).click();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');

      await page.locator('#digest-hour').selectOption('20');
      await page.locator('#digest-minute').selectOption('15');
      await page.waitForFunction(() => document.querySelector('.autosave')?.textContent === 'Сохранено');
      const stateAfterPatch = await (await fetch(`http://127.0.0.1:${MOCK_PORT}/__state`)).json();
      const lastPatch = stateAfterPatch.patch.at(-1) || {};
      assert.equal(lastPatch.digest_time, '20:15');

      await page.getByRole('button', { name: 'Отписаться от группы' }).click();
      await page.getByRole('button', { name: /Нажмите ещё раз/ }).click();
      await page.waitForFunction(() => document.querySelector('.autosave')?.textContent === 'Вы отписаны от группы.');
      const stateAfterUnsub = await (await fetch(`http://127.0.0.1:${MOCK_PORT}/__state`)).json();
      assert.equal(stateAfterUnsub.unsubscribe.length, 1);
      assert.equal(stateAfterUnsub.unsubscribe[0].entity_id, 472);
    });

    await scenario('notifications: permission sheet appears after enabling', async () => {
      await page.evaluate(() => localStorage.removeItem('setka-fcm-token'));
      await goto('/g/472/settings');
      await page.getByRole('checkbox', { name: 'Напоминание перед парой' }).click();
      await page.waitForSelector('dialog.permission-sheet[open]', { timeout: 4000 });
      assert.match(await text('.permission-sheet .sheet-title'), /Уведомления для/);
      await page.getByRole('button', { name: 'Позже' }).click();
      await page.waitForFunction(() => !document.querySelector('dialog.permission-sheet')?.open);
    });

    await scenario('tutor page works without a saved group', async () => {
      await resetStorage();
      await goto('/tutor/15');
      await waitForText('.entity-title', 'Иванов Иван Иванович');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
      assert.equal(await count('.bottom-nav'), 0);
      assert.match(await text('.back-link'), /К расписанию группы/);
      assert.ok(await page.locator('.m-top a.brand').isVisible());
    });

    await scenario('not found page', async () => {
      await goto('/nope');
      assert.equal(await page.locator('.fatal h1').textContent(), 'Страница не найдена');
    });

    await scenario('desktop: week grid, aside and redirect', async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await goto('/g/472/today');
      await page.waitForURL('**/g/472/week');
      assert.equal(await count('.wk-head'), 6);
      assert.equal(await count('.wk-time'), 8);
      assert.match(await text('.desk-sub'), /на неделе/);
      assert.ok(await page.locator('.aside').isVisible());
      await page.locator('.wk-item').first().click();
      await page.waitForSelector('dialog.sheet[open]');
      const dialogBox = await page.locator('dialog.sheet').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, width: rect.width, viewport: window.innerHeight };
      });
      assert.ok(dialogBox.top > 32, `modal top is ${dialogBox.top}`);
      assert.ok(dialogBox.bottom < dialogBox.viewport - 32, `modal bottom is ${dialogBox.bottom}`);
      assert.ok(Math.abs((dialogBox.top + dialogBox.bottom) / 2 - dialogBox.viewport / 2) < 60);
      assert.ok(dialogBox.width <= 560);
      await page.locator('.sheet-close').click();
      await screenshot('07-desktop-week');

      await goto('/g/472/settings');
      assert.ok(await page.locator('.desk-page .settings-group').isVisible());
      await goto('/search?q=юсс');
      await page.waitForSelector('.result-row');
      assert.equal(await count('.result-row'), 2);
      await screenshot('08-desktop-search');
      await page.setViewportSize({ width: 390, height: 844 });
    });

    await scenario('offline: banner appears', async () => {
      await goto('/g/472/week?week_start=2026-11-16');
      await context.setOffline(true);
      await page.waitForSelector('.offline-bar', { timeout: 5000 });
      assert.match(await text('.offline-bar'), /Нет сети/);
      await page.screenshot({ path: join(ARTIFACTS, '09-offline.png') }).catch(() => {});
      await context.setOffline(false);
      consoleErrors.length = 0; // network errors are expected while offline
    });
  } finally {
    await browser?.close().catch(() => {});
    shutdown();
  }

  const failed = results.filter((item) => !item.ok);
  const unexpectedConsole = consoleErrors.filter(
    (message) => !/favicon|Firebase|Download the React DevTools|net::ERR/i.test(message),
  );

  console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
  if (unexpectedConsole.length) {
    console.log('\nConsole errors:');
    for (const message of unexpectedConsole) console.log(`  - ${message}`);
  }
  if (pageErrors.length) {
    console.log('\nPage errors:');
    for (const message of pageErrors) console.log(`  - ${message}`);
  }
  if (failed.length || unexpectedConsole.length || pageErrors.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
