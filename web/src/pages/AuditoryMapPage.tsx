import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLink } from '../components/AppLink';
import { ChevronRight, MapPin } from 'lucide-react';
import { useAuditoryMap, useBuildings } from '../api/queries';
import { usePageMeta } from '../lib/usePageMeta';
import { addDaysISO, nextSchoolDay } from '../lib/date';
import { TIME_SLOTS, todayISO } from '../lib/schedule';
import type { AuditoryMapRoom } from '../api/types';

function currentPair(): number {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  for (const [pair, times] of Object.entries(TIME_SLOTS)) {
    const [sh, sm] = times.start.split(':').map(Number);
    const [eh, em] = times.end.split(':').map(Number);
    if (minutes >= sh * 60 + sm && minutes < eh * 60 + em) return Number(pair);
  }
  for (const [pair, times] of Object.entries(TIME_SLOTS)) {
    const [sh, sm] = times.start.split(':').map(Number);
    if (sh * 60 + sm > minutes) return Number(pair);
  }
  return 1;
}

function dateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
}

function timeLabel(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function AuditoryMapPage() {
  usePageMeta('Аудитории — сетка', 'Свободные и занятые аудитории ОмГУ по корпусам, дням и парам.');
  const [params, setParams] = useSearchParams();
  const buildingsQuery = useBuildings();
  const today = todayISO();

  const buildings = useMemo(
    () => [...(buildingsQuery.data?.buildings || [])].sort((a, b) => a.building.localeCompare(b.building, 'ru', { numeric: true })),
    [buildingsQuery.data],
  );
  const building = params.get('building') || buildings.find((item) => item.building === '4')?.building || buildings[0]?.building || '4';
  const dateParam = params.get('date') || today;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;
  const pairParam = Number(params.get('pair'));
  const pair = pairParam >= 1 && pairParam <= 8 ? pairParam : currentPair();
  const map = useAuditoryMap(building, date);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  const floors = useMemo(() => {
    const grouped = new Map<number, AuditoryMapRoom[]>();
    (map.data?.rooms || []).forEach((room) => {
      const list = grouped.get(room.floor) || [];
      list.push(room);
      grouped.set(room.floor, list);
    });
    return [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([floor, rooms]) => [floor, rooms.sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }))] as const);
  }, [map.data]);

  const freeCount = map.data?.rooms.filter((room) => !room.busy.includes(pair)).length || 0;
  const total = map.data?.rooms.length || 0;
  const updated = timeLabel(map.data?.updated_at);
  const tomorrow = addDaysISO(today, 1);
  const nextSchool = nextSchoolDay(today);

  return (
    <div className="map-page">
      <div className="page-head map-head">
        <div>
          <h1 className="page-title">Аудитории</h1>
          <p className="page-sub">Свободные и занятые комнаты по корпусам</p>
        </div>
        {map.data?.stale ? <span className="map-stale">данные устарели</span> : null}
      </div>

      <div className="map-controls">
        <div className="map-label">Корпус</div>
        <div className="map-buildings" role="group" aria-label="Корпус">
          {buildings.map((item) => (
            <button
              key={item.building}
              className="map-chip"
              type="button"
              aria-pressed={item.building === building}
              onClick={() => update('building', item.building)}
            >
              {item.building}
            </button>
          ))}
        </div>

        <div className="map-label">День</div>
        <div className="map-days" role="group" aria-label="День">
          <button className="map-chip" type="button" aria-pressed={date === today} onClick={() => update('date', today)}>
            Сегодня
          </button>
          <button className="map-chip" type="button" aria-pressed={date === tomorrow} onClick={() => update('date', tomorrow)}>
            Завтра
          </button>
          {nextSchool !== tomorrow ? (
            <button
              className="map-chip"
              type="button"
              aria-pressed={date === nextSchool}
              onClick={() => update('date', nextSchool)}
            >
              {dateLabel(nextSchool)}
            </button>
          ) : null}
          <input
            className="map-date"
            type="date"
            aria-label="Дата"
            value={date}
            min={today}
            max={addDaysISO(today, 14)}
            onChange={(event) => event.target.value && update('date', event.target.value)}
          />
        </div>

        <div className="map-label">Пара</div>
        <div className="map-pairs" role="group" aria-label="Пара">
          {Object.entries(TIME_SLOTS).map(([number, times]) => (
            <button
              key={number}
              className="map-pair"
              type="button"
              aria-pressed={Number(number) === pair}
              onClick={() => update('pair', number)}
            >
              <b>{number}</b>
              <span>{times.start}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="map-summary">
        <span>
          {dateLabel(date)} · {pair} пара
        </span>
        {total ? (
          <span>
            свободно <b>{freeCount}</b> из {total}
          </span>
        ) : null}
      </div>

      {map.isLoading ? (
        <div className="map-rooms" aria-label="Загрузка карты">
          {Array.from({ length: 6 }, (_, index) => <div className="map-room-skeleton" key={index} />)}
        </div>
      ) : null}

      {map.isError ? (
        <div className="retry-wrap">
          <p>Не удалось загрузить карту аудиторий.</p>
          <button className="retry-btn" type="button" onClick={() => map.refetch()}>Повторить</button>
        </div>
      ) : null}

      {!map.isLoading && !map.isError && map.data && !map.data.ready ? (
        <p className="empty-search">Карта ещё готовится. Данные появятся после ближайшей синхронизации.</p>
      ) : null}

      {!map.isLoading && !map.isError && map.data?.ready && !total ? (
        <p className="empty-search">Для этого корпуса нет данных.</p>
      ) : null}

      {!map.isLoading && !map.isError && map.data?.ready ? floors.map(([floor, rooms]) => (
        <section className="map-floor" key={floor} aria-label={`Этаж ${floor}`}>
          <div className="map-floor-head">
            <span>{floor} этаж</span>
            <span>{rooms.filter((room) => !room.busy.includes(pair)).length} свободно</span>
          </div>
          <div className="map-rooms">
            {rooms.map((room) => {
              const busy = room.busy.includes(pair);
              return (
                <AppLink
                  key={room.id}
                  className={`map-room${busy ? ' is-busy' : ''}`}
                  to={`/auditory/${room.id}`}
                  aria-label={`${room.name}, ${busy ? 'занята' : 'свободна'}`}
                >
                  <span className="map-room-name">{room.name}</span>
                  <span className="map-room-state">{busy ? 'занята' : 'свободна'}</span>
                  <ChevronRight size={14} strokeWidth={1.6} aria-hidden />
                </AppLink>
              );
            })}
          </div>
        </section>
      )) : null}

      <p className="map-foot">
        <MapPin size={14} strokeWidth={1.6} aria-hidden />
        <span>
          {updated ? `Данные на ${updated}` : 'Данные ещё не загружены'}. Расписание может меняться.
        </span>
      </p>
    </div>
  );
}
