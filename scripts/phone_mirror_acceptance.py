"""Drive a real Android debug fixture through the production HTTP/WS bridge."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import time
from pathlib import Path

import httpx


def run(state: Path, evidence: Path, hold: bool = False) -> None:
    config = json.loads((state / "operator.json").read_text())
    evidence.mkdir(parents=True, exist_ok=True)
    client = httpx.Client(
        base_url=config["url"],
        headers={"Authorization": f"Bearer {config['token']}"},
        trust_env=False,
        timeout=20,
    )
    base = "/api/appliance/device-link/devices/lab-android/mirror/"

    def request(operation, args=None):
        response = client.post(base + operation, json=args or {})
        if response.status_code != 200:
            raise RuntimeError(f"{operation}: {response.status_code} {response.text[:500]}")
        return response.json()

    def files(operation, **args):
        return request("files", {"operation": operation, **args})

    def download(name):
        info = files("stat", name=name)
        data = bytearray()
        while len(data) < info["size"]:
            block = base64.b64decode(
                files("read", name=name, offset=len(data))["data"], validate=True
            )
            assert block
            data.extend(block)
        assert len(data) == info["size"]
        assert hashlib.sha256(data).hexdigest() == info["sha256"]
        return bytes(data)

    def upload(name, data, resume=False):
        args = {"name": name, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        session = files("begin", **args)
        offset = session["offset"]
        while offset < len(data):
            chunk = data[offset : offset + 12 * 1024]
            result = files(
                "chunk", id=session["id"], offset=offset, data=base64.b64encode(chunk).decode()
            )
            assert result["offset"] == offset + len(chunk)
            offset = result["offset"]
            if resume and offset == 12 * 1024:
                resumed = files("begin", **args)
                assert resumed["id"] == session["id"] and resumed["offset"] == offset
                # Lost chunk acknowledgement: retry is idempotent.
                duplicate = files(
                    "chunk", id=session["id"], offset=0, data=base64.b64encode(chunk).decode()
                )
                assert duplicate["offset"] == offset
        assert files("complete", id=session["id"])["size"] == len(data)

    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        devices = client.get("/api/appliance/device-link").json()["devices"]
        if any(device["id"] == "lab-android" and device["online"] for device in devices):
            break
        time.sleep(0.5)
    else:
        raise RuntimeError("Actual APK did not connect")

    fixture = json.loads(download("fixture.json"))
    frame = request("frame")
    jpeg = base64.b64decode(frame["jpeg"], validate=True)
    assert jpeg.startswith(b"\xff\xd8") and frame["width"] > 0
    (evidence / "phone-before.jpg").write_bytes(jpeg)
    aspect = frame["width"] / frame["height"]

    def control(action, **args):
        assert request("control", {"action": action, "aspect": aspect, **args})["applied"]

    control("tap", x=fixture["tap"][0], y=fixture["tap"][1])
    control("tap", x=fixture["entry"][0], y=fixture["entry"][1])
    control("text", text="桌面输入 Echo 你X")
    control("edit", command="delete_backward")
    control("edit", command="insert", text="好😀")
    control("edit", command="delete_backward")
    time.sleep(0.5)
    control("swipe", x=0.5, y=0.8, end_x=0.5, end_y=0.5, duration=400)
    time.sleep(0.5)
    after = request("frame")
    (evidence / "phone-after.jpg").write_bytes(base64.b64decode(after["jpeg"]))

    data = bytes((index * 13) % 251 for index in range(180_017))
    upload("from-desktop.bin", data, resume=True)
    assert download("from-desktop.bin") == data
    phone = download("from-phone.bin")
    assert phone == bytes((index * 17) % 251 for index in range(100_013))
    (evidence / "from-phone.bin").write_bytes(phone)
    report = {
        "realJpeg": True,
        "tapTextSwipeAcknowledged": True,
        "cursorInsertAndEmojiBackspaceAcknowledged": True,
        "binaryUploadBytes": len(data),
        "binaryDownloadBytes": len(phone),
        "sha256Upload": hashlib.sha256(data).hexdigest(),
        "sha256Download": hashlib.sha256(phone).hexdigest(),
        "uploadResumeAndIdempotentChunk": True,
        "frameWidth": frame["width"],
        "frameHeight": frame["height"],
    }
    (evidence / "mirror-proof.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    if not hold:
        upload("mirror-finished.txt", b"verified")
    print(json.dumps(report))
    client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--hold", action="store_true")
    options = parser.parse_args()
    run(options.state, options.evidence, options.hold)
