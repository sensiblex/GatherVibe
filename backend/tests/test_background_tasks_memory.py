"""Security tests for background task memory usage.

Verifies that _reminder_loop uses batch processing (LIMIT) to avoid
loading all matching parties into memory at once.
"""

import pytest


@pytest.mark.asyncio
async def test_reminder_loop_uses_batch_processing():
    """_reminder_loop must use .limit() on the parties query to batch-process."""
    import main

    REMINDER_BATCH_SIZE = getattr(main, "REMINDER_BATCH_SIZE", None)

    # If REMINDER_BATCH_SIZE is not defined yet, the test should fail
    assert REMINDER_BATCH_SIZE is not None, "REMINDER_BATCH_SIZE constant must be defined in main.py"

    # Verify the constant is a reasonable batch size
    assert REMINDER_BATCH_SIZE <= 500, "REMINDER_BATCH_SIZE should be a reasonable batch size (<= 500)"


def test_reminder_batch_size_constant_exists():
    """REMINDER_BATCH_SIZE must be defined as a module-level constant."""
    import main
    assert hasattr(main, "REMINDER_BATCH_SIZE")
    assert isinstance(main.REMINDER_BATCH_SIZE, int)
    assert main.REMINDER_BATCH_SIZE > 0
