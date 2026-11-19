// Integration smoke against a real omsu_setka backend.
//
//   REAL_API=http://127.0.0.1:8080 npm run test:real-api
//
// Starts Vite on E2E_REAL_APP_PORT (15175) with /api proxied to REAL_API and
// checks the live BFF contract plus the main UI flows on real data.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const API_ORIGIN = (process.env.REAL_API || 'http://127.0.0.1:8080').replace(/\/$/, '');
const API = `${API_ORIGIN}/api/v1`;
const APP_PORT = Number(process.env.E2E_REAL_APP_PORT || 15175);
const BASE = `http://127.0.0.1:${APP_PORT}`;

function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
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
      for (const sub of ['chrome-linux64', 'chrome-linux']) {
        const binary = join(cache, build, sub, 'chrome');
        if (existsSync(binary)) return binary;
      }
    }
  }
  throw new Error('Chromium not found. Set CHROME_PATH.');
}

async function waitForHttp(url, timeout = 25_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`GET ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function mondayISO(date = new Date()) {
  const copy = new Date(date);
  const weekday = copy.getDay() || 7;
  copy.setDate(copy.getDate() - weekday + 1);
  return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, '0')}-${String(copy.getDate()).padStart(2, '0')}`;
}

function lessonCount(days) {
  return (days || []).reduce((sum, day) => sum + (day.lessons?.length || 0), 0);
}

async function findGroupWithSchedule(groups, weekStart) {
  // Higher dictionary ids are the current (2026) cohorts; older ids often
  // only have historical schedules.
  const queue = groups.slice().sort((a, b) => b.id - a.id).slice(0, 80);
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const group = queue.shift();
      const response = await api(`/schedule/group/${group.id}?week_start=${weekStart}`).catch(() => null);
      if (lessonCount(response?.data)) return { group, days: response.data };
    }
    return null;
  });
  const results = await Promise.all(workers);
  return results.find(Boolean) || null;
}

async function findTutorWithSchedule(tutors, weekStart) {
  for (const tutor of tutors.slice(0, 10)) {
    const response = await api(`/schedule/tutor/${tutor.id}?week_start=${weekStart}`).catch(() => null);
    if (lessonCount(response?.data)) return { tutor, days: response.data };
  }
  return null;
}

const results = [];
async function scenario(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`  FAIL ${name}: ${error.message}`);
  }
}

async function main() {
  console.log(`\nreal backend smoke → ${API} (app ${BASE})`);
  const vite = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'],
    {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'ignore'],
      env: { ...process.env, VITE_PROXY_TARGET: API_ORIGIN, BROWSER: 'none' },
    },
  );
  const shutdown = () => {
    if (vite && !vite.killed) vite.kill('SIGTERM');
  };
  process.on('exit', shutdown);

  try {
    await waitForHttp(BASE);
      const health = await api('/health');
    assert.equal(health.success, true);
    assert.equal(health.data.upstream.healthy, true);

    const weekStart = mondayISO();
    const groupsResponse = await api('/groups');
    const groups = groupsResponse.data || [];
    assert.ok(groups.length > 100, `expected a populated dictionary, got ${groups.length} groups`);

    const discovery = await findGroupWithSchedule(groups, weekStart);
    if (!discovery) throw new Error(`no group has lessons in ${weekStart}; upstream returned no current data`);
    const { group, days } = discovery;
    console.log(`  using group ${group.name} (dict id ${group.id}), ${lessonCount(days)} lessons this week`);

    await scenario('dictionary, search and schedule use the dictionary group id', async () => {
      const search = await api(`/search?q=${encodeURIComponent(group.name.slice(0, 6))}&type=all`);
      assert.ok(search.success);
      assert.ok(search.data.groups.some((item) => item.id === group.id), 'search must return the group by dict id');

      const week = await api(`/schedule/group/${group.id}?week_start=${weekStart}`);
      assert.ok(Array.isArray(week.data));
      assert.ok(lessonCount(week.data) > 0, 'schedule for the dict id must contain lessons');
      const own = week.data
        .flatMap((day) => day.lessons)
        .filter((lesson) => lesson.group === group.name).length;
      assert.ok(own > 0, `lessons must belong to ${group.name}, got other groups`);

      const day = week.data.find((item) => item.lessons.length);
      assert.match(day.day, /^\d{2}\.\d{2}\.\d{4}$/);
      assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/);
      const lesson = day.lessons[0];
      for (const field of ['id', 'time', 'lesson', 'type_work', 'teacher', 'group', 'auditCorps']) {
        assert.ok(lesson[field] !== undefined, `lesson.${field} is missing`);
      }
    });

    await scenario('tutor and auditory schedules respond', async () => {
      const tutors = (await api('/tutors')).data || [];
      const tutor = await findTutorWithSchedule(tutors, weekStart);
      assert.ok(tutor, 'expected at least one tutor with lessons this week');
      assert.ok(lessonCount(tutor.days) > 0);

      const auditors = (await api('/auditories')).data || [];
      const auditor = auditors[0];
      const auditWeek = await api(`/schedule/auditory/${auditor.id}?week_start=${weekStart}`);
      assert.ok(Array.isArray(auditWeek.data));
    });

    const token = `real-qa-${Date.now()}`;
    await scenario('subscribe, settings PATCH, unsubscribe', async () => {
      const subscribed = await api('/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          fcm_token: token,
          entity_type: 'group',
          entity_id: group.id,
          subgroup: '',
          notify_daily_digest: true,
          digest_time: '19:00',
          timezone: 'Asia/Omsk',
        }),
      });
      assert.equal(subscribed.success, true);

      const settings = await api(`/notifications/settings/group/${group.id}`, {
        headers: { 'X-FCM-Token': token },
      });
      assert.equal(settings.entity_id, group.id);

      await api('/notifications/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          fcm_token: token,
          entity_type: 'group',
          entity_id: group.id,
          digest_time: '20:15',
          notify_before_lesson: true,
          before_minutes: 15,
        }),
      });
      const patched = await api(`/notifications/settings/group/${group.id}`, {
        headers: { 'X-FCM-Token': token },
      });
      assert.equal(patched.digest_time, '20:15');
      assert.equal(patched.notify_before_lesson, true);
      assert.equal(patched.before_minutes, 15);
      assert.equal(patched.timezone, 'Asia/Omsk');

      await api('/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ fcm_token: token, entity_type: 'group', entity_id: group.id }),
      });
    });

    await scenario('changes feed contract', async () => {
      const feed = await api(`/changes?entity_type=group&entity_id=${group.id}&limit=5`);
      assert.ok(Array.isArray(feed.data.items));
      assert.equal(typeof feed.data.next_before_id, 'number');
    });

    await scenario('UI: search selects the real group and renders its week', async () => {
      const executablePath = findChromium();
      const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
        const errors = [];
        page.on('console', (message) => {
          if (message.type() === 'error' && !/favicon|Firebase/.test(message.text())) {
            errors.push(message.text());
          }
        });
        page.on('pageerror', (error) => errors.push(error.message));

        await page.goto(`${BASE}/search?q=${encodeURIComponent(group.name.slice(0, 6))}`, {
          waitUntil: 'networkidle',
          timeout: 20_000,
        });
        const row = page.locator('.result-row').filter({ hasText: group.name }).first();
        await row.waitFor({ timeout: 10_000 });
        await row.click();
        await page.waitForURL(`**/g/${group.id}/today`);
        assert.equal((await page.locator('.m-group-name').textContent())?.trim(), group.name);

        await page.goto(`${BASE}/g/${group.id}/week?week_start=${weekStart}`, {
          waitUntil: 'networkidle',
          timeout: 20_000,
        });
        assert.equal(await page.locator('.wday').count(), 6);
        const rendered = await page.locator('.wrow-btn').count();
        assert.ok(rendered > 0, 'week view must render lesson rows from the real schedule');

        await page.locator('.wrow-btn').first().click();
        await page.waitForSelector('dialog.sheet[open]');
        assert.ok((await page.locator('.sheet-title').textContent()).includes('пара'));

        assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
      } finally {
        await browser.close();
      }
    });

    const failed = results.filter((item) => !item.ok);
    console.log(`\n${results.length - failed.length}/${results.length} real-backend checks passed`);
    if (failed.length) process.exitCode = 1;
  } finally {
    shutdown();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
