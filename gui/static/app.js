// RTLSDR-Airband config GUI - vanilla JS, no build step.

let configData = {};
let rawText = "";
let logSince = 0;
let logPollTimer = null;

// ---------- generic path helpers ----------
function getParent(root, path) {
  let obj = root;
  for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
  return obj;
}
function setAt(root, path, value) {
  if (path.length === 0) return;
  const parent = getParent(root, path);
  parent[path[path.length - 1]] = value;
}
function deleteAt(root, path) {
  const parent = getParent(root, path);
  const last = path[path.length - 1];
  if (Array.isArray(parent)) parent.splice(last, 1);
  else delete parent[last];
}
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function isScalar(v) {
  return isPlainObject(v) && v.__scalar__ === true;
}

// ---------- API helpers ----------
async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- visual tree editor ----------
function renderRoot() {
  const container = document.getElementById("visual-editor");
  container.innerHTML = "";
  renderObject(container, configData, [], "config root");
}

function makeEl(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

function renderObject(container, obj, path, label) {
  const group = makeEl("div", "node-group");
  group.appendChild(makeEl("div", "node-title", label));
  renderObjectBody(group, obj, path);
  container.appendChild(group);
}

// like renderObject but without an outer node-title (title already rendered by caller)
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

// `scalar` is {__scalar__:true, type: "int"|"float"|"bool"|"string", value}. It is
// the actual object living inside configData, so mutating scalar.value in place
// updates configData directly - no need to look it up again via path.
function renderScalarRow(container, key, scalar, path, isListScalar) {
  const row = makeEl("div", "node-row");
  if (!isListScalar) row.appendChild(makeEl("span", "key-label", key));

  let input;
  if (scalar.type === "bool") {
    input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!scalar.value;
    input.onchange = () => { scalar.value = input.checked; };
  } else if (scalar.type === "int" || scalar.type === "float") {
    input = document.createElement("input");
    input.type = "number";
    input.step = scalar.type === "int" ? "1" : "any";
    input.value = scalar.value;
    input.oninput = () => {
      const n = scalar.type === "int" ? parseInt(input.value, 10) : parseFloat(input.value);
      scalar.value = Number.isNaN(n) ? 0 : n;
    };
  } else {
    input = document.createElement("input");
    input.type = "text";
    input.value = scalar.value === null ? "" : scalar.value;
    input.oninput = () => { scalar.value = input.value; };
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
      String: { __scalar__: true, type: "string", value: "" },
      Integer: { __scalar__: true, type: "int", value: 0 },
      Float: { __scalar__: true, type: "float", value: 0.0 },
      Boolean: { __scalar__: true, type: "bool", value: false },
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

function getAtPath(root, path) {
  let obj = root;
  for (const p of path) obj = obj[p];
  return obj;
}

// ---------- config load/save ----------
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
  const data = await api("/api/config");
  configData = data.data || {};
  rawText = data.raw || "";
  document.getElementById("raw-editor").value = rawText;
  if (data.error) {
    setMsg("visual-save-msg", `Parse error in saved file: ${data.error}`, true);
  }
  renderRoot();
}

function setMsg(elId, text, isError) {
  const el = document.getElementById(elId);
  el.textContent = text;
  el.className = "save-msg" + (isError ? " error" : "");
  setTimeout(() => { el.textContent = ""; }, 4000);
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
    document.getElementById("config-select").value = name.endsWith(".conf") ? name : name + ".conf";
    await api("/api/configs/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: document.getElementById("config-select").value }),
    });
    await loadConfig();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("btn-save-visual").addEventListener("click", async () => {
  try {
    const data = await api("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: configData }),
    });
    rawText = data.raw;
    document.getElementById("raw-editor").value = rawText;
    setMsg("visual-save-msg", "Saved", false);
  } catch (err) {
    setMsg("visual-save-msg", err.message, true);
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

// ---------- tabs ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "process") startLogPolling();
    else stopLogPolling();
  });
});

// ---------- process control ----------
async function loadSettings() {
  const data = await api("/api/settings");
  document.getElementById("binary-path").value = data.binary_path || "";
}

document.getElementById("btn-save-binary").addEventListener("click", async () => {
  await api("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ binary_path: document.getElementById("binary-path").value }),
  });
});

document.getElementById("btn-start").addEventListener("click", async () => {
  logSince = 0;
  document.getElementById("log-view").textContent = "";
  try {
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
  if (status.running) {
    pill.textContent = `running (pid ${status.pid})`;
    pill.className = "status-pill running";
    procStatus.textContent = `Running, PID ${status.pid}`;
  } else {
    pill.textContent = "stopped";
    pill.className = "status-pill stopped";
    procStatus.textContent = status.last_exit_code !== null
      ? `Stopped (last exit code ${status.last_exit_code})`
      : "Stopped";
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

// ---------- init ----------
(async function init() {
  await loadConfigList();
  await loadConfig();
  await loadSettings();
  await refreshStatus();
  setInterval(refreshStatus, 3000);
})();
