// RTLSDR-Airband Repeater Recorder GUI - vanilla JS, no build step.

let configData = {};
let rawText = "";
let logSince = 0;
let logPollTimer = null;
let lastKnownRecordingsDir = "~/airband-recordings";

// ---------- live listening ----------
let livePortBase = 17300;
let liveSampleRate = 16000;
let audioCtx = null;
// port -> { gainNode, since, nextStartTime, timer, gotAudio, lastVolume, muted, statusEl }
const liveSessions = {};

function ensureAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function findUdpOutput(ch) {
  return (ch.outputs || []).find((o) => scalarGet(o, "type", "") === "udp_stream");
}

function channelLivePort(ch, idx) {
  const existing = findUdpOutput(ch);
  return existing ? scalarGet(existing, "dest_port", livePortBase + idx) : livePortBase + idx;
}

function setLiveEnabled(ch, idx, enabled) {
  if (!Array.isArray(ch.outputs)) ch.outputs = [];
  const existing = findUdpOutput(ch);
  if (enabled && !existing) {
    ch.outputs.push({
      type: scalar("string", "udp_stream"),
      dest_address: scalar("string", "127.0.0.1"),
      dest_port: scalar("int", livePortBase + idx),
    });
  } else if (!enabled && existing) {
    stopListening(channelLivePort(ch, idx));
    ch.outputs.splice(ch.outputs.indexOf(existing), 1);
  }
}

function startListening(port, initialVolume, initialMuted, statusEl) {
  const ctx = ensureAudioCtx();
  const gainNode = ctx.createGain();
  gainNode.gain.value = initialMuted ? 0 : initialVolume;
  gainNode.connect(ctx.destination);
  const session = {
    gainNode,
    since: 0,
    nextStartTime: ctx.currentTime,
    gotAudio: false,
    lastVolume: initialVolume,
    muted: initialMuted,
    statusEl,
  };
  liveSessions[port] = session;
  statusEl.textContent = "Buffering…";

  session.timer = setInterval(async () => {
    const s = liveSessions[port];
    if (!s) return;
    try {
      const data = await api(`/api/live/${port}/chunk?since=${s.since}`);
      s.since = data.next;
      if (!data.chunk) return;
      const bytes = Uint8Array.from(atob(data.chunk), (c) => c.charCodeAt(0));
      const floatCount = Math.floor(bytes.length / 4);
      if (floatCount === 0) return;
      const floats = new Float32Array(bytes.buffer, 0, floatCount);
      const buffer = ctx.createBuffer(1, floatCount, liveSampleRate);
      buffer.copyToChannel(floats, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(s.gainNode);
      const startAt = Math.max(ctx.currentTime, s.nextStartTime);
      src.start(startAt);
      s.nextStartTime = startAt + buffer.duration;
      s.gotAudio = true;
      s.statusEl.textContent = "Live";
    } catch (err) {
      s.statusEl.textContent = err.message;
    }
  }, 250);
}

function stopListening(port) {
  const session = liveSessions[port];
  if (!session) return;
  clearInterval(session.timer);
  session.gainNode.disconnect();
  delete liveSessions[port];
}

function stopAllListening() {
  Object.keys(liveSessions).forEach((port) => stopListening(Number(port)));
}

// ---------- generic helpers ----------
function makeEl(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function isScalar(v) {
  return isPlainObject(v) && v.__scalar__ === true;
}
function scalar(type, value) {
  return { __scalar__: true, type, value };
}
function scalarGet(obj, key, fallback) {
  return obj && isScalar(obj[key]) ? obj[key].value : fallback;
}
function scalarSet(obj, key, type, value) {
  if (isScalar(obj[key])) obj[key].value = value;
  else obj[key] = scalar(type, value);
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function setMsg(elId, text, isError) {
  const el = document.getElementById(elId);
  el.textContent = text;
  el.className = "save-msg" + (isError ? " error" : "");
  setTimeout(() => { el.textContent = ""; }, 4000);
}

// ================================================================
// Repeaters tab
// ================================================================
function normalizeDevice() {
  if (!Array.isArray(configData.devices)) configData.devices = [];
  if (configData.devices.length === 0) {
    configData.devices.push({
      type: scalar("string", "rtlsdr"),
      index: scalar("int", 0),
      gain: scalar("int", 30),
      centerfreq: scalar("float", 145.0),
      correction: scalar("int", 0),
      channels: [],
    });
  }
  const device = configData.devices[0];
  if (!isScalar(device.type)) device.type = scalar("string", "rtlsdr");
  if (!isScalar(device.index)) device.index = scalar("int", 0);
  if (!isScalar(device.gain)) device.gain = scalar("int", 30);
  if (!isScalar(device.centerfreq)) device.centerfreq = scalar("float", 145.0);
  if (!isScalar(device.correction)) device.correction = scalar("int", 0);
  if (!Array.isArray(device.channels)) device.channels = [];
  return device;
}

function makeDeviceField(labelText, obj, key, type) {
  const wrap = makeEl("div", "field");
  wrap.appendChild(makeEl("label", null, labelText));
  const input = document.createElement("input");
  input.type = "number";
  input.step = type === "int" ? "1" : "any";
  input.value = scalarGet(obj, key, 0);
  input.oninput = () => {
    const n = type === "int" ? parseInt(input.value, 10) : parseFloat(input.value);
    scalarSet(obj, key, type, Number.isNaN(n) ? 0 : n);
  };
  wrap.appendChild(input);
  return wrap;
}

function makeTextField(labelText, obj, key, fullWidth) {
  const wrap = makeEl("div", "field" + (fullWidth ? " full" : ""));
  wrap.appendChild(makeEl("label", null, labelText));
  const input = document.createElement("input");
  input.type = "text";
  input.value = scalarGet(obj, key, "");
  input.oninput = () => scalarSet(obj, key, "string", input.value);
  wrap.appendChild(input);
  return wrap;
}

function makeNumberField(labelText, obj, key, type) {
  const wrap = makeEl("div", "field");
  wrap.appendChild(makeEl("label", null, labelText));
  const input = document.createElement("input");
  input.type = "number";
  input.step = type === "int" ? "1" : "any";
  input.value = scalarGet(obj, key, 0);
  input.oninput = () => {
    const n = type === "int" ? parseInt(input.value, 10) : parseFloat(input.value);
    scalarSet(obj, key, type, Number.isNaN(n) ? 0 : n);
  };
  wrap.appendChild(input);
  return wrap;
}

// Handheld-radio-style squelch: a 0-9 level like a Baofeng's SQL knob, mapped
// onto the engine's squelch_snr_threshold (dB above the measured noise floor).
// 0 = "always open" (the engine's own meaning for squelch_snr_threshold=0);
// the engine's built-in auto default is 9.54 dB, i.e. level 5 on this scale.
const SQUELCH_LEVEL_DB_STEP = 2;
const SQUELCH_AUTO_DEFAULT_DB = 9.54;

function squelchLevelToDb(level) {
  return level * SQUELCH_LEVEL_DB_STEP;
}
function squelchDbToLevel(db) {
  return Math.max(0, Math.min(9, Math.round(db / SQUELCH_LEVEL_DB_STEP)));
}

function makeSquelchField(ch) {
  const wrap = makeEl("div", "field full");
  if (isScalar(ch.squelch_threshold)) {
    wrap.appendChild(makeEl("label", null, "Squelch"));
    wrap.appendChild(makeEl("p", "muted", "This channel uses an advanced absolute squelch_threshold (dBFS) — edit it in the Advanced tab."));
    return wrap;
  }

  const currentDb = isScalar(ch.squelch_snr_threshold) ? ch.squelch_snr_threshold.value : SQUELCH_AUTO_DEFAULT_DB;
  const currentLevel = squelchDbToLevel(currentDb);
  const labelEl = makeEl("label", null, "");
  const setLabel = (level) => {
    labelEl.textContent = `Squelch level (like a handheld radio) · ${level === 0 ? "0 — always open" : level}`;
  };
  setLabel(currentLevel);
  wrap.appendChild(labelEl);

  const row = makeEl("div", "squelch-row");
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "9";
  slider.step = "1";
  slider.value = currentLevel;
  slider.oninput = () => {
    const level = parseInt(slider.value, 10);
    setLabel(level);
    scalarSet(ch, "squelch_snr_threshold", "float", squelchLevelToDb(level));
  };
  row.appendChild(slider);
  wrap.appendChild(row);
  wrap.appendChild(makeEl("p", "muted", "0 = hear everything (noise too) · 9 = only the strongest signals open it"));
  return wrap;
}

function makeDefaultFileOutput(name) {
  return {
    type: scalar("string", "file"),
    directory: scalar("string", lastKnownRecordingsDir),
    filename_template: scalar("string", (name || "channel").trim().replace(/\s+/g, "_") || "channel"),
    dated_subdirectories: scalar("bool", true),
    split_on_transmission: scalar("bool", true),
  };
}
function makeDefaultIcecastOutput() {
  return {
    type: scalar("string", "icecast"),
    server: scalar("string", ""),
    port: scalar("int", 8000),
    mountpoint: scalar("string", ""),
    username: scalar("string", "source"),
    password: scalar("string", ""),
  };
}

function makeRepeaterCard(device, ch, idx) {
  const card = makeEl("div", "card");

  const top = makeEl("div", "card-top");
  const nameInput = document.createElement("input");
  nameInput.className = "name-input";
  nameInput.type = "text";
  nameInput.placeholder = `Repeater ${idx + 1}`;
  nameInput.value = scalarGet(ch, "label", "");
  nameInput.oninput = () => scalarSet(ch, "label", "string", nameInput.value);
  top.appendChild(nameInput);
  const removeBtn = makeEl("button", "remove-btn", "✕");
  removeBtn.title = "Remove this repeater";
  removeBtn.onclick = () => {
    if (findUdpOutput(ch)) stopListening(channelLivePort(ch, idx));
    device.channels.splice(idx, 1);
    renderRepeatersTab();
  };
  top.appendChild(removeBtn);
  card.appendChild(top);

  const freqRow = makeEl("div", "freq-row");
  const freqInput = document.createElement("input");
  freqInput.className = "freq-input";
  freqInput.type = "number";
  freqInput.step = "any";
  freqInput.value = scalarGet(ch, "freq", 0);
  freqInput.oninput = () => {
    const n = parseFloat(freqInput.value);
    scalarSet(ch, "freq", "float", Number.isNaN(n) ? 0 : n);
  };
  freqRow.appendChild(freqInput);
  freqRow.appendChild(makeEl("span", "unit", "MHz"));
  const modSelect = document.createElement("select");
  modSelect.className = "mod-select";
  [["nfm", "NFM (repeater / FM)"], ["am", "AM"]].forEach(([value, label]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    modSelect.appendChild(opt);
  });
  // RTLSDR-Airband defaults to AM when the field is absent - reflect that
  // truthfully instead of silently writing "nfm" into a config that never had it.
  modSelect.value = scalarGet(ch, "modulation", "am");
  modSelect.onchange = () => scalarSet(ch, "modulation", "string", modSelect.value);
  freqRow.appendChild(modSelect);
  card.appendChild(freqRow);

  const fieldsWrap = makeEl("div", "card-fields");
  fieldsWrap.appendChild(makeSquelchField(ch));
  card.appendChild(fieldsWrap);

  if (!Array.isArray(ch.outputs)) ch.outputs = [];
  if (ch.outputs.length === 0) ch.outputs.push(makeDefaultFileOutput(nameInput.value || `channel${idx + 1}`));
  const out = ch.outputs[0];
  const outType = scalarGet(out, "type", "file");

  const typeRow = makeEl("div", "output-type-row");
  const fileBtn = document.createElement("button");
  fileBtn.type = "button";
  fileBtn.textContent = "Record to file";
  fileBtn.className = outType === "file" ? "selected" : "";
  fileBtn.onclick = () => {
    if (outType !== "file") { ch.outputs[0] = makeDefaultFileOutput(nameInput.value || `channel${idx + 1}`); renderRepeatersTab(); }
  };
  const icecastBtn = document.createElement("button");
  icecastBtn.type = "button";
  icecastBtn.textContent = "Stream to Icecast";
  icecastBtn.className = outType === "icecast" ? "selected" : "";
  icecastBtn.onclick = () => {
    if (outType !== "icecast") { ch.outputs[0] = makeDefaultIcecastOutput(); renderRepeatersTab(); }
  };
  typeRow.appendChild(fileBtn);
  typeRow.appendChild(icecastBtn);
  card.appendChild(typeRow);

  if (ch.outputs.length > 1) {
    card.appendChild(makeEl("p", "muted", `+${ch.outputs.length - 1} more output(s) on this channel — edit in Advanced tab`));
  }

  const outFields = makeEl("div", "card-fields");
  if (outType === "file") {
    outFields.appendChild(makeTextField("Directory", out, "directory", true));
    outFields.appendChild(makeTextField("Filename prefix", out, "filename_template", true));
  } else {
    outFields.appendChild(makeTextField("Icecast server", out, "server", true));
    outFields.appendChild(makeNumberField("Port", out, "port", "int"));
    outFields.appendChild(makeTextField("Mountpoint", out, "mountpoint"));
    outFields.appendChild(makeTextField("Username", out, "username"));
    outFields.appendChild(makeTextField("Password", out, "password"));
  }
  card.appendChild(outFields);

  const liveBlock = makeEl("div", "live-block");
  const liveLabel = document.createElement("label");
  const liveToggle = document.createElement("input");
  liveToggle.type = "checkbox";
  liveToggle.checked = !!findUdpOutput(ch);
  liveLabel.appendChild(liveToggle);
  liveLabel.append(" Enable live listening (adds a UDP output — needs Save + Restart to take effect)");
  liveToggle.onchange = () => { setLiveEnabled(ch, idx, liveToggle.checked); renderRepeatersTab(); };
  liveBlock.appendChild(liveLabel);

  if (findUdpOutput(ch)) {
    const port = channelLivePort(ch, idx);
    const existingSession = liveSessions[port];
    const controls = makeEl("div", "live-controls");

    const listenBtn = document.createElement("button");
    listenBtn.type = "button";
    listenBtn.textContent = existingSession ? "Stop listening" : "Listen live";

    const volume = document.createElement("input");
    volume.type = "range";
    volume.min = "0";
    volume.max = "1";
    volume.step = "0.01";
    volume.value = existingSession ? existingSession.lastVolume : 0.8;

    const muteLabel = document.createElement("label");
    const muteCb = document.createElement("input");
    muteCb.type = "checkbox";
    muteCb.checked = existingSession ? existingSession.muted : false;
    muteLabel.appendChild(muteCb);
    muteLabel.append(" Mute");

    const statusEl = makeEl("span", "muted live-status", existingSession ? (existingSession.gotAudio ? "Live" : "Buffering…") : "Live listening off");
    if (existingSession) existingSession.statusEl = statusEl;

    listenBtn.onclick = () => {
      if (liveSessions[port]) {
        stopListening(port);
      } else {
        startListening(port, parseFloat(volume.value), muteCb.checked, statusEl);
      }
      renderRepeatersTab();
    };
    volume.oninput = () => {
      const s = liveSessions[port];
      if (!s) return;
      s.lastVolume = parseFloat(volume.value);
      s.gainNode.gain.value = s.muted ? 0 : s.lastVolume;
    };
    muteCb.onchange = () => {
      const s = liveSessions[port];
      if (!s) return;
      s.muted = muteCb.checked;
      s.gainNode.gain.value = s.muted ? 0 : s.lastVolume;
    };

    controls.appendChild(listenBtn);
    controls.appendChild(makeEl("span", "muted", "Volume"));
    controls.appendChild(volume);
    controls.appendChild(muteLabel);
    controls.appendChild(statusEl);
    liveBlock.appendChild(controls);
  }
  card.appendChild(liveBlock);

  return card;
}

function renderRepeatersTab() {
  const device = normalizeDevice();

  const grid = document.getElementById("device-grid");
  grid.innerHTML = "";
  grid.appendChild(makeDeviceField("Device index", device, "index", "int"));
  grid.appendChild(makeDeviceField("Gain · dB", device, "gain", "float"));
  grid.appendChild(makeDeviceField("Center frequency · MHz", device, "centerfreq", "float"));
  grid.appendChild(makeDeviceField("Correction · ppm", device, "correction", "int"));

  const cardsEl = document.getElementById("repeater-cards");
  cardsEl.innerHTML = "";
  device.channels.forEach((ch, idx) => cardsEl.appendChild(makeRepeaterCard(device, ch, idx)));
}

document.getElementById("btn-add-repeater").addEventListener("click", () => {
  const device = normalizeDevice();
  const idx = device.channels.length;
  device.channels.push({
    freq: scalar("float", 0),
    modulation: scalar("string", "nfm"),
    outputs: [makeDefaultFileOutput(`repeater${idx + 1}`)],
  });
  renderRepeatersTab();
});

// ================================================================
// Advanced tab: generic recursive tree editor (fallback for anything
// the Repeaters tab doesn't model: multiple devices, mixers, scan mode, ...)
// ================================================================
function getParent(root, path) {
  let obj = root;
  for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
  return obj;
}
function setAt(root, path, value) {
  if (path.length === 0) return;
  getParent(root, path)[path[path.length - 1]] = value;
}
function deleteAt(root, path) {
  const parent = getParent(root, path);
  const last = path[path.length - 1];
  if (Array.isArray(parent)) parent.splice(last, 1);
  else delete parent[last];
}
function getAtPath(root, path) {
  let obj = root;
  for (const p of path) obj = obj[p];
  return obj;
}

function renderRoot() {
  const container = document.getElementById("visual-editor");
  container.innerHTML = "";
  renderObject(container, configData, [], "config root");
}

function renderObject(container, obj, path, label) {
  const group = makeEl("div", "node-group");
  group.appendChild(makeEl("div", "node-title", label));
  renderObjectBody(group, obj, path);
  container.appendChild(group);
}

function renderObjectBody(container, obj, path) {
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    const childPath = [...path, key];
    if (isScalar(value)) {
      renderScalarRow(container, key, value, childPath);
    } else if (isPlainObject(value) || Array.isArray(value)) {
      const wrapper = makeEl("div");
      const wrapTitle = makeEl("div", "node-title");
      const nameSpan = makeEl("span", null, key + (Array.isArray(value) ? ` [${value.length}]` : ""));
      const removeBtn = makeEl("button", "remove-btn", "✕");
      removeBtn.onclick = () => { deleteAt(configData, childPath); renderRoot(); };
      wrapTitle.appendChild(nameSpan);
      wrapTitle.appendChild(removeBtn);
      wrapper.appendChild(wrapTitle);
      if (Array.isArray(value)) renderArrayBody(wrapper, value, childPath);
      else renderObjectBody(wrapper, value, childPath);
      container.appendChild(wrapper);
    }
  });
  container.appendChild(makeAddFieldRow(path));
}

function renderArrayBody(container, arr, path) {
  arr.forEach((item, idx) => {
    const itemPath = [...path, idx];
    const itemWrapper = makeEl("div", "list-item");
    const header = makeEl("div", "list-item-header");
    header.appendChild(makeEl("span", null, `#${idx}`));
    const removeBtn = makeEl("button", "remove-btn", "✕");
    removeBtn.onclick = () => { deleteAt(configData, itemPath); renderRoot(); };
    header.appendChild(removeBtn);
    itemWrapper.appendChild(header);
    if (isScalar(item)) renderScalarRow(itemWrapper, null, item, itemPath, true);
    else if (isPlainObject(item)) renderObjectBody(itemWrapper, item, itemPath);
    else if (Array.isArray(item)) renderArrayBody(itemWrapper, item, itemPath);
    container.appendChild(itemWrapper);
  });

  const addRow = makeEl("div", "add-row");
  const addBtn = makeEl("button", null, "+ Add item");
  addBtn.onclick = () => {
    const clone = arr.length > 0 ? JSON.parse(JSON.stringify(arr[arr.length - 1])) : {};
    arr.push(clone);
    renderRoot();
  };
  addRow.appendChild(addBtn);
  container.appendChild(addRow);
}

function renderScalarRow(container, key, scalarVal, path, isListScalar) {
  const row = makeEl("div", "node-row");
  if (!isListScalar) row.appendChild(makeEl("span", "key-label", key));

  let input;
  if (scalarVal.type === "bool") {
    input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!scalarVal.value;
    input.onchange = () => { scalarVal.value = input.checked; };
  } else if (scalarVal.type === "int" || scalarVal.type === "float") {
    input = document.createElement("input");
    input.type = "number";
    input.step = scalarVal.type === "int" ? "1" : "any";
    input.value = scalarVal.value;
    input.oninput = () => {
      const n = scalarVal.type === "int" ? parseInt(input.value, 10) : parseFloat(input.value);
      scalarVal.value = Number.isNaN(n) ? 0 : n;
    };
  } else {
    input = document.createElement("input");
    input.type = "text";
    input.value = scalarVal.value === null ? "" : scalarVal.value;
    input.oninput = () => { scalarVal.value = input.value; };
  }
  row.appendChild(input);

  const removeBtn = makeEl("button", "remove-btn", "✕");
  removeBtn.onclick = () => { deleteAt(configData, path); renderRoot(); };
  row.appendChild(removeBtn);
  container.appendChild(row);
}

function makeAddFieldRow(path) {
  const addRow = makeEl("div", "add-row");
  const keyInput = document.createElement("input");
  keyInput.type = "text";
  keyInput.placeholder = "field name";
  const typeSelect = document.createElement("select");
  ["String", "Integer", "Float", "Boolean", "Group", "List"].forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    typeSelect.appendChild(opt);
  });
  const addBtn = document.createElement("button");
  addBtn.textContent = "+ Add field";
  addBtn.onclick = () => {
    const key = keyInput.value.trim();
    if (!key) return;
    const target = path.length === 0 ? configData : getAtPath(configData, path);
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      alert(`Field "${key}" already exists`);
      return;
    }
    const defaults = {
      String: scalar("string", ""),
      Integer: scalar("int", 0),
      Float: scalar("float", 0.0),
      Boolean: scalar("bool", false),
      Group: {},
      List: [],
    };
    target[key] = defaults[typeSelect.value];
    renderRoot();
  };
  addRow.appendChild(keyInput);
  addRow.appendChild(typeSelect);
  addRow.appendChild(addBtn);
  return addRow;
}

// ================================================================
// Config file load/save (shared by Repeaters + Advanced + Raw tabs)
// ================================================================
async function loadConfigList() {
  const data = await api("/api/configs");
  const select = document.getElementById("config-select");
  select.innerHTML = "";
  data.files.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    if (f === data.active) opt.selected = true;
    select.appendChild(opt);
  });
}

async function loadConfig() {
  stopAllListening();
  const data = await api("/api/config");
  configData = data.data || {};
  rawText = data.raw || "";
  document.getElementById("raw-editor").value = rawText;
  if (data.error) setMsg("save-msg", `Parse error in saved file: ${data.error}`, true);
  renderRepeatersTab();
  renderRoot();
}

document.getElementById("config-select").addEventListener("change", async (e) => {
  await api("/api/configs/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: e.target.value }),
  });
  await loadConfig();
});

document.getElementById("btn-new-config").addEventListener("click", async () => {
  const name = window.prompt("New config filename (e.g. my_station.conf):");
  if (!name) return;
  try {
    await api("/api/configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: name }),
    });
    await loadConfigList();
    const filename = name.endsWith(".conf") ? name : name + ".conf";
    document.getElementById("config-select").value = filename;
    await api("/api/configs/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    });
    await loadConfig();
  } catch (err) {
    alert(err.message);
  }
});

// Shared by the header Save button and the Start/Restart buttons, which save
// first - restarting the engine against a stale on-disk config is never what
// you want, and saving unchanged content back is harmless.
async function saveConfig() {
  const data = await api("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: configData }),
  });
  rawText = data.raw;
  document.getElementById("raw-editor").value = rawText;
}

document.getElementById("btn-save").addEventListener("click", async () => {
  try {
    await saveConfig();
    setMsg("save-msg", "Saved", false);
  } catch (err) {
    setMsg("save-msg", err.message, true);
  }
});

document.getElementById("btn-validate-raw").addEventListener("click", async () => {
  const raw = document.getElementById("raw-editor").value;
  try {
    const res = await api("/api/config/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    setMsg("raw-save-msg", res.ok ? "Valid syntax" : res.error, !res.ok);
  } catch (err) {
    setMsg("raw-save-msg", err.message, true);
  }
});

document.getElementById("btn-save-raw").addEventListener("click", async () => {
  const raw = document.getElementById("raw-editor").value;
  try {
    await api("/api/config/raw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    setMsg("raw-save-msg", "Saved", false);
    await loadConfig();
  } catch (err) {
    setMsg("raw-save-msg", err.message, true);
  }
});

// ================================================================
// Recordings tab
// ================================================================
function formatBytes(n) {
  if (n > 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  return (n / 1024).toFixed(0) + " KB";
}

async function fetchAndRenderRecordings() {
  const list = document.getElementById("recordings-list");
  const meta = document.getElementById("recordings-meta");
  list.textContent = "Loading…";
  try {
    const data = await api("/api/recordings");
    if (!data.exists) {
      meta.textContent = `Folder does not exist yet: ${data.base_dir} (it's created automatically once recording starts)`;
    } else {
      meta.textContent = `${data.recordings.length} clip(s) in ${data.base_dir}`;
    }
    list.innerHTML = "";
    if (data.recordings.length === 0) {
      list.appendChild(makeEl("p", "muted", "No recordings yet."));
      return;
    }
    let lastDate = null;
    data.recordings.forEach((r) => {
      if (r.date !== lastDate) {
        list.appendChild(makeEl("h3", null, r.date));
        lastDate = r.date;
      }
      const row = makeEl("div", "clip");
      const info = makeEl("div", "clip-info");
      info.appendChild(makeEl("strong", null, r.name));
      info.appendChild(makeEl("small", null, `${formatBytes(r.bytes)} · ${new Date(r.mtime * 1000).toLocaleTimeString()}`));
      row.appendChild(info);
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.preload = "none";
      audio.src = "/audio/" + r.path.split("/").map(encodeURIComponent).join("/");
      row.appendChild(audio);
      const link = document.createElement("a");
      link.href = audio.src;
      link.download = r.name;
      link.textContent = "Download";
      row.appendChild(link);
      list.appendChild(row);
    });
  } catch (err) {
    list.textContent = "";
    meta.textContent = err.message;
  }
}

document.getElementById("btn-refresh-recordings").addEventListener("click", fetchAndRenderRecordings);
document.getElementById("btn-save-recordings-dir").addEventListener("click", async () => {
  const dir = document.getElementById("recordings-dir").value;
  await api("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recordings_dir: dir }),
  });
  lastKnownRecordingsDir = dir;
  fetchAndRenderRecordings();
});

// ================================================================
// Tabs
// ================================================================
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "process") startLogPolling();
    else stopLogPolling();
    // Repeaters and Advanced both edit the same configData in place, but each
    // only re-renders itself on its own edits - re-render whichever tab we're
    // entering so it picks up changes made from the other one.
    if (btn.dataset.tab === "recordings") fetchAndRenderRecordings();
    else if (btn.dataset.tab === "repeaters") renderRepeatersTab();
    else if (btn.dataset.tab === "advanced") renderRoot();
  });
});

// ================================================================
// Process control
// ================================================================
async function loadSettings() {
  const data = await api("/api/settings");
  document.getElementById("binary-path").value = data.binary_path || "";
  document.getElementById("recordings-dir").value = data.recordings_dir || lastKnownRecordingsDir;
  document.getElementById("live-sample-rate").value = data.live_sample_rate || liveSampleRate;
  lastKnownRecordingsDir = data.recordings_dir || lastKnownRecordingsDir;
  liveSampleRate = data.live_sample_rate || liveSampleRate;
  livePortBase = data.live_port_base || livePortBase;
}

document.getElementById("btn-save-binary").addEventListener("click", async () => {
  await api("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ binary_path: document.getElementById("binary-path").value }),
  });
});

document.getElementById("btn-save-live-rate").addEventListener("click", async () => {
  const rate = parseInt(document.getElementById("live-sample-rate").value, 10) || 16000;
  await api("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ live_sample_rate: rate }),
  });
  liveSampleRate = rate;
});

document.getElementById("btn-start").addEventListener("click", async () => {
  logSince = 0;
  document.getElementById("log-view").textContent = "";
  try {
    await saveConfig();
    await api("/api/process/start", { method: "POST" });
  } catch (err) {
    alert(err.message);
  }
  refreshStatus();
});
document.getElementById("btn-stop").addEventListener("click", async () => {
  await api("/api/process/stop", { method: "POST" });
  refreshStatus();
});
document.getElementById("btn-restart").addEventListener("click", async () => {
  logSince = 0;
  document.getElementById("log-view").textContent = "";
  try {
    await saveConfig();
    await api("/api/process/restart", { method: "POST" });
  } catch (err) {
    alert(err.message);
  }
  refreshStatus();
});

async function refreshStatus() {
  const status = await api("/api/process/status");
  const pill = document.getElementById("status-pill");
  const procStatus = document.getElementById("proc-status");
  document.getElementById("btn-start").disabled = status.running;
  document.getElementById("btn-restart").disabled = !status.running;
  document.getElementById("btn-stop").disabled = !status.running;
  if (status.running) {
    pill.textContent = `running · pid ${status.pid}`;
    pill.className = "status-pill running";
    procStatus.textContent = "";
  } else {
    pill.textContent = "stopped";
    pill.className = "status-pill";
    procStatus.textContent = status.last_exit_code !== null
      ? `last exit code ${status.last_exit_code}`
      : "";
  }
}

async function pollLogs() {
  const data = await api(`/api/process/logs?since=${logSince}`);
  if (data.lines.length) {
    const view = document.getElementById("log-view");
    view.textContent += data.lines.join("\n") + "\n";
    view.scrollTop = view.scrollHeight;
    logSince = data.next;
  }
}
function startLogPolling() {
  stopLogPolling();
  pollLogs();
  logPollTimer = setInterval(pollLogs, 2000);
}
function stopLogPolling() {
  if (logPollTimer) clearInterval(logPollTimer);
  logPollTimer = null;
}

// ================================================================
// Init
// ================================================================
(async function init() {
  await loadSettings();
  await loadConfigList();
  await loadConfig();
  await refreshStatus();
  setInterval(refreshStatus, 3000);
})();
