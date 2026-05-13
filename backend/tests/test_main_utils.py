"""
TDD тесты для утилитарных функций из main.py.

Покрывают:
  1. _check_party_access - проверка доступа к чату компании
  2. _check_event_attendance - проверка доступа к чату события
  3. socket_auth декоратор для Socket.IO аутентификации
  4. get_db_session context manager

Используем in-memory SQLite + фикстуры из conftest.py.
"""
import pytest
from auth import hash_password
from models.user import User
from models.party import EventParty, PartyMember
from models.attendee import EventAttendee
from models.event import Event
from routers.parties import MemberStatus


def _make_user(db, username: str, email: str) -> User:
    u = User(username=username, email=email, hashed_password=hash_password("pw"))
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _make_party(db, creator_id: int, title: str = "Test Party") -> EventParty:
    party = EventParty(
        event_id="event_1",
        title=title,
        description="desc",
        max_members=4,
        creator_id=creator_id,
        is_open=True,
        event_date_ts=None,
    )
    db.add(party)
    db.commit()
    db.refresh(party)
    return party


def _make_event(db, title: str = "Test Event") -> Event:
    from datetime import datetime
    event = Event(
        title=title,
        description="desc",
        date_time=datetime(2024, 1, 1, 12, 0),
        location="loc",
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


# Тесты для _check_party_access
def test_check_party_access_creator_has_access(db):
    """Создатель компании имеет доступ."""
    from main import _check_party_access

    user = _make_user(db, "creator", "creator@test.com")
    party = _make_party(db, user.id)

    assert _check_party_access(db, party, user.id) is True


def test_check_party_access_accepted_member_has_access(db):
    """Принятый участник имеет доступ."""
    from main import _check_party_access

    creator = _make_user(db, "creator", "creator@test.com")
    member = _make_user(db, "member", "member@test.com")
    party = _make_party(db, creator.id)

    pm = PartyMember(
        party_id=party.id,
        user_id=member.id,
        status=MemberStatus.accepted,
    )
    db.add(pm)
    db.commit()

    assert _check_party_access(db, party, member.id) is True


def test_check_party_access_invited_member_no_access(db):
    """Приглашенный участник не имеет доступа."""
    from main import _check_party_access

    creator = _make_user(db, "creator", "creator@test.com")
    member = _make_user(db, "member", "member@test.com")
    party = _make_party(db, creator.id)

    pm = PartyMember(
        party_id=party.id,
        user_id=member.id,
        status=MemberStatus.invited,
    )
    db.add(pm)
    db.commit()

    assert _check_party_access(db, party, member.id) is False


def test_check_party_access_declined_member_no_access(db):
    """Отклонившийся участник не имеет доступа."""
    from main import _check_party_access

    creator = _make_user(db, "creator", "creator@test.com")
    member = _make_user(db, "member", "member@test.com")
    party = _make_party(db, creator.id)

    pm = PartyMember(
        party_id=party.id,
        user_id=member.id,
        status=MemberStatus.declined,
    )
    db.add(pm)
    db.commit()

    assert _check_party_access(db, party, member.id) is False


def test_check_party_access_non_member_no_access(db):
    """Пользователь не участник - нет доступа."""
    from main import _check_party_access

    creator = _make_user(db, "creator", "creator@test.com")
    other = _make_user(db, "other", "other@test.com")
    party = _make_party(db, creator.id)

    assert _check_party_access(db, party, other.id) is False


# Тесты для _check_event_attendance
def test_check_event_attendance_local_event_attendee_has_access(db):
    """Участник локального события имеет доступ."""
    from main import _check_event_attendance

    user = _make_user(db, "user", "user@test.com")
    event = _make_event(db)

    attendee = EventAttendee(event_id=str(event.id), user_id=user.id)
    db.add(attendee)
    db.commit()

    assert _check_event_attendance(db, event.id, user.id) is True


def test_check_event_attendance_local_event_non_attendee_no_access(db):
    """Не участник локального события - нет доступа."""
    from main import _check_event_attendance

    user = _make_user(db, "user", "user@test.com")
    event = _make_event(db)

    assert _check_event_attendance(db, event.id, user.id) is False


def test_check_event_attendance_kudago_event_public_access(db):
    """KudaGo событие (нет в events таблице) - публичный доступ."""
    from main import _check_event_attendance

    user = _make_user(db, "user", "user@test.com")

    # KudaGo ID - строка не конвертируется в int или нет в events таблице
    assert _check_event_attendance(db, "kudago_12345", user.id) is True


def test_check_event_attendance_non_numeric_event_id_public(db):
    """Не числовой event_id - считается KudaGo, публичный доступ."""
    from main import _check_event_attendance

    user = _make_user(db, "user", "user@test.com")

    assert _check_event_attendance(db, "event_string", user.id) is True


def test_check_event_attendance_numeric_but_not_in_db_public(db):
    """Числовой event_id но нет в events таблице - публичный доступ."""
    from main import _check_event_attendance

    user = _make_user(db, "user", "user@test.com")

    assert _check_event_attendance(db, 99999, user.id) is True


# Тесты для get_db_session context manager
def test_get_db_session_closes_connection():
    """Context manager закрывает соединение с БД."""
    from main import get_db_session
    from sqlalchemy import text

    with get_db_session() as session:
        # Выполняем запрос
        result = session.execute(text("SELECT 1")).all()
        assert len(result) == 1

    # Проверяем что можно создать новое соединение
    with get_db_session() as session:
        result = session.execute(text("SELECT 1")).all()
        assert len(result) == 1


def test_get_db_session_handles_exception():
    """Context manager закрывает соединение даже при исключении."""
    from main import get_db_session
    from sqlalchemy import text

    with pytest.raises(ValueError):
        with get_db_session() as session:
            session.execute(text("SELECT 1"))
            raise ValueError("Test exception")

    # Проверяем что можно создать новое соединение после исключения
    with get_db_session() as session:
        result = session.execute(text("SELECT 1")).all()
        assert len(result) == 1


# Тесты для _normalize_socket_data
def test_normalize_socket_data_none_returns_empty_dict():
    """None возвращает пустой dict."""
    from main import _normalize_socket_data

    assert _normalize_socket_data(None) == {}


def test_normalize_socket_data_non_dict_returns_empty_dict():
    """Не-dict возвращает пустой dict."""
    from main import _normalize_socket_data

    assert _normalize_socket_data("string") == {}
    assert _normalize_socket_data(123) == {}
    assert _normalize_socket_data([]) == {}


def test_normalize_socket_data_dict_returns_same():
    """Dict возвращает тот же dict."""
    from main import _normalize_socket_data

    data = {"key": "value"}
    assert _normalize_socket_data(data) == data


def test_normalize_socket_data_empty_dict_returns_empty():
    """Пустой dict возвращает пустой dict."""
    from main import _normalize_socket_data

    assert _normalize_socket_data({}) == {}
