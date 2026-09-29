"""
RTLSDR-Airband config editor + process manager GUI.

Run with:  python3 app.py
Then open  http://127.0.0.1:5050
"""
import base64
import json
import os
import re
import shutil
import subprocess
import time

import libconf
from flask import Flask, abort, jsonify, request, send_from_directory

import config_io
from live_audio import LiveAudioManager
from process_manager import ProcessManager

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIGS_DIR = os.path.join(BASE_DIR, "configs")
STATE_PATH = os.path.join(BASE_DIR, "state.json")
DEFAULT_RECORDINGS_DIR = os.path.expanduser("~/airband-recordings")
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg"}
LIVE_PORT_BASE = 17300
LIVE_PORT_MAX = LIVE_PORT_BASE + 999
DEFAULT_LIVE_SAMPLE_RATE = 16000  # matches WAVE_RATE for an -DNFM=ON build; 8000 for AM-only builds

app = Flask(__name__, static_folder="static", template_folder="templates")
app.json.sort_keys = False
proc_mgr = ProcessManager()
live_mgr = LiveAudioManager()

VALID_FILENAME = re.compile(r"^[A-Za-z0-9_.-]+\.conf$")


def load_state():
    if os.path.isfile(STATE_PATH):
        with open(STATE_PATH) as f:
            state = json.load(f)
    else:
        state = {}
    state.setdefault("active_config", "basic_multichannel.conf")
    state.setdefault("binary_path", "rtl_airband")
    state.setdefault("recordings_dir", DEFAULT_RECORDINGS_DIR)
    state.setdefault("live_sample_rate", DEFAULT_LIVE_SAMPLE_RATE)
    return state


def save_state(state):
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)


def safe_config_path(filename):
    if not VALID_FILENAME.match(filename or ""):
        raise ValueError("Invalid config filename")
    path = os.path.normpath(os.path.join(CONFIGS_DIR, filename))
    if not path.startswith(CONFIGS_DIR + os.sep):
        raise ValueError("Invalid config filename")
    return path


@app.get("/")
def index():
    return send_from_directory(app.template_folder, "index.html")


@app.get("/api/configs")
def list_configs():
    files = sorted(f for f in os.listdir(CONFIGS_DIR) if f.endswith(".conf"))
    state = load_state()
    return jsonify({"files": files, "active": state.get("active_config")})


@app.post("/api/configs")
def create_config():
    body = request.get_json(force=True)
    filename = body.get("filename", "")
    if not filename.endswith(".conf"):
        filename += ".conf"
    path = safe_config_path(filename)
    if os.path.exists(path):
        return jsonify({"error": "A config with that name already exists"}), 409
    with open(path, "w") as f:
        f.write("devices:\n(\n);\n")
    return jsonify({"ok": True, "filename": filename})


@app.post("/api/configs/select")
def select_config():
    body = request.get_json(force=True)
    filename = body.get("filename", "")
    safe_config_path(filename)  # validates existence path shape
    state = load_state()
    state["active_config"] = filename
    save_state(state)
    return jsonify({"ok": True})


@app.get("/api/config")
def get_config():
    state = load_state()
    path = safe_config_path(state["active_config"])
    with open(path) as f:
        text = f.read()
    try:
        data = config_io.parse_text(text)
        error = None
    except libconf.ConfigParseError as e:
        data = None
        error = str(e)
    return jsonify({"filename": state["active_config"], "data": data, "raw": text, "error": error})


@app.post("/api/config")
def save_config():
    state = load_state()
    path = safe_config_path(state["active_config"])
    body = request.get_json(force=True)
    data = body.get("data")
    try:
        text = config_io.dump_text(data)
    except Exception as e:
        return jsonify({"error": f"Could not serialize config: {e}"}), 400
    with open(path, "w") as f:
        f.write(text)
    return jsonify({"ok": True, "raw": text})


@app.post("/api/config/raw")
def save_raw_config():
    state = load_state()
    path = safe_config_path(state["active_config"])
    body = request.get_json(force=True)
    text = body.get("raw", "")
    try:
        config_io.parse_text(text)  # validate syntax before writing
    except libconf.ConfigParseError as e:
        return jsonify({"error": f"Syntax error: {e}"}), 400
    with open(path, "w") as f:
        f.write(text)
    return jsonify({"ok": True})


@app.post("/api/config/validate")
def validate_raw_config():
    body = request.get_json(force=True)
    text = body.get("raw", "")
    try:
        config_io.parse_text(text)
        return jsonify({"ok": True})
    except libconf.ConfigParseError as e:
        return jsonify({"ok": False, "error": str(e)})


@app.get("/api/settings")
def get_settings():
    state = load_state()
    return jsonify({
        "binary_path": state.get("binary_path", "rtl_airband"),
        "recordings_dir": state.get("recordings_dir", DEFAULT_RECORDINGS_DIR),
        "live_sample_rate": state.get("live_sample_rate", DEFAULT_LIVE_SAMPLE_RATE),
        "live_port_base": LIVE_PORT_BASE,
        "live_port_max": LIVE_PORT_MAX,
    })


@app.post("/api/settings")
def update_settings():
    body = request.get_json(force=True)
    state = load_state()
    if "binary_path" in body:
        state["binary_path"] = body["binary_path"]
    if "recordings_dir" in body:
        state["recordings_dir"] = body["recordings_dir"]
    if "live_sample_rate" in body:
        state["live_sample_rate"] = body["live_sample_rate"]
    save_state(state)
    return jsonify({"ok": True})


@app.get("/api/live/<int:port>/chunk")
def live_chunk(port):
    if not (LIVE_PORT_BASE <= port <= LIVE_PORT_MAX):
        abort(400)
    since = int(request.args.get("since", 0))
    channel = live_mgr.get(port)
    if channel.error is not None:
        return jsonify({"error": f"Could not listen on port {port}: {channel.error}"}), 400
    chunk, next_offset = channel.read_since(since)
    return jsonify({"chunk": base64.b64encode(chunk).decode("ascii"), "next": next_offset})


def safe_recordings_subpath(base_dir, relpath):
    """Resolves relpath under base_dir, refusing any path that escapes it."""
    base = os.path.abspath(base_dir)
    target = os.path.abspath(os.path.join(base, relpath))
    if target != base and not target.startswith(base + os.sep):
        raise ValueError("Path escapes recordings directory")
    return target


@app.get("/api/recordings")
def list_recordings():
    state = load_state()
    base_dir = state.get("recordings_dir", DEFAULT_RECORDINGS_DIR)
    entries = []
    if os.path.isdir(base_dir):
        for root, _dirs, files in os.walk(base_dir):
            for fname in files:
                ext = os.path.splitext(fname)[1].lower()
                if ext not in AUDIO_EXTENSIONS:
                    continue
                full = os.path.join(root, fname)
                try:
                    stat = os.stat(full)
                except OSError:
                    continue
                rel = os.path.relpath(full, base_dir)
                entries.append({
                    "path": rel.replace(os.sep, "/"),
                    "name": fname,
                    "bytes": stat.st_size,
                    "mtime": stat.st_mtime,
                    "date": time.strftime("%Y-%m-%d", time.localtime(stat.st_mtime)),
                })
    entries.sort(key=lambda e: e["mtime"], reverse=True)
    return jsonify({"base_dir": base_dir, "exists": os.path.isdir(base_dir), "recordings": entries})


def folder_opener_command(path):
    """Picks a command to open `path` in the desktop file manager of whatever
    machine this server process is running on. Returns None if none is found
    (e.g. a headless box) - opening a folder only makes sense when the GUI
    runs directly on a machine with its own desktop, not over an SSH tunnel
    from a remote client."""
    for candidate in ("xdg-open", "open"):  # Linux, then macOS
        if shutil.which(candidate):
            return [candidate, path]
    if os.name == "nt" and shutil.which("explorer"):
        return ["explorer", path]
    return None


@app.post("/api/recordings/open")
def open_recordings_folder():
    state = load_state()
    base_dir = state.get("recordings_dir", DEFAULT_RECORDINGS_DIR)
    if not os.path.isdir(base_dir):
        return jsonify({"error": f"Folder does not exist yet: {base_dir}"}), 400
    command = folder_opener_command(base_dir)
    if command is None:
        return jsonify({"error": "No file manager opener found on this machine. This only works when the GUI runs on the same machine as its own desktop, not headless/over SSH."}), 400
    try:
        subprocess.Popen(command)
    except OSError as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"ok": True})


@app.delete("/api/recordings/<path:relpath>")
def delete_recording(relpath):
    state = load_state()
    base_dir = state.get("recordings_dir", DEFAULT_RECORDINGS_DIR)
    try:
        full = safe_recordings_subpath(base_dir, relpath)
    except ValueError:
        abort(403)
    if not os.path.isfile(full):
        abort(404)
    os.remove(full)
    return jsonify({"ok": True})


@app.get("/audio/<path:relpath>")
def serve_audio(relpath):
    state = load_state()
    base_dir = state.get("recordings_dir", DEFAULT_RECORDINGS_DIR)
    try:
        full = safe_recordings_subpath(base_dir, relpath)
    except ValueError:
        abort(403)
    if not os.path.isfile(full):
        abort(404)
    directory, filename = os.path.split(full)
    return send_from_directory(directory, filename)


@app.get("/api/process/status")
def process_status():
    return jsonify(proc_mgr.status())


@app.get("/api/process/logs")
def process_logs():
    since = int(request.args.get("since", 0))
    lines = proc_mgr.logs(since)
    return jsonify({"lines": lines, "next": since + len(lines)})


@app.post("/api/process/start")
def process_start():
    state = load_state()
    config_path = safe_config_path(state["active_config"])
    try:
        proc_mgr.start(state.get("binary_path", "rtl_airband"), config_path)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"ok": True})


@app.post("/api/process/stop")
def process_stop():
    proc_mgr.stop()
    return jsonify({"ok": True})


@app.post("/api/process/restart")
def process_restart():
    state = load_state()
    config_path = safe_config_path(state["active_config"])
    try:
        proc_mgr.restart(state.get("binary_path", "rtl_airband"), config_path)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"ok": True})


if __name__ == "__main__":
    if not os.path.isfile(STATE_PATH):
        save_state(load_state())
    app.run(host="127.0.0.1", port=5050, debug=False)
