"""Exercise the real lock adapter with a harmless process, never XSecureLock."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import pytest

pytestmark = pytest.mark.skipif(sys.platform != 'linux', reason='Linux process identity and lock adapter')
LOCKER = Path(__file__).resolve().parents[1] / 'deploy/desktop-session/echo-screen-locker'


@pytest.mark.parametrize('suspend', [False, True])
@pytest.mark.parametrize('private', [False, True])
def test_lock_marker_never_prevents_locking_and_preserves_delay_fd(tmp_path, suspend, private):
    home = tmp_path / 'home'
    home.mkdir(mode=0o700)
    if not private:
        outside = tmp_path / 'outside'
        outside.mkdir()
        (home / '.cache').symlink_to(outside, target_is_directory=True)
    fixture = tmp_path / 'safe-locker'
    receipt = tmp_path / 'receipt'
    fixture.write_text('#!/usr/bin/env python3\nimport os,time,pathlib\n'
                       'fd=os.environ.get("XSS_SLEEP_LOCK_FD")\n'
                       'assert not fd or not pathlib.Path("/proc/self/fd",fd).exists()\n'
                       'pathlib.Path(os.environ["RECEIPT"]).write_text("started")\n'
                       'time.sleep(0.6)\n')
    fixture.chmod(0o700)
    env = {**os.environ, 'HOME': str(home), 'DISPLAY': ':feedback-test',
           'ECHO_SCREEN_LOCKER_TESTING': 'yes', 'ECHO_XSECURELOCK_BIN': str(fixture),
           'ECHO_SLEEP_LOCK_DELAY_SECONDS': '0.01', 'RECEIPT': str(receipt)}
    read_fd, write_fd = os.pipe()
    try:
        if suspend:
            env['XSS_SLEEP_LOCK_FD'] = str(write_fd)
        else:
            env.pop('XSS_SLEEP_LOCK_FD', None)
        process = subprocess.Popen(['bash', str(LOCKER)], env=env, pass_fds=(write_fd,) if suspend else (),
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 3
            while not receipt.exists() and process.poll() is None and time.monotonic() < deadline:
                time.sleep(0.01)
            assert receipt.read_text() == 'started'
            assert process.poll() is None
            marker_path = home / '.cache/echo-os/automation-feedback' / f'lock-{process.pid}.json'
            if private:
                marker = json.loads(marker_path.read_text())
                raw = Path(f'/proc/{process.pid}/stat').read_text()
                assert marker == {'pid': process.pid, 'start': raw[raw.rfind(')') + 2:].split()[19],
                                  'display': ':feedback-test'}
                assert marker_path.stat().st_mode & 0o777 == 0o600
            else:
                assert list(outside.iterdir()) == []
            stdout, stderr = process.communicate(timeout=3)
            assert process.returncode == 0, stderr.decode()
            assert b'ECHO_LOCK_SCREEN_LAUNCHED' in stdout
        finally:
            if process.poll() is None:
                process.terminate()
                process.communicate(timeout=3)
    finally:
        os.close(read_fd)
        os.close(write_fd)
