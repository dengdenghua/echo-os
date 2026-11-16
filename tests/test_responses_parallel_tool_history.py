from runtime.execution.codex_backend.responses_proxy import responses_payload_to_model_request
from runtime.sensing.model_router.openai_router import _messages_to_openai


def test_parallel_calls_form_one_assistant_turn_before_results():
    items = [{"role": "user", "content": "inspect the system"}]
    for round_number in range(2):
        for index in range(3):
            items.append(
                {
                    "type": "function_call",
                    "call_id": f"c{round_number}-{index}",
                    "name": "exec_shell",
                    "arguments": '{"command":"uname -s"}',
                }
            )
        for index in range(3):
            items.append(
                {
                    "type": "function_call_output",
                    "call_id": f"c{round_number}-{index}",
                    "output": "Linux",
                }
            )
    request, _ = responses_payload_to_model_request(
        {"model": "deepseek-flash", "input": items},
        expected_model="deepseek-flash",
    )
    translated = _messages_to_openai(request.messages)
    pending = set()
    batches = 0
    for message in translated:
        if message["role"] == "assistant":
            assert not pending, "previous batch must have all results before another assistant turn"
            pending = {call["id"] for call in message["tool_calls"]}
            assert len(pending) == 3
            batches += 1
        elif message["role"] == "tool":
            pending.remove(message["tool_call_id"])
    assert not pending
    assert batches == 2
