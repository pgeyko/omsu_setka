// Deterministic mock of the BFF API for the browser smoke tests.
// Dates are fixed to the week 2026-11-16..21; the browser clock is frozen
// to 2026-11-19T09:00 in the runner, so "today" is Thursday.
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] || 18082);

const TIME = {
  1: ['08:45', '10:20'],
  2: ['10:30', '12:05'],
  3: ['12:45', '14:20'],
  4: ['14:30', '16:05'],
  5: ['16:15', '17:50'],
  6: ['18:00', '19:35'],
};

const groups = [
  { id: 472, name: 'ЮСС-003-О-02', real_group_id: 12246 },
  { id: 468, name: 'ЮСС-002-О-01', real_group_id: 12190 },
];
const tutors = [{ id: 15, name: 'Иванов Иван Иванович' }];
const auditories = [{ id: 3310, name: '4-308', building: '4' }];

function lesson(id, pair, subject, kind, room, teacher, options = {}) {
  const [building, number] = room.split('-');
  return {
    id,
    time: pair,
    faculty: 'ФМС',
    lesson: subject,
    type_work: kind,
    teacher,
    group: options.group || 'ЮСС-003-О-02',
    auditCorps: room,
    building,
    room: number,
    publishDate: '2026-11-10',
    ...(options.subgroup
      ? { subgroupName: `${options.group || 'ЮСС-003-О-02'}/${options.subgroup}`, subgroup_number: String(options.subgroup) }
      : {}),
  };
}

const days = [
  {
    day: '16.11.2026',
    date: '2026-11-16',
    lessons: [
      lesson(101, 1, 'Физика', 'Лек', '1-102', 'Смирнова А. П.'),
      lesson(102, 2, 'Математический анализ', 'Прак', '1-102', 'Иванов Иван Иванович'),
      lesson(103, 4, 'Программирование', 'Лаб', '4-308', 'Кузнецов Д. С.'),
      lesson(104, 5, 'История России', 'Сем', '11-204', 'Петрова Е. В.'),
    ],
  },
  {
    day: '17.11.2026',
    date: '2026-11-17',
    lessons: [
      lesson(201, 2, 'Теория вероятностей', 'Лек', '6-115', 'Смирнова А. П.'),
      lesson(202, 3, 'Иностранный язык', 'Прак', '11-204', 'Орлова Н. С.'),
      lesson(203, 4, 'Базы данных', 'Лек', '4-308', 'Кузнецов Д. С.'),
    ],
  },
  {
    day: '18.11.2026',
    date: '2026-11-18',
    lessons: [
      lesson(301, 1, 'Физика', 'Лек', '1-102', 'Смирнова А. П.'),
      lesson(302, 2, 'Математический анализ', 'Прак', '1-102', 'Иванов Иван Иванович'),
      lesson(303, 4, 'Базы данных', 'Лаб', '4-308', 'Кузнецов Д. С.', { subgroup: 1 }),
      lesson(304, 4, 'Иностранный язык', 'Прак', '11-204', 'Орлова Н. С.', { subgroup: 2 }),
      lesson(305, 5, 'История России', 'Сем', '11-204', 'Петрова Е. В.'),
    ],
  },
  {
    day: '19.11.2026',
    date: '2026-11-19',
    lessons: [
      lesson(401, 1, 'Математический анализ', 'Прак', '1-102', 'Иванов Иван Иванович'),
      lesson(402, 3, 'Программирование', 'Лек', '4-308', 'Кузнецов Д. С.'),
      lesson(403, 4, 'История России', 'Лек', '11-204', 'Петрова Е. В.'),
      lesson(404, 5, 'Физическая культура', 'Прак', '6-115', 'Белов С. Н.'),
    ],
  },
  {
    day: '20.11.2026',
    date: '2026-11-20',
    lessons: [
      lesson(501, 2, 'Теория вероятностей', 'Прак', '6-115', 'Смирнова А. П.'),
      lesson(502, 3, 'Иностранный язык', 'Прак', '11-204', 'Орлова Н. С.'),
      lesson(503, 4, 'Базы данных', 'Лаб', '4-308', 'Кузнецов Д. С.', { subgroup: 2 }),
      lesson(504, 6, 'История России', 'Сем', '11-204', 'Петрова Е. В.'),
    ],
  },
  {
    day: '21.11.2026',
    date: '2026-11-21',
    lessons: [
      lesson(601, 1, 'Консультация по курсовой', 'Конс', '4-308', 'Кузнецов Д. С.'),
      lesson(602, 2, 'Математический анализ', 'Лек', '1-102', 'Иванов Иван Иванович'),
    ],
  },
];

const changes = [
  {
    id: 1,
    entity_type: 'group',
    entity_id: 472,
    change_type: 'modified',
    lesson_id: 302,
    day: '2026-11-18',
    pair: 2,
    subgroup: '',
    subject: 'Математический анализ',
    changes: [{ field: 'teacher', label: 'преподаватель', old: 'Сидоров А. В.', new: 'Иванов Иван Иванович' }],
    created_at: '2026-11-18T06:30:00Z',
  },
  {
    id: 2,
    entity_type: 'group',
    entity_id: 468,
    change_type: 'modified',
    lesson_id: 202,
    day: '2026-11-17',
    pair: 3,
    subgroup: '2',
    subject: 'Иностранный язык',
    changes: [{ field: 'auditCorps', label: 'аудитория', old: '11-201', new: '11-204' }],
    created_at: '2026-11-18T06:20:00Z',
  },
  {
    id: 3,
    entity_type: 'group',
    entity_id: 472,
    change_type: 'removed',
    lesson_id: 201,
    day: '2026-11-17',
    pair: 2,
    subgroup: '',
    subject: 'Теория вероятностей',
    changes: [],
    created_at: '2026-11-18T06:40:00Z',
  },
];

const state = {
  patch: [],
  subscribe: [],
  unsubscribe: [],
  settings: {
    fcm_token: 'e2e-token',
    entity_type: 'group',
    entity_id: 472,
    notify_on_change: true,
    notify_daily_digest: true,
    digest_time: '19:00',
    notify_before_lesson: false,
    before_minutes: 30,
    timezone: 'Asia/Omsk',
    subgroup: '',
  },
};

function bff(data, source = 'cache') {
  return {
    success: true,
    data,
    cached_at: '2026-11-19T03:00:00Z',
    source,
    week_start: '2026-11-16',
    week_end: '2026-11-21',
    has_prev: true,
    has_next: true,
  };
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

function weekFrom(start) {
  if (start === '2026-11-16') return days;
  if (start === '2026-11-23') return [];
  return days;
}

function tutorWeek() {
  return days
    .map((day) => ({
      ...day,
      lessons: day.lessons.filter((item) => item.teacher?.includes('Иванов')),
    }))
    .filter((day) => day.lessons.length);
}

function auditoryWeek() {
  return days
    .map((day) => ({
      ...day,
      lessons: day.lessons.filter((item) => item.auditCorps === '4-308'),
    }))
    .filter((day) => day.lessons.length);
}

function searchAll(query) {
  const q = query.trim().toLowerCase();
  const pick = (items) => items.filter((item) => item.name.toLowerCase().startsWith(q));
  return {
    groups: pick(groups).map((item) => ({ ...item, type: 'group' })),
    tutors: pick(tutors).map((item) => ({ ...item, type: 'tutor' })),
    auditories: pick(auditories).map((item) => ({ ...item, type: 'auditory' })),
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = url.pathname;
  const q = url.searchParams;

  if (path === '/__state') return send(res, 200, state);
  if (path === '/__reset') {
    state.patch = [];
    state.subscribe = [];
    state.unsubscribe = [];
    return send(res, 200, { ok: true });
  }

  if (path === '/api/v1/groups') return send(res, 200, bff(groups));
  if (path === '/api/v1/tutors') return send(res, 200, bff(tutors));
  if (path === '/api/v1/auditories') return send(res, 200, bff(auditories));

  if (path.startsWith('/api/v1/tutors/')) {
    const id = Number(path.split('/').pop());
    const tutor = tutors.find((item) => item.id === id) || tutors[0];
    return send(res, 200, bff(tutor));
  }
  if (path.startsWith('/api/v1/auditories/')) {
    const id = Number(path.split('/').pop());
    const auditory = auditories.find((item) => item.id === id) || auditories[0];
    return send(res, 200, bff(auditory));
  }

  if (path === '/api/v1/search') {
    if ((q.get('q') || '').trim().length < 2) {
      return send(res, 400, { error: 'query too short' });
    }
    return send(res, 200, bff(searchAll(q.get('q') || '')));
  }

  if (path.startsWith('/api/v1/schedule/group/')) {
    return send(res, 200, bff(weekFrom(q.get('week_start') || '2026-11-16')));
  }
  if (path.startsWith('/api/v1/schedule/tutor/')) {
    return send(res, 200, bff(tutorWeek()));
  }
  if (path.startsWith('/api/v1/schedule/auditory/')) {
    return send(res, 200, bff(auditoryWeek()));
  }

  if (path === '/api/v1/changes') {
    if (q.get('scope') === 'all') {
      return send(res, 200, bff({ items: changes, next_before_id: 0 }));
    }
    const type = q.get('entity_type');
    const id = Number(q.get('entity_id') || 0);
    const items = changes.filter(
      (item) =>
        (type ? item.entity_type === type : true) && (id ? item.entity_id === id : true),
    );
    return send(res, 200, bff({ items, next_before_id: 0 }));
  }

  if (path === '/api/v1/health') {
    return send(
      res,
      200,
      bff(
        {
          status: 'ok',
          uptime: '1h',
          upstream: { healthy: true, consecutive_failures: 0, total_failures: 0 },
          last_sync: { dictionaries: '2026-11-19T03:00:00Z', schedules: '2026-11-19T03:00:00Z' },
          cache: { hits: 1, misses: 0, item_count: 1 },
        },
        'upstream',
      ),
    );
  }

  if (path.startsWith('/api/v1/notifications/settings/')) {
    if (!req.headers['x-fcm-token']) return send(res, 400, { error: 'missing token' });
    return send(res, 200, state.settings);
  }

  if (path === '/api/v1/notifications/settings' && req.method === 'PATCH') {
    const body = await readBody(req);
    state.patch.push(body);
    Object.assign(state.settings, body);
    return send(res, 200, { status: 'updated' });
  }

  if (path === '/api/v1/subscribe' && req.method === 'POST') {
    const body = await readBody(req);
    state.subscribe.push(body);
    return send(res, 200, { success: true });
  }
  if (path === '/api/v1/unsubscribe' && req.method === 'POST') {
    const body = await readBody(req);
    state.unsubscribe.push(body);
    return send(res, 200, { success: true });
  }
  if (path === '/api/v1/subscriptions') {
    return send(res, 200, bff([state.settings], 'database'));
  }

  return send(res, 404, { error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock api on http://127.0.0.1:${PORT}`);
});
