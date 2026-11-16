from runtime.platform.models.llm import Message, ModelRequest, ToolSpec
from runtime.sensing.model_router.openai_router import OpenAIModelRouter


def test_explicit_non_thinking_tool_loop_overrides_effort_and_provider_default():
    router = OpenAIModelRouter(base_url="https://api.deepseek.com/v1", api_key="test")
    request = ModelRequest(
        model="deepseek-flash",
        messages=[Message(role="user", content="inspect")],
        tools=[ToolSpec(name="probe", description="probe", input_schema={"type": "object"})],
        enable_thinking=False,
        reasoning_effort="medium",
    )
    payload = router._build_payload(request, request.model)
    assert payload["thinking"] == {"type": "disabled"}
    assert "reasoning_effort" not in payload
    enabled = router._build_payload(
        request.model_copy(update={"enable_thinking": True}), request.model
    )
    assert enabled["thinking"] == {"type": "enabled"}
