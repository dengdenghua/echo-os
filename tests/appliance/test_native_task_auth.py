"""Native task projection must use the same identity as Agent task creation."""
from __future__ import annotations

import hashlib
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from appliance import agent_ui, native_extension
from runtime.memory.journal import InMemoryJournal
from runtime.memory.journal.journal_context import journal_context
from runtime.memory.threads.event_log import EventLog
from runtime.platform.extensions import AppExtensionContext
from runtime.platform.process.task_supervisor import TaskSupervisor
from runtime.safety.auth.identity import Identity, IdentityStore, encode_jwt_hs256

SECRET = 'isolated-native-task-test-secret'
URL = '/api/appliance/tasks/owned-task/file-changes'


def token(actor='local:owner', **extra):
    return encode_jwt_hs256({'sub': actor, 'iat': 0, 'exp': 9_999_999_999,
                            'iss': 'echo-agent', 'aud': 'native-tests', **extra}, secret=SECRET)


@pytest.fixture
def native(tmp_path, monkeypatch):
    monkeypatch.setenv('ECHO_NATIVE_OS', '1')
    monkeypatch.delenv('ECHO_DESKTOP', raising=False)
    monkeypatch.delenv('ECHO_APPLIANCE', raising=False)
    monkeypatch.setattr(agent_ui, 'mount_agent_ui', lambda app: True)
    identities = IdentityStore()
    identities.add(Identity('local:owner', ('user',)), api_key_plaintext='test-owner-key')
    identities.add(Identity('local:other', ('user',)))
    context = AppExtensionContext(identity_store=identities, require_auth=True,
                                  jwt_secret=SECRET, jwt_issuer='echo-agent', jwt_audience='native-tests')
    supervisor = TaskSupervisor.from_path(tmp_path/'tasks.json', holder_id='test-native')
    supervisor.start_task(task_id='owned-task', owner_id='local:owner', kind='realtime_codex',
                          thread_id='tNativeOwner', workspace_path=str(tmp_path))
    file = tmp_path/'result.txt'
    file.write_text('owned evidence', encoding='utf-8')
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    journal = InMemoryJournal()
    with journal_context(conversation_id='tNativeOwner', owner_actor_id='local:owner'):
        journal.write_file_op(path=str(file), action='create', old_size=None, new_size=file.stat().st_size,
                              diff='+owned evidence', rollback={'path': str(file), 'after_sha256': digest})
    runtime = SimpleNamespace(_stack=SimpleNamespace(journal=journal),
                              _log_for=lambda thread: EventLog(tmp_path/'threads'/f'{thread}.jsonl'))
    app = FastAPI()
    app.state.task_supervisor = supervisor
    app.state.realtime_gateway = SimpleNamespace(_runtime=runtime)
    native_extension.register_app(app, context)
    return SimpleNamespace(app=app, context=context, digest=digest)


@pytest.mark.parametrize('transport', ['bearer', 'cookie', 'api_key'])
def test_registered_owner_can_read_verified_file_evidence(native, transport):
    client = TestClient(native.app)
    if transport == 'cookie':
        client.cookies.set('echo_session', token())
    else:
        client.headers['Authorization'] = 'Bearer ' + ('test-owner-key' if transport == 'api_key' else token())
    response = client.get(URL)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['available'] is True
    assert [(c['displayPath'], c['evidence'], c['afterSha256']) for c in body['changes']] == [
        ('result.txt', 'verified', native.digest)]


@pytest.mark.parametrize('credential', [None, 'invalid', token('unregistered'), token(exp=1),
                                      token(iss='foreign'), token(aud='foreign')])
def test_invalid_or_missing_host_session_cannot_read_native_tasks(native, credential):
    client = TestClient(native.app)
    if credential:
        client.headers['Authorization'] = 'Bearer ' + credential
    for route in ('/api/appliance/tasks', URL):
        response = client.get(route)
        assert response.status_code == 401
        assert 'owned evidence' not in response.text


def test_other_registered_user_cannot_read_owner_diff(native):
    client = TestClient(native.app, headers={'Authorization': 'Bearer ' + token('local:other')})
    response = client.get(URL)
    missing = client.get(URL.replace('owned-task', 'nonexistent-task'))
    assert response.status_code == missing.status_code == 404
    assert response.json() == missing.json() == {'detail': 'task not found'}


def test_required_identity_store_loss_fails_closed(native):
    native.context.identity_store = None
    response = TestClient(native.app, headers={'Authorization': 'Bearer ' + token()}).get(URL)
    assert response.status_code == 401


def test_removed_registered_identity_cannot_reuse_its_session(native):
    native.context.identity_store.remove('local:owner')
    response = TestClient(native.app, headers={'Authorization': 'Bearer ' + token()}).get(URL)
    assert response.status_code == 401
