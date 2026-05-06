# GatherVibe Manual Test Plan (P0/P1)

Дата подготовки: 2026-05-05

## Тестовые аккаунты

Общий пароль для всех тестовых пользователей: `TestPass123!`

- `user` (`manual_user@example.com`) — базовые пользовательские сценарии
- `user2` (`manual_user2@example.com`) — второй пользователь для party/chat/invite
- `moderator` (`manual_moderator@example.com`) — модераторские действия (reports)
- `admin` (`manual_admin@example.com`) — admin-only маршруты и санкции
- `banned_user` (`manual_banned@example.com`) — негативные сценарии входа
- `unverified_user` (`manual_unverified@example.com`) — проверка `email_not_verified`

## P0 (критический путь)

1. Auth/session
- Login валидного пользователя, установка cookie, доступ к `/profile`.
- Logout, удаление cookie, повторный доступ к protected route должен редиректить/отклоняться.
- Невалидный пароль => 401.
- `unverified_user` => 403 `email_not_verified`.
- `banned_user` => 400 `Пользователь заблокирован`.

2. Verify email
- Валидный токен подтверждения (`/verify-email?token=...`) => успешное подтверждение.
- Невалидный/просроченный токен => ошибка.
- Повторная отправка письма: успешная + cooldown (429 при слишком частых запросах).

3. Events consistency
- На `/events` и `/events/{id}` одинаковые дата/время для одного события.
- Для событий “скоро закончится” отображение корректно и без timezone-расхождения.

4. Events filters persistence
- Комбинация фильтров (город + категория + дата/время).
- URL sync после применения фильтров.
- Сброс фильтров возвращает ожидаемую выдачу.
- Пагинация не ломает активные фильтры.

5. Party lifecycle
- Create party на событие.
- Join/request вторым пользователем.
- Accept/reject заявки создателем.
- Leave/kick/close сценарии.

6. Moderation minimum
- Жалоба пользователя на объект.
- Действие модератора/админа.
- Проверка эффекта (visibility/status) и записи в audit.

## P1 (важные)

1. Privacy flags
- `show_email/show_city/show_interests` влияют на видимость полей в чужом профиле.

2. Empty/error/loading states
- Пустая выдача в списках.
- Ошибка загрузки и поведение retry.
- Отображение loader на долгих запросах.

3. Rate limiting (auth)
- `/register`: превышение лимита => 429.
- `/login`: превышение лимита => 429.
- `/auth/resend-verification`: cooldown => 429.

## Быстрый чеклист прогона

1. Войти `user`, открыть `/events`, `/profile`, выйти.
2. Войти `unverified_user` (ожидать отказ).
3. Войти `banned_user` (ожидать отказ).
4. Войти `admin`, проверить доступ к `/admin/*`.
5. На событиях “soon-end” создать party и пройти join/accept между `user` и `user2`.
6. Открыть detail этих же событий и сверить время с карточкой в списке.

