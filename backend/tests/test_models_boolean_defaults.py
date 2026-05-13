"""TDD: RED-тесты для унификации server_default в Boolean полях."""
from models.user import User
from models.party import EventParty
from models.review import PartyReview


class TestUserBooleanServerDefaults:
    """RED: Boolean поля User должны иметь корректные server_default через sa_text()."""

    def test_is_active_server_default(self, db):
        col = User.__table__.c.is_active
        assert col.server_default is not None, "is_active missing server_default"
        val = str(col.server_default.arg).strip().strip("'\"")
        assert val.lower() == "true", f"is_active server_default={val!r}, expected 'true'"

    def test_email_notifications_server_default(self, db):
        col = User.__table__.c.email_notifications
        assert col.server_default is not None, "email_notifications missing server_default"
        val = str(col.server_default.arg).strip().strip("'\"")
        assert val.lower() == "true", f"email_notifications server_default={val!r}, expected 'true'"

    def test_is_banned_server_default(self, db):
        col = User.__table__.c.is_banned
        assert col.server_default is not None, "is_banned missing server_default"
        val = str(col.server_default.arg).strip().strip("'\"")
        assert val.lower() == "false", f"is_banned server_default={val!r}, expected 'false'"


class TestPartyBooleanServerDefaults:
    """RED: Boolean поля EventParty должны иметь корректные server_default."""

    def test_is_open_server_default(self, db):
        col = EventParty.__table__.c.is_open
        assert col.server_default is not None, "is_open missing server_default"
        val = str(col.server_default.arg).strip().strip("'\"")
        assert val.lower() == "true", f"is_open server_default={val!r}, expected 'true'"

    def test_is_hidden_server_default(self, db):
        col = EventParty.__table__.c.is_hidden
        assert col.server_default is not None, "is_hidden missing server_default"
        val = str(col.server_default.arg).strip().strip("'\"")
        assert val.lower() == "false", f"is_hidden server_default={val!r}, expected 'false'"


class TestReviewServerDefaults:
    """RED: Boolean/Integer поля PartyReview должны иметь корректные server_default."""

    def test_is_hidden_server_default(self, db):
        col = PartyReview.__table__.c.is_hidden
        assert col.server_default is not None, "is_hidden missing server_default"
        val = str(col.server_default.arg).strip().strip("'\"")
        assert val.lower() == "false", f"is_hidden server_default={val!r}, expected 'false'"

    def test_is_deleted_server_default(self, db):
        col = PartyReview.__table__.c.is_deleted
        assert col.server_default is not None, "is_deleted missing server_default"
        val = str(col.server_default.arg).strip().strip("'\"")
        assert val.lower() == "false", f"is_deleted server_default={val!r}, expected 'false'"

    def test_report_count_server_default(self, db):
        col = PartyReview.__table__.c.report_count
        assert col.server_default is not None, "report_count missing server_default"
        val = str(col.server_default.arg).strip().strip("'\"")
        assert val == "0", f"report_count server_default={val!r}, expected '0'"
