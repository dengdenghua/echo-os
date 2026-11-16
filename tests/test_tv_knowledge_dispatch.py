from runtime.execution.suckers.registry import SkillRegistry
from runtime.execution.suckers.agent_meta_skills import register_agent_meta_skills
from runtime.execution.suckers.storage_skills import register_storage_skills
from runtime.execution.tool_engine.effect_receipts import should_refresh_read_result


def test_knowledge_read_can_use_discovery_dispatch_and_refresh_live_policy():
    calls = []
    def request(method, path, body=None):
        calls.append((method, path))
        if path == "/v1/policy":
            return body
        return {"hits": [{"path": "/authorized/fixture.txt", "snippet": "紫杉-B92K", "score": 1}]}
    registry = SkillRegistry()
    register_storage_skills(registry, requester=request)
    register_agent_meta_skills(registry)
    search, execute = registry.get("search_documents"), registry.get("execute_skill")
    assert should_refresh_read_result(search)
    assert should_refresh_read_result(execute)
    for _ in range(2):
        result = execute.handler(name="search_documents", args={"query": "星河"})
        assert result["ok"] is True
        assert result["result"]["hits"][0]["snippet"] == "紫杉-B92K"
    assert calls.count(("PUT", "/v1/policy")) == 2
    assert calls.count(("POST", "/v1/search")) == 2
