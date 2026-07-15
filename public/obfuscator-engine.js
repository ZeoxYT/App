// ZEOX Luau Obfuscator Engine — Client-Side (no API required)
// Implements: Tokenizer, Variable Renaming, XOR String Encryption,
//             Control-Flow Scrambling, Register/Stack VM wrapping

(function (global) {
  "use strict";

  // ───────────────────────────────────────────────────────────────
  // ROBLOX / LUAU GLOBALS — never rename these
  // ───────────────────────────────────────────────────────────────
  const ROBLOX_GLOBALS = new Set([
    "game","workspace","script","LocalPlayer","Player","Players",
    "ReplicatedStorage","ServerStorage","ServerScriptService","StarterGui",
    "StarterPlayer","StarterPack","Lighting","Teams","SoundService",
    "RunService","UserInputService","TweenService","HttpService",
    "DataStoreService","TeleportService","ChatService","InsertService",
    "CollectionService","PhysicsService","ContentProvider","GuiService",
    "MarketplaceService","Instance","Vector3","Vector2","CFrame","UDim",
    "UDim2","Color3","BrickColor","Enum","Ray","Region3","Region3int16",
    "TweenInfo","NumberSequence","ColorSequence","NumberRange",
    "NumberSequenceKeypoint","ColorSequenceKeypoint","Axes","Faces",
    "Random","DateTime","RaycastParams","OverlapParams","PathfindingModifiers",
    "print","warn","error","type","tostring","tonumber","pairs","ipairs",
    "next","select","unpack","table","unpack","pcall","xpcall","rawget",
    "rawset","rawequal","rawlen","require","loadstring","dofile","loadfile",
    "getfenv","setfenv","newproxy","assert","collectgarbage","gcinfo",
    "getmetatable","setmetatable","string","math","os","io","coroutine",
    "bit32","utf8","task","wait","spawn","delay","tick","time",
    "elapsedTime","version","typeof","classof","instanceof","shared",
    "_G","_VERSION","_ENV","self","true","false","nil",
    // common library methods (kept to reduce accidents)
    "insert","remove","concat","sort","find","format","sub","rep","len",
    "lower","upper","byte","char","gmatch","gsub","match","floor","ceil",
    "abs","sqrt","max","min","huge","pi","random","randomseed","sin","cos",
    "tan","exp","log","pow","modf","fmod","new","clone","Destroy","Connect",
    "Disconnect","FireServer","FireClient","FireAllClients","InvokeServer",
    "InvokeClient","WaitForChild","FindFirstChild","FindFirstChildOfClass",
    "GetChildren","GetDescendants","GetService","IsA","BindToClose",
  ]);

  const LUA_KEYWORDS = new Set([
    "and","break","do","else","elseif","end","false","for","function",
    "if","in","local","nil","not","or","repeat","return","then","true",
    "until","while","continue","type","export","typeof",
  ]);

  // ───────────────────────────────────────────────────────────────
  // NAME GENERATOR
  // ───────────────────────────────────────────────────────────────
  function makeNameGen() {
    let counter = 0;
    // Uses l/I/O/o/0 combos — hard to read at a glance
    const CHARS = "lIiOo0";
    return function () {
      let n = counter++;
      let name = "_";
      do {
        name += CHARS[n % CHARS.length];
        n = Math.floor(n / CHARS.length);
      } while (n > 0);
      return name;
    };
  }

  // ───────────────────────────────────────────────────────────────
  // TOKENIZER
  // ───────────────────────────────────────────────────────────────
  function tokenize(src) {
    const tokens = [];
    let i = 0;

    while (i < src.length) {
      const ch = src[i];

      // ── Long string / long comment ──────────────────────────────
      if (ch === "[" && (src[i + 1] === "[" || src[i + 1] === "=")) {
        let eq = 0, j = i + 1;
        while (j < src.length && src[j] === "=") { eq++; j++; }
        if (src[j] === "[") {
          const close = "]" + "=".repeat(eq) + "]";
          const end = src.indexOf(close, j + 1);
          if (end >= 0) {
            tokens.push({ type: "longstring", value: src.slice(i, end + close.length) });
            i = end + close.length;
            continue;
          }
        }
      }

      // ── Short strings ───────────────────────────────────────────
      if (ch === '"' || ch === "'") {
        const q = ch;
        let s = q, j = i + 1;
        while (j < src.length) {
          if (src[j] === "\\") { s += src[j] + (src[j + 1] || ""); j += 2; continue; }
          if (src[j] === q)    { s += q; j++; break; }
          s += src[j++];
        }
        tokens.push({ type: "string", value: s });
        i = j;
        continue;
      }

      // ── Comments ────────────────────────────────────────────────
      if (ch === "-" && src[i + 1] === "-") {
        if (src[i + 2] === "[") {
          let eq = 0, j = i + 3;
          while (j < src.length && src[j] === "=") { eq++; j++; }
          if (src[j] === "[") {
            const close = "]" + "=".repeat(eq) + "]";
            const end = src.indexOf(close, j + 1);
            if (end >= 0) {
              tokens.push({ type: "comment", value: src.slice(i, end + close.length) });
              i = end + close.length;
              continue;
            }
          }
        }
        let j = i + 2;
        while (j < src.length && src[j] !== "\n") j++;
        tokens.push({ type: "comment", value: src.slice(i, j) });
        i = j;
        continue;
      }

      // ── Numbers ─────────────────────────────────────────────────
      if ((ch >= "0" && ch <= "9") || (ch === "." && src[i + 1] >= "0" && src[i + 1] <= "9")) {
        let j = i;
        if (src[i] === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
          j += 2;
          while (j < src.length && /[0-9a-fA-F_]/.test(src[j])) j++;
        } else {
          while (j < src.length && /[0-9._]/.test(src[j])) j++;
          if (j < src.length && (src[j] === "e" || src[j] === "E")) {
            j++;
            if (src[j] === "+" || src[j] === "-") j++;
            while (j < src.length && /[0-9]/.test(src[j])) j++;
          }
        }
        tokens.push({ type: "number", value: src.slice(i, j) });
        i = j;
        continue;
      }

      // ── Identifiers / keywords ──────────────────────────────────
      if (/[a-zA-Z_]/.test(ch)) {
        let j = i;
        while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
        const word = src.slice(i, j);
        tokens.push({ type: LUA_KEYWORDS.has(word) ? "keyword" : "ident", value: word });
        i = j;
        continue;
      }

      // ── Whitespace ──────────────────────────────────────────────
      if (/\s/.test(ch)) {
        let j = i;
        while (j < src.length && /\s/.test(src[j])) j++;
        tokens.push({ type: "ws", value: src.slice(i, j) });
        i = j;
        continue;
      }

      // ── Multi-char operators ────────────────────────────────────
      const three = src.slice(i, i + 3);
      if (three === "..." || three === "..=") {
        tokens.push({ type: "op", value: three });
        i += 3;
        continue;
      }
      const two = src.slice(i, i + 2);
      if (["..","<=",">=","~=","==","::","+=","-=","*=","/=","%=","^=","//","->"].includes(two)) {
        tokens.push({ type: "op", value: two });
        i += 2;
        continue;
      }

      // ── Single char ─────────────────────────────────────────────
      tokens.push({ type: "op", value: ch });
      i++;
    }

    return tokens;
  }

  // ───────────────────────────────────────────────────────────────
  // STATS (for live display in the dashboard)
  // ───────────────────────────────────────────────────────────────
  function getStats(tokens) {
    let tokCount = 0, stmts = 0, funcs = 0, locals = 0;
    for (const t of tokens) {
      if (t.type === "ws" || t.type === "comment") continue;
      tokCount++;
      if (t.type === "keyword") {
        if (["local","if","while","for","repeat","do","return","break","continue"].includes(t.value)) stmts++;
        if (t.value === "function") funcs++;
        if (t.value === "local")    locals++;
      }
    }
    return { tokens: tokCount, statements: stmts, functions: funcs, locals };
  }

  // ───────────────────────────────────────────────────────────────
  // VALIDATE — basic linting
  // ───────────────────────────────────────────────────────────────
  function validate(tokens) {
    const errors = [];
    const OPENERS = new Set(["do","then","function","repeat"]);
    const CLOSERS = new Set(["end","until"]);
    let depth = 0;

    for (const t of tokens) {
      if (t.type !== "keyword") continue;
      if (OPENERS.has(t.value)) depth++;
      if (CLOSERS.has(t.value)) {
        depth--;
        if (depth < 0) { errors.push({ severity: "error", message: "Unexpected 'end' or 'until' — mismatched block" }); depth = 0; }
      }
    }
    if (depth !== 0) errors.push({ severity: "error", message: `Unclosed block — ${depth} 'end' keyword(s) missing` });

    return errors;
  }

  // ───────────────────────────────────────────────────────────────
  // PARSE STRING LITERAL VALUE
  // ───────────────────────────────────────────────────────────────
  function parseStringLiteral(raw) {
    if (raw.startsWith("[[") || /^\[=+\[/.test(raw)) {
      // long string: strip delimiters
      const m = raw.match(/^\[(=*)\[([\s\S]*?)\]\1\]$/);
      return m ? m[2] : null;
    }
    const q = raw[0];
    let s = "";
    let j = 1;
    while (j < raw.length - 1) {
      if (raw[j] !== "\\") { s += raw[j++]; continue; }
      j++;
      const esc = raw[j];
      if      (esc === "n") { s += "\n"; j++; }
      else if (esc === "t") { s += "\t"; j++; }
      else if (esc === "r") { s += "\r"; j++; }
      else if (esc === "\\"){ s += "\\"; j++; }
      else if (esc === '"') { s += '"';  j++; }
      else if (esc === "'") { s += "'";  j++; }
      else if (esc === "0") { s += "\0"; j++; }
      else if (esc >= "0" && esc <= "9") {
        let num = "";
        while (j < raw.length - 1 && raw[j] >= "0" && raw[j] <= "9" && num.length < 3) num += raw[j++];
        s += String.fromCharCode(parseInt(num, 10));
      } else { s += esc; j++; }
    }
    return s;
  }

  // ───────────────────────────────────────────────────────────────
  // XOR STRING ENCRYPTION
  // ───────────────────────────────────────────────────────────────
  function encryptStrings(tokens, gen) {
    const KEY = (Math.floor(Math.random() * 180) + 40) & 0xFF;
    const table = [];

    for (const t of tokens) {
      if (t.type !== "string" && t.type !== "longstring") continue;
      const str = parseStringLiteral(t.value);
      if (str === null || str.length === 0) continue;

      // Only encrypt ASCII-safe strings (avoid breaking multibyte issues)
      let safe = true;
      for (let k = 0; k < str.length; k++) {
        if (str.charCodeAt(k) > 255) { safe = false; break; }
      }
      if (!safe) continue;

      const idx = table.length;
      const bytes = Array.from(str).map(c => (c.charCodeAt(0) ^ KEY) & 0xFF);
      table.push(bytes);

      t.type    = "xorstr";
      t.xorIdx  = idx;
    }

    if (table.length === 0) return "";

    const kVar = gen(), tVar = gen(), iVar = gen(), jVar = gen(), sVar = gen(), decVar = gen();
    const tableStr = table.map(b => "{" + b.join(",") + "}").join(",");

    return (
      `local ${kVar}=${KEY} ` +
      `local ${tVar}={${tableStr}} ` +
      `local ${decVar}={} ` +
      `for ${iVar}=1,#${tVar} do ` +
        `local ${sVar}="" ` +
        `for ${jVar}=1,#${tVar}[${iVar}] do ` +
          `${sVar}=${sVar}..string.char(${tVar}[${iVar}][${jVar}]~${kVar}) ` +
        `end ` +
        `${decVar}[${iVar}-1]=${sVar} ` +
      `end\n`
    );
  }

  // ───────────────────────────────────────────────────────────────
  // VARIABLE RENAMING
  // ───────────────────────────────────────────────────────────────
  function renameLocals(tokens, gen, preserveGlobals) {
    const nameMap = new Map();

    function nextNonWs(tokens, start) {
      let j = start;
      while (j < tokens.length && tokens[j].type === "ws") j++;
      return j;
    }

    // Collect locals from `local` declarations and function parameters
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];

      if (t.type === "keyword" && t.value === "local") {
        let j = nextNonWs(tokens, i + 1);
        const isFn = j < tokens.length && tokens[j].type === "keyword" && tokens[j].value === "function";

        if (isFn) {
          // local function name(...)
          j = nextNonWs(tokens, j + 1);
          if (j < tokens.length && tokens[j].type === "ident") {
            const n = tokens[j].value;
            if (!ROBLOX_GLOBALS.has(n) && !nameMap.has(n)) nameMap.set(n, gen());
          }
        } else {
          // local a, b, c = ...
          while (j < tokens.length) {
            const cur = tokens[j];
            if (cur.type === "ident" && !ROBLOX_GLOBALS.has(cur.value)) {
              if (!nameMap.has(cur.value)) nameMap.set(cur.value, gen());
            } else if (cur.type === "op" && cur.value === "=") {
              break;
            } else if (cur.type !== "op" && cur.type !== "ws") {
              break;
            }
            j++;
          }
        }
      }

      // Function parameters
      if (t.type === "keyword" && t.value === "function") {
        let j = nextNonWs(tokens, i + 1);
        // skip name.name:name
        while (
          j < tokens.length &&
          (tokens[j].type === "ident" ||
           (tokens[j].type === "op" && (tokens[j].value === "." || tokens[j].value === ":")))
        ) j++;
        j = nextNonWs(tokens, j);
        if (j >= tokens.length || tokens[j].value !== "(") continue;
        j++;
        while (j < tokens.length && tokens[j].value !== ")") {
          if (tokens[j].type === "ident" && !ROBLOX_GLOBALS.has(tokens[j].value)) {
            if (!nameMap.has(tokens[j].value)) nameMap.set(tokens[j].value, gen());
          }
          j++;
        }
      }

      // for i = / for k, v in
      if (t.type === "keyword" && t.value === "for") {
        let j = nextNonWs(tokens, i + 1);
        while (j < tokens.length && (tokens[j].type === "ident" || (tokens[j].type === "op" && tokens[j].value === ","))) {
          if (tokens[j].type === "ident" && !ROBLOX_GLOBALS.has(tokens[j].value)) {
            if (!nameMap.has(tokens[j].value)) nameMap.set(tokens[j].value, gen());
          }
          j++;
          while (j < tokens.length && tokens[j].type === "ws") j++;
        }
      }
    }

    return nameMap;
  }

  // ───────────────────────────────────────────────────────────────
  // CONTROL FLOW SCRAMBLING
  // ───────────────────────────────────────────────────────────────
  function addOpaquePredicate(gen) {
    const a = gen(), b = gen();
    const n1 = Math.floor(Math.random() * 99) + 2;
    const n2 = n1 * 3;
    return (
      `local ${a}=${n1} local ${b}=${n2} ` +
      `if not(${a}*3==${b} and ${b}%${a}==0) then error("") end\n`
    );
  }

  // ───────────────────────────────────────────────────────────────
  // VM WRAPPER  (loadstring-based, works in standard Lua / Roblox)
  // ───────────────────────────────────────────────────────────────
  function wrapVM(code, vmType, vmLevel, gen) {
    const KEY = (Math.floor(Math.random() * 200) + 30) & 0xFF;

    // Encode code bytes with XOR
    const bytes = [];
    for (let k = 0; k < code.length; k++) bytes.push((code.charCodeAt(k) ^ KEY) & 0xFF);

    const v1 = gen(), v2 = gen(), v3 = gen(), v4 = gen(), v5 = gen();

    let inner;
    if (vmType === "stack") {
      inner =
        `local ${v1}={${bytes.join(",")}} ` +
        `local ${v2}="" ` +
        `for ${v3}=1,#${v1} do ${v2}=${v2}..string.char(${v1}[${v3}]~${KEY}) end ` +
        `loadstring(${v2})()`;
    } else {
      // register VM — adds an extra integrity check layer for 'max' level
      const c1 = gen(), c2 = gen(), c3 = gen();
      const integrityLine = vmLevel === "max"
        ? `local ${c1}=#${v1} local ${c2}=${bytes.length} if ${c1}~=${c2} then error("VM integrity") end `
        : "";

      inner =
        `local ${v1}={${bytes.join(",")}} ` +
        integrityLine +
        `local ${v2}="" ` +
        `for ${v3}=1,#${v1} do ${v2}=${v2}..string.char(${v1}[${v3}]~${KEY}) end ` +
        `local ${v4},${v5}=loadstring(${v2}) ` +
        `if not ${v4} then error("VM error: "..tostring(${v5})) end ` +
        `${v4}()`;
    }

    return inner;
  }

  // ───────────────────────────────────────────────────────────────
  // RECONSTRUCT SOURCE FROM TOKENS
  // ───────────────────────────────────────────────────────────────
  function reconstruct(tokens, nameMap, xorDecVar) {
    const parts = [];
    for (const t of tokens) {
      if (t.type === "comment") {
        // strip comments
        continue;
      }
      if (t.type === "xorstr") {
        parts.push(`${xorDecVar}[${t.xorIdx}]`);
        continue;
      }
      if (t.type === "ident" && nameMap.has(t.value)) {
        parts.push(nameMap.get(t.value));
        continue;
      }
      parts.push(t.value);
    }
    return parts.join("");
  }

  // ───────────────────────────────────────────────────────────────
  // MINIFY
  // ───────────────────────────────────────────────────────────────
  function minify(code) {
    return code
      .replace(/--[^\n]*/g, "")          // line comments
      .replace(/[ \t]+/g, " ")           // collapse spaces/tabs
      .replace(/\n\s*/g, "\n")           // trim line starts
      .replace(/\n+/g, " ")             // collapse newlines
      .replace(/\s*([\+\-\*\/\%\^\#\&\|\~\<\>\=\(\)\{\}\[\]\;\,\.\:]+)\s*/g, "$1")
      .trim();
  }

  // ───────────────────────────────────────────────────────────────
  // MAIN OBFUSCATE FUNCTION
  // ───────────────────────────────────────────────────────────────
  function obfuscate(code, options) {
    const opts = Object.assign({
      noRename:      false,
      noPreserve:    false,
      encodeStrings: true,
      scramble:      true,
      oneLine:       false,
      vmType:        "register",
      vmLevel:       "max",
    }, options);

    const gen = makeNameGen();

    // Tokenize
    let tokens = tokenize(code);

    // 1. XOR string encryption (modifies tokens in-place, returns header code)
    let header = "";
    let xorDecVar = "_ZX"; // placeholder overwritten below
    if (opts.encodeStrings) {
      // We need the decryption table variable name BEFORE we run encryptStrings
      // so we generate it now and patch the header afterwards.
      const result = encryptStringsWithVarName(tokens, gen);
      header = result.header;
      xorDecVar = result.decVar;
    }

    // 2. Variable renaming
    let nameMap = new Map();
    if (!opts.noRename) {
      nameMap = renameLocals(tokens, gen, !opts.noPreserve);
    }

    // 3. Reconstruct code
    let body = reconstruct(tokens, nameMap, xorDecVar);

    // 4. Control flow scrambling (inject at top of body)
    if (opts.scramble) {
      body = addOpaquePredicate(gen) + body;
    }

    // 5. Full code = header + body
    let result = header + body;

    // 6. VM wrapping (wraps the ENTIRE output including header)
    if (opts.vmType !== "none") {
      result = wrapVM(result, opts.vmType, opts.vmLevel, gen);
    }

    // 7. Minify
    if (opts.oneLine) {
      result = minify(result);
    }

    return result;
  }

  // encryptStrings variant that also returns the decVar name
  function encryptStringsWithVarName(tokens, gen) {
    const KEY = (Math.floor(Math.random() * 180) + 40) & 0xFF;
    const table = [];
    const decVar = gen();

    for (const t of tokens) {
      if (t.type !== "string" && t.type !== "longstring") continue;
      const str = parseStringLiteral(t.value);
      if (str === null || str.length === 0) continue;
      let safe = true;
      for (let k = 0; k < str.length; k++) {
        if (str.charCodeAt(k) > 255) { safe = false; break; }
      }
      if (!safe) continue;

      const idx = table.length;
      const bytes = Array.from(str).map(c => (c.charCodeAt(0) ^ KEY) & 0xFF);
      table.push(bytes);
      t.type   = "xorstr";
      t.xorIdx = idx;
    }

    if (table.length === 0) return { header: "", decVar };

    const kVar = gen(), tVar = gen(), iVar = gen(), jVar = gen(), sVar = gen();
    const tableStr = table.map(b => "{" + b.join(",") + "}").join(",");

    const header =
      `local ${kVar}=${KEY} ` +
      `local ${tVar}={${tableStr}} ` +
      `local ${decVar}={} ` +
      `for ${iVar}=1,#${tVar} do ` +
        `local ${sVar}="" ` +
        `for ${jVar}=1,#${tVar}[${iVar}] do ` +
          `${sVar}=${sVar}..string.char(${tVar}[${iVar}][${jVar}]~${kVar}) ` +
        `end ` +
        `${decVar}[${iVar}-1]=${sVar} ` +
      `end\n`;

    return { header, decVar };
  }

  // ───────────────────────────────────────────────────────────────
  // PUBLIC API
  // ───────────────────────────────────────────────────────────────
  const ZEOXEngine = {
    /**
     * Validate code and return { stats, errors }
     * This replaces the /api/validate endpoint — runs entirely client-side.
     */
    analyze(code) {
      try {
        const tokens = tokenize(code);
        const stats  = getStats(tokens);
        const errors = validate(tokens);
        return { stats, errors };
      } catch (e) {
        return {
          stats:  { tokens: 0, statements: 0, functions: 0, locals: 0 },
          errors: [{ severity: "error", message: "Tokenizer error: " + e.message }],
        };
      }
    },

    /**
     * Obfuscate code with given options.
     * This replaces the /api/obfuscate endpoint — runs entirely client-side.
     */
    obfuscate(code, options) {
      return obfuscate(code, options);
    },
  };

  // Expose globally
  global.ZEOXEngine = ZEOXEngine;

})(typeof window !== "undefined" ? window : this);
