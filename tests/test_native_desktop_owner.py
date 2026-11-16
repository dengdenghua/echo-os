import pytest
from pydantic import BaseModel

from runtime.adapters.integrations.local_auth.config import LocalAuthConfig
from runtime.adapters.integrations.local_auth.desktop_owner import configure_desktop_owner
from runtime.adapters.integrations.local_auth.passwords import verify_password


class Config(BaseModel):
    local_auth: LocalAuthConfig

@pytest.mark.parametrize("local,desktop,native,token,configured,enabled", [
    (True,"1","1","A"*40,False,True),
    (False,"1","1","A"*40,False,False),
    (True,"0","1","A"*40,False,False),
    (True,"1","0","A"*40,False,False),
    (True,"1","1","short",False,False),
    (True,"1","1","A"*40,True,False),
])
def test_owner_credential_is_bound_to_owned_loopback_shell(monkeypatch,local,desktop,native,token,configured,enabled):
    monkeypatch.setenv("ECHO_DESKTOP",desktop)
    monkeypatch.setenv("ECHO_NATIVE_OS",native)
    cfg=Config(local_auth=LocalAuthConfig(enabled=True,users={"admin":"existing"} if configured else {}))
    result=configure_desktop_owner(cfg,token,local_loopback=local)
    if enabled:
        assert result.local_auth.users.keys()=={"owner"}
        assert verify_password(token,result.local_auth.users["owner"])
        assert not verify_password("wrong",result.local_auth.users["owner"])
        assert "admin" in result.local_auth.default_roles
        assert not result.local_auth.allow_any_username
        assert cfg.local_auth.users=={}  # never write into persisted config
    else:
        assert result is cfg
