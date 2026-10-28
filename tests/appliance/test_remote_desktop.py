import asyncio

from runtime.tentacle.remote_desktop import RemoteDesktopHost
from tests.appliance.test_device_link import _authorized_client, _service
from tests.test_remote_desktop import Peer, Socket


def test_remote_desktop_is_guarded_by_os_operator_boundary(tmp_path):
    service, coordinator = _service(tmp_path)
    coordinator.remote_desktop = RemoteDesktopHost(
        coordinator.ws_server, tmp_path / "grants.json", peer_factory=Peer
    )
    asyncio.run(service.enable())
    coordinator.ws_server._connections["phone"] = Socket()
    path = "/api/appliance/device-link/remote-desktop"
    visitor = _authorized_client(tmp_path, service, actor="local:alice")
    assert visitor.get(path + "/status").status_code == 403
    assert visitor.put(path + "/permissions/phone", json={"mode": "control"}).status_code == 403
    owner = _authorized_client(tmp_path, service)
    assert owner.get(path + "/status").json()["permissions"] == {}
    result = owner.put(path + "/permissions/phone", json={"mode": "control"})
    assert result.status_code == 200
    assert result.json()["permissions"] == {"phone": "control"}
    assert not coordinator.remote_desktop.sessions
    assert owner.put(path + "/permissions/phone", json={"mode": "denied"}).status_code == 200
    assert not coordinator.remote_desktop.permissions


def test_disabled_device_link_reports_unavailable_host(tmp_path):
    service, _ = _service(tmp_path)
    client = _authorized_client(tmp_path, service)
    assert client.get("/api/appliance/device-link/remote-desktop/status").status_code == 503
