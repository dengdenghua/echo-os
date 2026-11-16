from runtime.sensing.gateway._config_helpers import _custom_model_wire_entry
from runtime.sensing.gateway._config_models import CustomModelsList


def test_legacy_model_name_satisfies_wire_schema_without_returning_secrets():
    entry = {"id": "old", "name": "旧连接", "provider": "openai", "base_url": "https://example.test/v1", "models": ["fixture"], "api_key": "synthetic-key", "default_headers": {"X-Route": "synthetic-route"}}
    wire = _custom_model_wire_entry(entry)
    validated = CustomModelsList.model_validate({"models": [wire]})
    assert validated.models[0].display_name == "旧连接"
    assert wire["has_api_key"] is True
    assert "api_key" not in wire and "default_headers" not in wire
    assert "display_name" not in entry


def test_legacy_model_explicit_display_name_is_preserved():
    wire = _custom_model_wire_entry({"id": "id", "name": "internal", "display_name": "显示名称", "models": ["fixture"]})
    assert wire["display_name"] == "显示名称"
