# Manual Test Fixtures (One-shot)

Дата: 2026-05-05
Пароль для всех тест-аккаунтов: `TestPass123!`

## Аккаунты

| Роль/назначение | Email | ID | Ожидаемое поведение login |
|---|---|---:|---|
| user | manual_user@example.com | 3 | Успешный вход |
| user2 | manual_user2@example.com | 4 | Успешный вход |
| moderator | manual_moderator@example.com | 5 | Успешный вход |
| admin | manual_admin@example.com | 6 | Успешный вход |
| banned_user | manual_banned@example.com | 7 | Ошибка `Пользователь заблокирован` |
| unverified_user | manual_unverified@example.com | 8 | Ошибка `email_not_verified` |

## События (KudaGo cache fixtures)

| Тип кейса | kudago_id | DB ID | Старт (UTC) | Комментарий |
|---|---:|---:|---|---|
| soon-end | 900001 | 543 | ближайшие минуты | + party |
| soon-end | 900002 | 544 | ближайшие минуты | + party |
| soon-end | 900003 | 545 | ближайшие минуты | без party |
| ended recently | 900004 | 546 | уже в прошлом | + party для post-event |

## Party fixtures

| Party ID | event_id | Название |
|---:|---:|---|
| 2 | 900001 | Manual Party Soon 30m |
| 3 | 900002 | Manual Party Soon 90m |
| 4 | 900004 | Manual Party Ended 30m Ago |

## Быстрые URL для ручного прогона

- Frontend events: `http://localhost:3000/events`
- Frontend detail (soon): `http://localhost:3000/events/900001`
- Frontend detail (soon): `http://localhost:3000/events/900002`
- Frontend detail (ended): `http://localhost:3000/events/900004`
- API list: `http://localhost:8000/kudago/events?location=msk&page=1&page_size=20`
- API with parties: `http://localhost:8000/kudago/events?location=msk&page=1&page_size=20&has_party=true`

## Мини-проверка API (выполнено)

- `GET /kudago/events?location=msk...` -> `count=3`
- `GET ...&has_party=true` -> `count=2`
- `POST /login` для `manual_user@example.com` -> успешный вход
- `POST /login` для `manual_banned@example.com` -> ожидаемая ошибка
- `POST /login` для `manual_unverified@example.com` -> ожидаемая ошибка
