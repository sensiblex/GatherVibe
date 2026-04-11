
# project-map.md

```markdown
# GatherVibe — Project Map
> Карта проекта для Claude Code. Читай ТОЛЬКО нужные секции, не сканируй весь проект.

## Стек
- **Backend**: FastAPI + SQLAlchemy async + PostgreSQL + Alembic + Socket.IO (python-socketio)
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Инфра**: Docker Compose, два сервиса — `backend` (порт 8000) и `frontend` (порт 3000)
- **Внешнее API**: KudaGo (события Москвы/СПб)

---

## Backend — `backend/`

### Точка входа
```

backend/main.py          \# ВСЕ эндпоинты и Socket.IO хендлеры (58 KB — большой файл!)

```
> ⚠️ main.py — монолит. При добавлении нового роутера — добавляй в конец файла.

### Конфиг и утилиты
```

backend/database.py      \# AsyncSession, get_db dependency
backend/auth.py          \# get_current_user dependency (JWT decode)
backend/jwt_handler.py   \# create_access_token, verify_token
backend/schemas.py       \# Общие Pydantic-схемы (UserCreate, UserOut, Token)

```

### Модели SQLAlchemy (`backend/models/`)
```

models/__init__.py        \# импортирует все модели для Alembic
models/user.py            \# User: id, email, username, hashed_password,
\#   city, interests, avatar_url, bio,
\#   show_email, show_city, show_interests
models/event.py           \# Event (локальные): id(str UUID), title, description,
\#   date_time, location, city, category,
\#   max_participants, price, image_url, creator_id
models/attendee.py        \# EventAttendee: user_id, event_id(str),
\#   + кэш метаданных KudaGo: event_title, event_date_ts,
\#     event_city, event_image_url, event_category, event_location
models/party.py           \# Party: id, event_id(str), creator_id, title,
\#   description, max_members, status(open/closed/cancelled)
\# PartyMember: party_id, user_id,
\#   status: pending|accepted|rejected|left (MemberStatus enum)
models/chat_message.py    \# ChatMessage: id, room_id, user_id, content, created_at

```

### Миграции (`backend/migrations/versions/`)
```

0001 — initial users+events
0002 — parties + party_members
0003 — chat_messages
0004 — user privacy fields (show_email, show_city, show_interests)
0005 — attendee metadata cache (6 колонок KudaGo)

```
> Следующая миграция: **0006**

### KudaGo интеграция
```

backend/kudago_api_async.py   \# Async-клиент KudaGo API (основной)
backend/kudago_api_cache.py   \# LRU-кэш для KudaGo запросов
backend/kudago_api_models.py  \# Pydantic-модели KudaGo событий
backend/kudago_api.py         \# Sync-клиент (устаревший, не использовать)
backend/kudago_api_monitor.py \# Мониторинг KudaGo

```

### Socket.IO события (в main.py)
| Событие | Направление | Описание |
|---|---|---|
| `join_event_chat` | client→server | Войти в комнату `event_{id}` |
| `join_party_chat` | client→server | Войти в комнату `party_{id}` |
| `subscribe_user_notifications` | client→server | Войти в комнату `user_{id}` |
| `send_message` | client→server | Отправить сообщение в комнату |
| `new_message` | server→client | Новое сообщение |
| `party_deleted` | server→client | Пати удалено (редирект на event) |
| `request_status_changed` | server→client | Статус заявки изменён (accepted/rejected) |

---

## Frontend — `frontend/app/`

### Роуты (Next.js App Router)
```

app/page.tsx                          \# Главная (лендинг)
app/login/page.tsx                    \# Логин
app/register/page.tsx                 \# Регистрация
app/events/page.tsx                   \# Каталог событий (KudaGo + локальные)
app/events/[id]/page.tsx              \# Детальная страница события
app/events/[id]/layout.tsx            \# Layout для события
app/events/[id]/create-party/page.tsx \# Создание пати
app/parties/[id]/page.tsx             \# Детальная страница пати
app/profile/page.tsx                  \# Профиль текущего пользователя
app/my-events/page.tsx                \# Мои события (upcoming/past табы)
app/users/[id]/page.tsx               \# Публичный профиль пользователя
app/notifications/page.tsx            \# Уведомления

```

### Компоненты (`frontend/app/components/`)
```

Navbar.tsx                    \# Навигация (auth-aware, «Мои события» если залогинен)
EventCard.tsx                 \# Карточка события
EventAttendees.tsx            \# Кнопка Join + логика EventAttendee (передаёт eventMeta)
EventChat.tsx                 \# Чат события (Socket.IO)
PartyCard.tsx                 \# Карточка пати
PartyChat.tsx                 \# Чат пати (Socket.IO)
PartyMembers.tsx              \# Список участников пати
PrivacyModal.tsx              \# Модалка настроек приватности
UserNotificationSocket.tsx    \# Глобальный Socket.IO listener (в ClientLayout)

```

### Контекст (`frontend/app/context/`)
```

AuthContext.tsx    \# useAuth() — user, token, login(), logout()

```

### Утилиты (`frontend/app/lib/`)
```

api.ts    \# BASE_URL, apiFetch() — обёртка над fetch с auth header

```

### Ключевые файлы
```

app/layout.tsx          \# Root layout (подключает ClientLayout)
app/ClientLayout.tsx    \# Navbar + UserNotificationSocket + AuthProvider
app/globals.css         \# Tailwind + кастомные переменные
frontend/middleware.ts  \# Защита роутов (redirect на /login если нет токена)

```

---

## API эндпоинты (backend/main.py)

### Auth
- `POST /auth/register` — регистрация
- `POST /auth/login` — логин → JWT

### Users
- `GET /users/me` — текущий пользователь
- `GET /users/me/stats` — статистика (parties_created, events_attended, matches_found)
- `GET /users/me/events` — мои события (upcoming/past, с KudaGo-данными)
- `GET /users/me/parties` — мои пати (creator + accepted member)
- `PATCH /users/me` — обновить профиль
- `PATCH /users/me/password` — сменить пароль
- `PATCH /users/me/avatar` — загрузить аватар
- `PATCH /users/me/privacy` — настройки приватности
- `GET /users/{user_id}` — публичный профиль (учитывает privacy flags)

### Events (локальные)
- `GET /events` — список (фильтры: city, category, date_from, date_to, is_free, max_price, has_spots, sort_by)
- `POST /events` — создать
- `GET /events/{id}` — деталь
- `POST /attendees/{event_id}` — присоединиться (+ сохранить eventMeta)
- `DELETE /attendees/{event_id}` — покинуть

### Parties
- `GET /parties/event/{event_id}` — пати для события
- `POST /parties/event/{event_id}` — создать пати (лимит: 2 на событие)
- `GET /parties/{id}` — деталь пати
- `DELETE /parties/{id}` — удалить (эмитит party_deleted)
- `POST /parties/{id}/join` — запрос на вступление
- `POST /parties/{id}/leave` — покинуть
- `POST /parties/{id}/members/{user_id}/accept` — принять участника
- `POST /parties/{id}/members/{user_id}/reject` — отклонить
- `GET /parties/{id}/requests` — заявки (только creator)

### Chat
- `GET /chat/{room_id}/messages` — история чата

---

## Паттерны кода

### Добавить новый эндпоинт (backend)
1. Модель → `backend/models/new_model.py`
2. Импорт в `backend/models/__init__.py`
3. Миграция: `alembic revision --autogenerate -m "add new_model"` (следующая: 0006)
4. Эндпоинт → добавить в конец `backend/main.py`
5. Схемы → в `backend/schemas.py` или inline в main.py

### Добавить новую страницу (frontend)
1. Создать `frontend/app/<route>/page.tsx`
2. Использовать `useAuth()` из `app/context/AuthContext.tsx`
3. Запросы через `apiFetch()` из `app/lib/api.ts`
4. Защита: добавить роут в `frontend/middleware.ts` если нужна авторизация

### Socket.IO (frontend)
```typescript
import { io } from 'socket.io-client'
const socket = io(process.env.NEXT_PUBLIC_WS_URL, {
  auth: { token }  // всегда передавать токен!
})
socket.emit('join_party_chat', { party_id: id, token })
socket.on('new_message', (msg) => { ... })
```


---

## Где что искать быстро

| Задача | Файл |
| :-- | :-- |
| Новый API эндпоинт | `backend/main.py` (конец файла) |
| Новая DB-модель | `backend/models/` |
| Новая миграция | `backend/migrations/versions/` → номер 0006 |
| Новый роут фронта | `frontend/app/<route>/page.tsx` |
| Новый компонент | `frontend/app/components/` |
| Auth на фронте | `frontend/app/context/AuthContext.tsx` |
| HTTP-запросы | `frontend/app/lib/api.ts` |
| Socket.IO логика | `backend/main.py` + `frontend/app/components/*Chat*.tsx` |
| Стили | `frontend/app/globals.css` |

