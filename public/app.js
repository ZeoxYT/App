/* ZEOX Dashboard — API-backed client script.
   Uses /api/obfuscate on the backend. No client-side obfuscator. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const fmtBytes = (n) => {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / 1024 / 1024).toFixed(2) + " MB";
  };

  const LS_KEY_LOGS = "zeox.logs";
  const LS_KEY_APIKEY = "zeox.apikey";
  const LS_KEY_APIKEY_CREATED = "zeox.apikey.created";
  const LS_KEY_USED = "zeox.used.today";
  const LS_KEY_USED_DATE = "zeox.used.date";
  const DAILY_LIMIT_KB = 500;

  /* ================= Tabs ================= */
  const tabTitles = {
    obfuscator: { t: "Obfuscator", s: "Compile and protect your Luau scripts" },
    logs: { t: "Encrypted Files", s: "History of files you've protected" },
    apikey: { t: "API Key", s: "Authenticate your requests to the ZEOX API" },
    docs: { t: "Documentation", s: "Under maintenance" },
    about: { t: "About Us", s: "About the ZEOX project" },
  };

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab").forEach((s) => s.classList.remove("active"));
      const target = $("tab-" + tab);
      if (target) target.classList.add("active");
      const info = tabTitles[tab];
      if (info) {
        $("page-title").innerText = info.t;
        $("page-sub").innerText = info.s;
      }
    });
  });

  /* ================= Toast ================= */
  const toastEl = $("toast");
  let toastTimer;
  function toast(msg, kind = "ok") {
    if (!toastEl) return;
    toastEl.innerText = msg;
    toastEl.className = "toast show " + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.className = "toast"), 2400);
  }

  /* ================= Quota ================= */
  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }
  function getUsedKB() {
    if (localStorage.getItem(LS_KEY_USED_DATE) !== todayKey()) {
      localStorage.setItem(LS_KEY_USED_DATE, todayKey());
      localStorage.setItem(LS_KEY_USED, "0");
    }
    return parseFloat(localStorage.getItem(LS_KEY_USED) || "0");
  }
  function addUsedKB(kb) {
    const cur = getUsedKB() + kb;
    localStorage.setItem(LS_KEY_USED, String(cur));
    renderQuota();
  }
  function renderQuota() {
    const used = getUsedKB();
    const remain = Math.max(0, DAILY_LIMIT_KB - used);
    const fmt = (n) => (n < 10 ? n.toFixed(1) : Math.round(n).toString());
    $("stat-used").innerHTML = `${fmt(used)} <em>KB</em>`;
    $("stat-remain").innerHTML = `${fmt(remain)} <em>KB</em>`;
    $("quota-remain").innerText = fmt(remain);
  }

  /* ================= Editor size ================= */
  const inputEditor = $("input-editor");
  const outputEditor = $("output-editor");
  const inputSize = $("input-size");
  const outputSize = $("output-size");
  const statusPill = $("status-pill");

  function setStatus(text, kind) {
    statusPill.className = "status-pill " + (kind || "ok");
    statusPill.innerText = text;
  }
  function refreshInputSize() {
    inputSize.innerText = fmtBytes(new Blob([inputEditor.value]).size);
  }
  function refreshOutputSize() {
    outputSize.innerText = fmtBytes(new Blob([outputEditor.value]).size);
  }
  inputEditor.addEventListener("input", refreshInputSize);
  refreshInputSize();

  /* ================= File upload ================= */
  $("file-input").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      inputEditor.value = ev.target.result;
      refreshInputSize();
      toast(`Loaded "${file.name}"`);
    };
    reader.onerror = () => toast("Failed to read file", "err");
    reader.readAsText(file);
    e.target.value = "";
  });

  /* ================= Obfuscate (API) ================= */
  const btnObfuscate = $("btn-obfuscate");
  const btnCopy = $("btn-copy");
  const btnDownload = $("btn-download");

  btnObfuscate.addEventListener("click", async () => {
    const code = inputEditor.value;
    if (!code.trim()) {
      toast("Please enter your Luau code first", "warn");
      return;
    }

    const sizeKB = new Blob([code]).size / 1024;
    if (getUsedKB() + sizeKB > DAILY_LIMIT_KB) {
      toast("Daily quota exceeded", "err");
      setStatus("Quota Exceeded", "err");
      return;
    }

    const payload = {
      code,
      options: {
        noRename: !$("opt-rename").checked,
        encodeStrings: $("opt-encode").checked,
        scramble: $("opt-scramble").checked,
        minify: $("opt-minify").checked,
      },
    };

    const apiKey = localStorage.getItem(LS_KEY_APIKEY) || "";

    btnObfuscate.disabled = true;
    setStatus("Working…", "warn");

    try {
      const res = await fetch("/api/obfuscate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-API-Key": apiKey, Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (!data.output) throw new Error("Empty response from API");

      outputEditor.value = data.output;
      refreshOutputSize();
      btnCopy.disabled = false;
      btnDownload.disabled = false;
      setStatus("Success", "ok");
      addUsedKB(sizeKB);
      pushLog({
        name: `zeox_${Date.now()}.lua`,
        size: new Blob([data.output]).size,
        at: new Date().toISOString(),
        content: data.output,
      });
      toast("Obfuscation complete");
    } catch (err) {
      outputEditor.value = "";
      refreshOutputSize();
      btnCopy.disabled = true;
      btnDownload.disabled = true;
      setStatus("Failed", "err");
      toast(`Error: ${err.message}`, "err");
    } finally {
      btnObfuscate.disabled = false;
    }
  });

  btnCopy.addEventListener("click", () => {
    if (!outputEditor.value.trim()) return;
    navigator.clipboard
      .writeText(outputEditor.value)
      .then(() => toast("Copied to clipboard"))
      .catch(() => toast("Copy failed", "err"));
  });

  btnDownload.addEventListener("click", () => {
    if (!outputEditor.value.trim()) return;
    const blob = new Blob([outputEditor.value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zeox_obfuscated.lua";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Download started");
  });

  /* ================= Logs ================= */
  const logsList = $("logs-list");
  function getLogs() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY_LOGS) || "[]");
    } catch {
      return [];
    }
  }
  function saveLogs(l) {
    localStorage.setItem(LS_KEY_LOGS, JSON.stringify(l.slice(0, 50)));
  }
  function pushLog(entry) {
    const l = getLogs();
    l.unshift(entry);
    saveLogs(l);
    renderLogs();
  }
  function renderLogs() {
    const l = getLogs();
    if (!l.length) {
      logsList.innerHTML = `<div class="empty">No obfuscated files yet.</div>`;
      return;
    }
    logsList.innerHTML = l
      .map(
        (e, i) => `
      <div class="log-row">
        <div class="log-info">
          <b>${e.name}</b>
          <span class="muted small">${fmtBytes(e.size)} · ${new Date(e.at).toLocaleString()}</span>
        </div>
        <div class="row-actions">
          <button class="btn ghost sm" data-log-copy="${i}">Copy</button>
          <button class="btn ghost sm" data-log-dl="${i}">Download</button>
          <button class="btn ghost sm" data-log-del="${i}">Delete</button>
        </div>
      </div>`
      )
      .join("");
  }
  logsList.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const logs = getLogs();
    if (t.dataset.logCopy != null) {
      navigator.clipboard.writeText(logs[+t.dataset.logCopy].content).then(() => toast("Copied"));
    } else if (t.dataset.logDl != null) {
      const item = logs[+t.dataset.logDl];
      const blob = new Blob([item.content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.name;
      a.click();
      URL.revokeObjectURL(url);
    } else if (t.dataset.logDel != null) {
      logs.splice(+t.dataset.logDel, 1);
      saveLogs(logs);
      renderLogs();
    }
  });
  $("btn-clear-logs").addEventListener("click", () => {
    saveLogs([]);
    renderLogs();
    toast("Logs cleared");
  });
  renderLogs();

  /* ================= API Key ================= */
  function genKey() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return (
      "zx_" +
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );
  }
  function ensureKey() {
    let k = localStorage.getItem(LS_KEY_APIKEY);
    if (!k) {
      k = genKey();
      localStorage.setItem(LS_KEY_APIKEY, k);
      localStorage.setItem(LS_KEY_APIKEY_CREATED, new Date().toISOString());
    }
    return k;
  }
  function renderKey() {
    const k = ensureKey();
    $("apikey-value").innerText = k;
    const created = localStorage.getItem(LS_KEY_APIKEY_CREATED);
    $("apikey-created").innerText = created ? new Date(created).toLocaleDateString() : "—";
  }
  $("btn-copy-key").addEventListener("click", () => {
    navigator.clipboard.writeText(ensureKey()).then(() => toast("API key copied"));
  });
  $("btn-regen-key").addEventListener("click", () => {
    if (!confirm("Regenerate API key? The old key will stop working.")) return;
    localStorage.setItem(LS_KEY_APIKEY, genKey());
    localStorage.setItem(LS_KEY_APIKEY_CREATED, new Date().toISOString());
    renderKey();
    toast("API key regenerated");
  });
  renderKey();

  /* ================= Init ================= */
  renderQuota();
  setStatus("Ready", "ok");
})();
