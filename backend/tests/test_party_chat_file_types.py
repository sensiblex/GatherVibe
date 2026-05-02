"""Regression tests for party chat attachment metadata validation."""


def test_party_chat_accepts_file_types_returned_by_upload_endpoint():
    import main

    for file_type in ("image", "pdf", "file"):
        assert main._is_allowed_party_file_type(file_type)


def test_party_chat_keeps_legacy_file_types_compatible():
    import main

    for file_type in ("document", "video", "audio"):
        assert main._is_allowed_party_file_type(file_type)


def test_party_chat_rejects_unknown_file_type():
    import main

    assert not main._is_allowed_party_file_type("html")
    assert not main._is_allowed_party_file_type("")
