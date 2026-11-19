import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { useSearch } from '../api/queries';
import { usePreferences } from '../store/preferences';
import { useDebounced } from '../lib/useDebounced';
import { useIsDesktop } from '../lib/useMediaQuery';
import { DesktopShell } from '../components/AppShell';
import type { GroupedSearchResult, SearchResult } from '../api/types';

function SearchBody({
  query,
  setQuery,
  onBack,
  desktop,
}: {
  query: string;
  setQuery: (value: string) => void;
  onBack?: () => void;
  desktop?: boolean;
}) {
  const debounced = useDebounced(query.trim(), 250);
  const search = useSearch(debounced);
  const navigate = useNavigate();
  const setGroup = usePreferences((state) => state.setGroup);
  const addRecent = usePreferences((state) => state.addRecent);
  const addFavorite = usePreferences((state) => state.addFavorite);
  const recentEntities = usePreferences((state) => state.recentEntities);
  const addRecentEntity = usePreferences((state) => state.addRecentEntity);
  const [params] = useSearchParams();
  const appliedQuery = useRef<string | null>(null);

  useEffect(() => {
    const initial = params.get('q') || '';
    if (initial && appliedQuery.current !== initial) {
      appliedQuery.current = initial;
      setQuery(initial);
    }
  }, [params, setQuery]);

  const grouped: GroupedSearchResult | null = useMemo(() => {
    if (!search.data) return null;
    if (Array.isArray(search.data)) {
      return {
        groups: search.data.filter((item) => item.type === 'group'),
        tutors: search.data.filter((item) => item.type === 'tutor'),
        auditories: search.data.filter((item) => item.type === 'auditory'),
      };
    }
    return search.data;
  }, [search.data]);
  const total = grouped ? grouped.groups.length + grouped.tutors.length + grouped.auditories.length : 0;

  const openResult = (item: SearchResult, forcedType?: 'group' | 'tutor' | 'auditory') => {
    const kind = forcedType || item.type;
    if (kind === 'group') {
      if (!item.id) return;
      const saved = { id: item.id, name: item.name };
      setGroup(saved);
      addRecent(saved);
      addFavorite(saved);
      addRecentEntity({ type: 'group', id: saved.id, name: saved.name });
      navigate(`/g/${saved.id}/today`);
      return;
    }
    addRecentEntity({ type: kind, id: item.id, name: item.name });
    if (kind === 'tutor') navigate(`/tutor/${item.id}`);
    if (kind === 'auditory') navigate(`/auditory/${item.id}`);
  };

  const recentHref = (entity: { type: 'group' | 'tutor' | 'auditory'; id: number }) =>
    entity.type === 'group' ? `/g/${entity.id}/today` : `/${entity.type}/${entity.id}`;
  const recentLabel = (type: 'group' | 'tutor' | 'auditory') =>
    type === 'group' ? 'группа' : type === 'tutor' ? 'преподаватель' : 'аудитория';

  const renderGroup = (title: string, items: SearchResult[], type: 'group' | 'tutor' | 'auditory') => {
    if (!items.length) return null;
    return (
      <section className="result-group" aria-label={title}>
        <div className="group-head">
          <h2 className="group-name">{title}</h2>
          <span className="group-count">{items.length}</span>
        </div>
        <ul className="result-list">
          {items.map((item) => {
            const href = type === 'group'
              ? item.id ? `/g/${item.id}/today` : undefined
              : type === 'tutor'
                ? `/tutor/${item.id}`
                : `/auditory/${item.id}`;
            return (
              <li key={`${item.type}-${item.id}`}>
                {href ? (
                  <a
                    className="result-row"
                    href={href}
                    onClick={(event) => {
                      event.preventDefault();
                      openResult(item, type);
                    }}
                  >
                    <span className="result-name">{item.name}</span>
                    <span className="result-type">
                      {type === 'group' ? 'группа' : type === 'tutor' ? 'преподаватель' : 'аудитория'}
                    </span>
                  </a>
                ) : (
                  <span className="result-row is-disabled" aria-disabled="true">
                    <span className="result-name">{item.name}</span>
                    <span className="result-type">нет ID для расписания</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  return (
    <div className={desktop ? 'desk-page' : 'search-page-content'}>
      {!desktop ? (
        <div className="search-head">
          <div className="search-bar">
            <button className="search-back" type="button" aria-label="Назад" onClick={onBack}>
              <ArrowLeft size={22} strokeWidth={1.6} />
            </button>
            <div className="search-field">
              <Search size={19} strokeWidth={1.6} />
              <label className="sr-only" htmlFor="search-q">Поиск по группам, преподавателям и аудиториям</label>
              <input
                id="search-q"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Группа, преподаватель, аудитория"
                autoComplete="off"
                spellCheck={false}
              />
              {query ? (
                <button className="search-clear" type="button" onClick={() => setQuery('')}>
                  Очистить
                </button>
              ) : null}
            </div>
          </div>
          <p className="search-hint">Достаточно двух символов. Поиск идёт по началу названия.</p>
        </div>
      ) : (
        <div className="desk-search-row">
          <Search size={19} strokeWidth={1.6} />
          <label className="sr-only" htmlFor="search-q">Поиск по группам, преподавателям и аудиториям</label>
          <input
            id="search-q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Группа, преподаватель, аудитория"
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <button className="search-clear" type="button" onClick={() => setQuery('')}>
              Очистить
            </button>
          ) : null}
        </div>
      )}

      <main id={desktop ? undefined : 'content'}>
        {debounced.length < 2 ? (
          <div className="recent">
            <h2 className="recent-title">Недавние запросы</h2>
            <ul className="recent-list">
              {recentEntities.length ? recentEntities.map((item) => (
                <li key={`${item.type}-${item.id}`}>
                  <Link className="recent-row" to={recentHref(item)}>
                    <span>{item.name}</span>
                    <span>{recentLabel(item.type)}</span>
                  </Link>
                </li>
              )) : (
                <li className="recent-row"><span>Пока пусто</span><span>найдите группу</span></li>
              )}
            </ul>
          </div>
        ) : null}

        {search.isFetching ? <p className="search-hint">Ищем…</p> : null}
        {search.isError ? <p className="empty-search">Поиск временно недоступен. Попробуйте ещё раз.</p> : null}
        {!search.isFetching && !search.isError && debounced.length >= 2 && !total ? (
          <p className="empty-search" role="status">Ничего не нашлось. Проверьте написание.</p>
        ) : null}
        {grouped ? (
          <>
            {renderGroup('Группы', grouped.groups, 'group')}
            {renderGroup('Преподаватели', grouped.tutors, 'tutor')}
            {renderGroup('Аудитории', grouped.auditories, 'auditory')}
          </>
        ) : null}
        {total > 0 ? (
          <p className="search-hint" role="status" style={{ padding: desktop ? 0 : '0 16px' }}>
            {total} {total === 1 ? 'результат' : total < 5 ? 'результата' : 'результатов'}
          </p>
        ) : null}
        {debounced.length < 2 ? (
          <div className="support-note">
            Если нужной группы нет в списке, сверьте номер на <a href="https://eservice.omsu.ru/schedule/">eservice.omsu.ru</a>.
            Поиск идёт по началу названия.
          </div>
        ) : null}
      </main>
    </div>
  );
}

export function SearchPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [query, setQuery] = useState(params.get('q') || '');
  const group = usePreferences((state) => state.group);
  const subgroup = usePreferences((state) => state.subgroup);

  if (isDesktop) {
    if (group) {
      return (
        <DesktopShell groupId={group.id} subgroup={subgroup}>
          <header className="desk-top">
            <div className="desk-title"><h1 className="desk-group">Поиск</h1><div className="desk-sub">группы, преподаватели, аудитории</div></div>
          </header>
          <SearchBody query={query} setQuery={setQuery} desktop />
        </DesktopShell>
      );
    }
    return (
      <div className="desktop-app">
        <aside className="side" aria-label="Навигация">
          <Link className="brand" to="/search">сетка<span className="brand-dot" /></Link>
          <Link className="side-search" to="/search"><Search size={16} strokeWidth={1.6} /><span>Найти группу или преподавателя</span></Link>
          <div className="side-foot">Расписание ОмГУ, зеркало на этом сервере.</div>
        </aside>
        <div className="desk-main" id="d-content">
          <header className="desk-top"><div className="desk-title"><h1 className="desk-group">Поиск</h1><div className="desk-sub">найдите свою группу</div></div></header>
          <SearchBody query={query} setQuery={setQuery} desktop />
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-app search-app">
      <SearchBody query={query} setQuery={setQuery} onBack={() => navigate(-1)} />
    </div>
  );
}
