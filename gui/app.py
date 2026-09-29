"""
RTLSDR-Airband config editor + process manager GUI.

Run with:  python3 app.py
Then open  http://127.0.0.1:5050
"""
import json
import os
import re

import libconf
from flask import Flask, jsonify, request, send_from_directory

import config_io
from process_manager import ProcessManager

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIGS_DIR = os.path.join(BASE_DIR, "configs")
STATE_PATH = os.path.join(BASE_DIR, "state.json")

app = Flask(__name__, static_folder="static", template_folder="templates")
app.json.sort_keys = False
proc_mgr = ProcessManager()

VALID_FILENAME = re.compile(r"^[A-Za-z0-9_.-]+\.conf$")


def load_state():
    if os.path.isfile(STATE_PATH):
        with open(STATE_PATH) as f:
            return json.load(f)
    return {"active_config": "basic_multichannel.conf", "binary_path": "rtl_airband"}


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
    return jsonify({"binary_path": state.get("binary_path", "rtl_airband")})


@app.post("/api/settings")
def update_settings():
    body = request.get_json(force=True)
    state = load_state()
    if "binary_path" in body:
        state["binary_path"] = body["binary_path"]
    save_state(state)
    return jsonify({"ok": True})


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
