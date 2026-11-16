from runtime.execution.codebuddy_events import CodeBuddyEvents

def test_real_compacting_status_is_recorded_without_double_counting():
    reducer = CodeBuddyEvents(model="glm-5.3")
    for status in ("compacting", "compacting", None, "compacting", None):
        assert reducer.consume({"type": "system", "subtype": "status", "status": status}) == []
    events = reducer.consume({"type": "result", "subtype": "success", "result": "DONE", "usage": {}})
    assert events[-1]["completion_receipt"]["compaction_count"] == 2
