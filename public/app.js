document.addEventListener("DOMContentLoaded", () => {
  /* ================= VERIFICATION GATE =================
     Client-side visual gate only (styled like a Cloudflare-type
     "verify you are human" interstitial). It does not perform real
     bot detection - actual anti-bot verification requires a backend
     / a service such as Cloudflare Turnstile. */
  const verifyOverlay = document.getElementById("verify-overlay");
  const verifyBtn = document.getElementById("verify-btn");
  const verifyBox = document.getElementById("verify-box");
  const verifySpinner = document.getElementById("verify-spinner");
  const verifySub = document.getElementById("verify-sub");
  const verifyRayId = document.getElementById("verify-rayid");

  if (verifyRayId) {
    verifyRayId.innerText = Array.from({ length: 16 }, () =>
      "0123456789ABCDEF"[Math.floor(Math.random() * 16)]
    ).join("");
  }

  let verified = false;
  verifyBtn?.addEventListener("click", () => {
    if (verified || verifyBtn.disabled) return;
    verifyBtn.disabled = true;
    verifySpinner.classList.remove("hidden");
    verifySub.innerText = "Checking your browser...";

    setTimeout(() => {
      verified = true;
      verifySpinner.classList.add("hidden");
      verifyBtn.classList.add("is-verified");
      verifyBtn.setAttribute("aria-pressed", "true");
      verifySub.innerText = "Success! You are verified.";

      setTimeout(() => {
        verifyOverlay.classList.add("verify-hidden");
      }, 500);
    }, 1200);
  });

  /* ================= CUSTOM DROPDOWNS ================= */
  function initDropdown(root) {
    const targetId = root.dataset.target;
    const hiddenSelect = document.getElementById(targetId);
    const trigger = root.querySelector(".zdrop-trigger");
    const triggerText = root.querySelector(".zdrop-trigger-text");
    const options = Array.from(root.querySelectorAll(".zdrop-option"));

    function close() {
      root.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
    }
    const menu = root.querySelector(".zdrop-menu");

    function positionMenu() {
      const rect = trigger.getBoundingClientRect();
      menu.style.left = `${rect.left}px`;
      menu.style.width = `${rect.width}px`;
      menu.style.top = `${rect.bottom + 6}px`;
    }

    function open() {
      document.querySelectorAll(".zdrop.is-open").forEach(d => { if (d !== root) d.classList.remove("is-open"); });
      positionMenu();
      root.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
    }

    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      root.classList.contains("is-open") ? close() : open();
    });

    options.forEach(opt => {
      opt.addEventListener("click", () => {
        options.forEach(o => o.classList.remove("is-active"));
        opt.classList.add("is-active");
        triggerText.innerText = opt.querySelector(".zdrop-option-main").innerText;

        if (hiddenSelect) {
          hiddenSelect.value = opt.dataset.value;
          hiddenSelect.dispatchEvent(new Event("change"));
        }
        close();
      });
    });

    document.addEventListener("click", (e) => {
      if (!root.contains(e.target)) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
    window.addEventListener("scroll", () => { if (root.classList.contains("is-open")) close(); }, true);
    window.addEventListener("resize", () => { if (root.classList.contains("is-open")) close(); });
  }

  document.querySelectorAll(".zdrop").forEach(initDropdown);

  /* ================= MAIN APP ================= */
  const inputEditor = document.getElementById("input-editor");
  const outputEditor = document.getElementById("output-editor");

  function initLineNumbers(textarea, gutter) {
    function render() {
      const lineCount = textarea.value.split("\n").length;
      let out = "";
      for (let i = 1; i <= lineCount; i++) out += i + "\n";
      gutter.innerText = out.trimEnd() ? out : "1";
    }
    textarea.addEventListener("input", render);
    textarea.addEventListener("scroll", () => { gutter.scrollTop = textarea.scrollTop; });
    render();
    return render;
  }

  const inputLines = document.getElementById("input-lines");
  const outputLines = document.getElementById("output-lines");
  const renderInputLines = initLineNumbers(inputEditor, inputLines);
  const renderOutputLines = initLineNumbers(outputEditor, outputLines);

  const optRename = document.getElementById("opt-rename");
  const optPreserve = document.getElementById("opt-preserve");
  const optEncode = document.getElementById("opt-encode");
  const optScramble = document.getElementById("opt-scramble");
  const optOneLine = document.getElementById("opt-oneline");
  const optVmType = document.getElementById("opt-vm-type");
  const optVmLevel = document.getElementById("opt-vm-level");

  const btnObfuscate = document.getElementById("btn-obfuscate");
  const btnCopy = document.getElementById("btn-copy");
  const btnDownload = document.getElementById("btn-download");
  const fileInput = document.getElementById("file-input");

  const statTokens = document.getElementById("stat-tokens");
  const statStatements = document.getElementById("stat-statements");
  const statFunctions = document.getElementById("stat-functions");
  const statLocals = document.getElementById("stat-locals");

  const consoleLog = document.getElementById("terminal-console");
  const statusIndicator = document.getElementById("indicator");
  const statusTitle = document.getElementById("status-title");

  let debounceTimer;

  // Wait for engine then run initial validation
  function waitForEngine(cb) {
    if (window.ZEOXEngine) { cb(); return; }
    const t = setInterval(() => { if (window.ZEOXEngine) { clearInterval(t); cb(); } }, 50);
  }
  waitForEngine(() => {
    logConsole("[SYSTEM] ZEOX client-side engine loaded.", "system");
    performLiveValidation();
  });

  inputEditor.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performLiveValidation, 600);
  });

  btnObfuscate.addEventListener("click", performObfuscation);

  btnCopy.addEventListener("click", () => {
    if (outputEditor.value.trim() === "") return;

    navigator.clipboard.writeText(outputEditor.value).then(() => {
      const copyText = document.getElementById("copy-text");
      const originalText = copyText.innerText;
      copyText.innerText = "Copied!";

      logConsole("[COPY] Obfuscated script copied to clipboard.", "success");

      setTimeout(() => {
        copyText.innerText = originalText;
      }, 2000);
    }).catch(err => {
      logConsole(`[COPY-ERROR] Failed to write to clipboard: ${err.message}`, "error");
    });
  });

  btnDownload.addEventListener("click", () => {
    if (outputEditor.value.trim() === "") return;

    const blob = new Blob([outputEditor.value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zeox_obfuscated.lua";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    logConsole("[DOWNLOAD] Obfuscated script saved as zeox_obfuscated.lua", "success");
  });

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      inputEditor.value = ev.target.result;
      renderInputLines();
      performLiveValidation();
      logConsole(`[UPLOAD] Loaded file "${file.name}" (${file.size} bytes) into editor.`, "success");
    };
    reader.onerror = () => {
      logConsole(`[UPLOAD-ERROR] Failed to read file "${file.name}".`, "error");
    };
    reader.readAsText(file);

    fileInput.value = "";
  });

  function logConsole(message, type = "system") {
    const line = document.createElement("div");
    line.className = `console-line line-${type}`;

    const timestamp = new Date().toLocaleTimeString();
    line.innerText = `[${timestamp}] ${message}`;

    consoleLog.appendChild(line);
    consoleLog.scrollTop = consoleLog.scrollHeight;
  }

  function animateNumber(element, start, end, duration) {
    if (start === end) {
      element.innerText = end;
      return;
    }
    const range = end - start;
    let current = start;
    const increment = end > start ? 1 : -1;
    const stepTime = Math.abs(Math.floor(duration / range));
    const timer = setInterval(() => {
      current += increment;
      element.innerText = current;
      if (current === end) {
        clearInterval(timer);
      }
    }, stepTime || 1);
  }

  function performLiveValidation() {
    const code = inputEditor.value;
    if (!code.trim()) { resetStats(); updateStatus("green", "Ready"); return; }
    if (!window.ZEOXEngine) return;

    const { stats, errors } = ZEOXEngine.analyze(code);
    updateStatCounts(stats);
    clearTerminalLogs();

    if (errors.length > 0) {
      const hasErrors = errors.some(e => e.severity === "error");
      updateStatus(hasErrors ? "red" : "amber", hasErrors ? "Syntax Errors" : "Warnings");
      logConsole(hasErrors ? "[LINTER] Syntax errors:" : "[LINTER] Warnings:", hasErrors ? "error" : "warning");
      errors.forEach(err => {
        const loc = err.line ? `[L:${err.line} C:${err.column}]` : "[GLOBAL]";
        logConsole(`${loc} ${err.message}`, err.severity === "error" ? "error" : "warning");
      });
    } else {
      updateStatus("green", "Syntax Valid");
      logConsole("[LINTER] 0 errors, 0 warnings.", "success");
    }
  }

  async function performObfuscation() {
    const code = inputEditor.value;
    if (!code.trim()) { logConsole("[WARNING] Please enter your Luau code first!", "warning"); return; }
    if (!window.ZEOXEngine) { logConsole("[ERROR] Engine not loaded yet.", "error"); return; }

    const btnText = btnObfuscate.querySelector(".btn-text");
    const loader  = btnObfuscate.querySelector(".btn-loader");
    const origTxt = btnText.innerText;
    btnText.innerText = "Compiling & Protecting...";
    loader.classList.remove("hidden");
    btnObfuscate.disabled = true;

    logConsole("[SYSTEM] Initiating obfuscation pipeline...", "system");

    const options = {
      noRename:      !optRename.checked,
      noPreserve:    !optPreserve.checked,
      encodeStrings: optEncode.checked,
      scramble:      optScramble.checked,
      oneLine:       optOneLine.checked,
      vmType:        optVmType.value,
      vmLevel:       optVmLevel.value,
    };

    await new Promise(r => setTimeout(r, 10));

    try {
      const output = ZEOXEngine.obfuscate(code, options);
      outputEditor.value = output;
      renderOutputLines();
      btnCopy.disabled = false;
      btnDownload.disabled = false;
      updateStatus("green", "Success");
      logConsole("[SUCCESS] Obfuscation completed successfully!", "success");
      if (options.vmType !== "none")
        logConsole(`[VM-GENERATOR] ${options.vmType.toUpperCase()} VM — Level: ${options.vmLevel.toUpperCase()}.`, "success");
      if (options.encodeStrings) logConsole("[XOR] Strings encrypted.", "success");
      if (!options.noRename)    logConsole("[RENAME] Variables scrambled.", "success");
      if (options.scramble)     logConsole("[FLOW] Opaque predicates injected.", "success");
      if (typeof window.deductQuota === "function") window.deductQuota(1);
    } catch (err) {
      logConsole(`[OBFUSCATION-FAILED] ${err.message}`, "error");
      outputEditor.value = "";
      renderOutputLines();
      btnCopy.disabled = true;
      btnDownload.disabled = true;
      updateStatus("red", "Failed");
    } finally {
      btnText.innerText = origTxt;
      loader.classList.add("hidden");
      btnObfuscate.disabled = false;
    }
  }

  function resetStats() {
    statTokens.innerText = "0";
    statStatements.innerText = "0";
    statFunctions.innerText = "0";
    statLocals.innerText = "0";
  }

  function updateStatCounts(stats) {
    const curTokens = parseInt(statTokens.innerText) || 0;
    const curStatements = parseInt(statStatements.innerText) || 0;
    const curFunctions = parseInt(statFunctions.innerText) || 0;
    const curLocals = parseInt(statLocals.innerText) || 0;

    animateNumber(statTokens, curTokens, stats.tokens, 300);
    animateNumber(statStatements, curStatements, stats.statements, 300);
    animateNumber(statFunctions, curFunctions, stats.functions, 300);
    animateNumber(statLocals, curLocals, stats.locals, 300);
  }

  function updateStatus(color, text) {
    if (statusIndicator) {
      statusIndicator.className = `console-indicator status-${color}`;
    }
    if (statusTitle) {
      statusTitle.innerText = text;
    }
  }

  function clearTerminalLogs() {
    const lines = consoleLog.querySelectorAll(".console-line");
    lines.forEach(line => {
      if (line.classList.contains("line-error") || line.classList.contains("line-warning") || line.classList.contains("line-success")) {
        line.remove();
      }
    });
  }
});
