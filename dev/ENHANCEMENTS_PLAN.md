# План реализации умных функций и уведомлений (v3)

Этот документ описывает реализацию системы отслеживания изменений в расписании, умного переключения дат в UI и Push-уведомлений через Firebase Cloud Messaging (FCM).

---

## 1. Логика обнаружения изменений (Schedule Diff)

### 1.1 Backend: Хранение истории и сравнение

#### [NEW] Таблица `schedule_changes` в SQLite
```sql
CREATE TABLE schedule_changes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type  TEXT NOT NULL,        -- 'group', 'tutor', 'auditory'
    entity_id    INTEGER NOT NULL,
    change_type  TEXT NOT NULL,        -- 'added', 'removed', 'modified'
    lesson_id    INTEGER NOT NULL,
    old_data     TEXT,                 -- JSON старого занятия (для 'modified', 'removed')
    new_data     TEXT,                 -- JSON нового занятия (для 'added', 'modified')
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_changes_entity ON schedule_changes(entity_type, entity_id);
```

#### [MODIFY] `core/internal/sync/schedule_sync.go`
- При фоновой синхронизации, перед обновлением кэша:
  1. Загрузить старое расписание из SQLite (`schedule_cache`).
  2. Распаковать (gunzip) и десериализовать старые и новые данные.
  3. Сравнить наборы занятий по `ID` (из API ОмГУ):
     - **Added**: ID есть в новом, но нет в старом.
     - **Removed**: ID есть в старом, но нет в новом.
     - **Modified**: ID есть в обоих, но поля (`teacher`, `auditCorps`, `time`, `subgroupName`) изменились.
  4. Если изменения обнаружены:
     - Записать в `schedule_changes`.
     - Записать в `upstream_incidents` событие типа `schedule_change`.
     - (Опционально) Триггернуть отправку Push-уведомления.

---

## 2. Умное переключение дат (Smart Date Switch)

### 2.1 Frontend: Логика выбора дня по умолчанию

#### [MODIFY] `web/src/pages/ScheduleView.tsx`
- Изменить инициализацию `activeDayIdx` и `activeWeekStart`:
  ```typescript
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay(); // 0 - воскресенье, 1 - понедельник...

  let defaultDate = new Date();

  // Логика:
  // 1. Если воскресенье -> показываем завтра (понедельник)
  // 2. Если будний день/суббота и время > 18:00 -> показываем завтра
  if (currentDay === 0) {
    defaultDate.setDate(now.getDate() + 1);
  } else if (currentHour >= 18) {
    defaultDate.setDate(now.getDate() + 1);
  }
  ```
- При переключении на "завтра" также обновлять `activeWeekStart`, если завтра — это уже следующая неделя.

---

## 3. Push-уведомления (FCM)

### 3.1 Backend: Интеграция Firebase

#### [NEW] `core/internal/notifications/fcm.go`
- Инициализация Firebase Admin SDK.
- Метод `SendNotification(token, title, body, data)` для отправки сообщения.
- Метод `BroadcastToTopic(topic, title, body, data)` для отправки всем подписчикам группы/преподавателя.

#### [NEW] Хранение токенов
```sql
CREATE TABLE user_subscriptions (
    fcm_token    TEXT PRIMARY KEY,
    entity_type  TEXT NOT NULL,        -- 'group', 'tutor'
    entity_id    INTEGER NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sub_entity ON user_subscriptions(entity_type, entity_id);
```

#### [NEW] Эндпоинты API
- `POST /api/v1/notifications/subscribe` — привязка FCM токена к группе/преподавателю.
- `POST /api/v1/notifications/unsubscribe` — отписка.

### 3.2 Frontend: Service Worker и UI

#### [MODIFY] `web/public/firebase-messaging-sw.js`
- Настройка обработчика фоновых уведомлений.
- Логика открытия ссылки при клике: `/schedule/:type/:id`.

#### [MODIFY] `web/src/pages/ScheduleView.tsx`
- Добавить кнопку/переключатель «Уведомлять об изменениях».
- При включении: запрос разрешения на уведомления -> получение токена FCM -> отправка на бэкенд.

---

## 4. Этапы реализации

| Этап | Задача | Описание |
|------|--------|----------|
| **21** | **Schedule Diff Engine** | Реализация логики сравнения расписаний в Go |
| **22** | **Smart UI Logic** | Авто-переключение на "завтра" в React |
| **23** | **FCM Integration** | Подключение Firebase Admin SDK на бэкенде |
| **24** | **Push UI** | Подписка на уведомления во фронтенде |

---

## 5. Формат уведомления (Пример)

**Заголовок:** Изменение в расписании! 🔄
**Текст:** В группе МБС-501-О-01 изменена пара "Математика" (10.04.2026).
**Действие:** Переход на страницу расписания группы.
