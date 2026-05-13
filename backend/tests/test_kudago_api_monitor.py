"""Тесты для системы мониторинга KudaGo API."""
import logging


def test_logging_not_configured_on_import():
    """Импорт модуля не должен настраивать basicConfig."""
    root_logger = logging.getLogger()
    root_logger.handlers.clear()

    import kudago_api_monitor

    assert len(root_logger.handlers) == 0, "basicConfig не должен вызываться при импорте"
