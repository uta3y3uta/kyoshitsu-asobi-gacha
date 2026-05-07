/* =========================================================
   教室あそびガチャ
   ========================================================= */

// ---------- 設定 ----------
const STORAGE_KEY = "kyoshitsu-asobi-gacha-v1";
const MODEL_COUNT = 50; // 1〜50はモデルあそび枠
const CAPSULE_COLORS = [
  "#ff7aa2", "#ffae5a", "#ffd66e", "#a8e063",
  "#5dd6c2", "#5dbef7", "#9d8df1", "#d792f0",
  "#ff8a8a", "#7ed957", "#56ccf2", "#bb6bd9"
];
const BOND_LABELS = ["ー", "⭐", "⭐⭐", "⭐⭐⭐"];

// ---------- 状態 ----------
let state = {
  plays: [],          // [{ id, name, rule, bond, isModel }]
  collection: [],     // 当てた id の配列（出現順）
  allowDuplicate: false,
  selectedPreviewId: null,
};
let nextId = 1;
let isSpinning = false;

// ---------- 初期化 ----------
window.addEventListener("DOMContentLoaded", () => {
  init();
});

function init() {
  // URLハッシュからの復元 → なければ localStorage → なければデフォルト
  const fromUrl = readFromHash();
  if (fromUrl) {
    state.plays = fromUrl.plays || [];
    state.allowDuplicate = !!fromUrl.allowDuplicate;
    nextId = computeNextId();
    persist(); // 取り込んだ内容をlocalStorageに保存
    history.replaceState(null, "", location.pathname + location.search);
  } else {
    const saved = loadLocal();
    if (saved) {
      state.plays = saved.plays || [];
      state.collection = saved.collection || [];
      state.allowDuplicate = !!saved.allowDuplicate;
      nextId = computeNextId();
    } else {
      seedDefaultPlays();
    }
  }

  // ドーム内のミニカプセル装飾
  renderDomeCapsules();

  // イベント
  bindNav();
  bindGacha();
  bindSettings();
  bindCollection();
  bindImport();
  bindShare();
  bindResultModal();

  // チェックボックス
  document.getElementById("allow-duplicate").checked = state.allowDuplicate;
  document.getElementById("allow-duplicate").addEventListener("change", (e) => {
    state.allowDuplicate = e.target.checked;
    persist();
  });

  renderPlays();
  renderCollection();
}

// ---------- データ初期化（モデル50個） ----------
function seedDefaultPlays() {
  state.plays = [];
  for (let i = 0; i < MODEL_COUNT; i++) {
    state.plays.push({
      id: nextId++,
      name: `モデルあそび${i + 1}`,
      rule: "（あとで設定）",
      bond: 0,
      isModel: true,
    });
  }
  persist();
}

function computeNextId() {
  let max = 0;
  state.plays.forEach((p) => { if (p.id > max) max = p.id; });
  return max + 1;
}

// ---------- 永続化 ----------
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      plays: state.plays,
      collection: state.collection,
      allowDuplicate: state.allowDuplicate,
    }));
  } catch (e) { /* ignore quota */ }
}
function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// ---------- URLハッシュ ----------
function encodeForShare() {
  const data = {
    plays: state.plays.map((p) => ({
      n: p.name, r: p.rule, b: p.bond, m: p.isModel ? 1 : 0,
    })),
    allowDuplicate: state.allowDuplicate,
  };
  const json = JSON.stringify(data);
  const b64 = base64UrlEncode(unescape(encodeURIComponent(json)));
  return b64;
}
function readFromHash() {
  const m = location.hash.match(/^#d=([\w\-]+)/);
  if (!m) return null;
  try {
    const json = decodeURIComponent(escape(base64UrlDecode(m[1])));
    const obj = JSON.parse(json);
    let id = 1;
    const plays = (obj.plays || []).map((p) => ({
      id: id++,
      name: p.n || "",
      rule: p.r || "",
      bond: typeof p.b === "number" ? p.b : 0,
      isModel: !!p.m,
    }));
    return { plays, allowDuplicate: !!obj.allowDuplicate };
  } catch (e) {
    console.warn("URL読み込み失敗:", e);
    return null;
  }
}
function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlDecode(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return atob(s);
}

// ---------- 画面切替 ----------
function bindNav() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.screen;
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".screen").forEach((s) => {
        s.classList.toggle("active", s.id === `screen-${target}`);
      });
      if (target === "collection") renderCollection();
    });
  });
}

// ---------- ガチャ ----------
function bindGacha() {
  document.getElementById("pull-btn").addEventListener("click", pullGacha);
  document.getElementById("lever").addEventListener("click", pullGacha);
}

function renderDomeCapsules() {
  const dome = document.getElementById("dome-inner");
  dome.innerHTML = "";
  for (let i = 0; i < 14; i++) {
    const el = document.createElement("div");
    el.className = "mini-capsule";
    el.style.background = CAPSULE_COLORS[i % CAPSULE_COLORS.length];
    dome.appendChild(el);
  }
}

function getEligiblePlays() {
  // ガチャ対象：名前が空でないもの
  let pool = state.plays.filter((p) => p.name && p.name.trim() !== "");
  if (!state.allowDuplicate) {
    pool = pool.filter((p) => !state.collection.includes(p.id));
  }
  return pool;
}

function pullGacha() {
  if (isSpinning) return;
  const pool = getEligiblePlays();
  if (pool.length === 0) {
    showToast(state.allowDuplicate
      ? "あそびが設定されていません。設定画面から追加してください。"
      : "全部コレクションしました！「重複あり」をONにすると続けられます。");
    return;
  }
  isSpinning = true;
  const pickedIndex = Math.floor(Math.random() * pool.length);
  const picked = pool[pickedIndex];

  // レバー回転
  const lever = document.getElementById("lever");
  lever.classList.remove("spinning");
  void lever.offsetWidth; // reflow
  lever.classList.add("spinning");

  // カプセルが落ちる
  const fly = document.getElementById("capsule-fly");
  const color = CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)];
  fly.style.setProperty("--cap-color", color);
  fly.hidden = false;
  fly.classList.remove("dropping");
  void fly.offsetWidth;
  fly.classList.add("dropping");

  // 結果モーダルへ
  setTimeout(() => {
    fly.hidden = true;
    fly.classList.remove("dropping");
    showResult(picked, color);
    isSpinning = false;
  }, 1100);
}

// ---------- 結果モーダル ----------
function bindResultModal() {
  document.getElementById("result-close-btn").addEventListener("click", closeResult);
  document.getElementById("result-modal").addEventListener("click", (e) => {
    if (e.target.id === "result-modal") closeResult();
  });
}
function closeResult() {
  const modal = document.getElementById("result-modal");
  modal.classList.add("hidden");
}
function showResult(play, color, opts = {}) {
  const modal = document.getElementById("result-modal");
  const cap = document.getElementById("big-capsule");
  const content = document.getElementById("result-content");
  cap.style.setProperty("--cap-color", color);
  cap.classList.remove("opening");
  content.hidden = true;

  modal.classList.remove("hidden");

  // コレクションへ追加（fromCollection の場合は追加しない）
  if (!opts.fromCollection && !state.collection.includes(play.id)) {
    state.collection.push(play.id);
    persist();
  }

  // テキスト
  document.getElementById("result-bond").textContent = bondText(play.bond);
  document.getElementById("result-name").textContent = play.name;
  document.getElementById("result-rule").textContent = play.rule || "";

  // 開く演出
  setTimeout(() => {
    cap.classList.add("opening");
    setTimeout(() => {
      content.hidden = false;
    }, 380);
  }, opts.fromCollection ? 200 : 700);
}

function bondText(b) {
  return BOND_LABELS[Math.max(0, Math.min(3, b || 0))];
}

// ---------- コレクション ----------
function bindCollection() {
  document.getElementById("reset-collection-btn").addEventListener("click", () => {
    confirmDialog("コレクションをリセット", "すべての記録を消します。よろしいですか？", () => {
      state.collection = [];
      persist();
      renderCollection();
      showToast("コレクションをリセットしました");
    });
  });
}

function renderCollection() {
  const grid = document.getElementById("collection-grid");
  grid.innerHTML = "";
  const pool = state.plays.filter((p) => p.name && p.name.trim() !== "");
  const collected = new Set(state.collection);

  pool.forEach((p, idx) => {
    const card = document.createElement("div");
    const unlocked = collected.has(p.id);
    card.className = "col-card" + (unlocked ? "" : " locked");
    const color = CAPSULE_COLORS[idx % CAPSULE_COLORS.length];
    card.innerHTML = `
      <div class="col-cap" style="--cap-color:${unlocked ? color : "#cdcdd6"}"></div>
      <div class="col-name">${unlocked ? escapeHtml(p.name) : "？？？？"}</div>
      <div class="col-bond">${unlocked ? bondText(p.bond) : ""}</div>
    `;
    if (unlocked) {
      card.addEventListener("click", () => {
        showResult(p, color, { fromCollection: true });
      });
    }
    grid.appendChild(card);
  });

  document.getElementById("collection-count").textContent =
    `${collected.size} / ${pool.length}`;
}

// ---------- 設定画面 ----------
function bindSettings() {
  document.getElementById("add-play-btn").addEventListener("click", () => {
    state.plays.push({
      id: nextId++, name: "", rule: "", bond: 0, isModel: false,
    });
    persist();
    renderPlays();
    // 末尾の名前欄にフォーカス
    const list = document.getElementById("plays-list");
    const inputs = list.querySelectorAll(".play-row input.name");
    if (inputs.length) inputs[inputs.length - 1].focus();
  });
}

function renderPlays() {
  const list = document.getElementById("plays-list");
  list.innerHTML = "";
  state.plays.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "play-row" + (p.isModel ? " is-model" : "") +
      (state.selectedPreviewId === p.id ? " selected" : "");
    row.innerHTML = `
      <div class="play-no">${idx + 1}</div>
      <input class="name" type="text" placeholder="あそびの名前" value="${escapeAttr(p.name)}" />
      <input class="rule" type="text" placeholder="ルール" value="${escapeAttr(p.rule)}" />
      <select class="bond">
        <option value="0"${p.bond === 0 ? " selected" : ""}>ー</option>
        <option value="1"${p.bond === 1 ? " selected" : ""}>⭐</option>
        <option value="2"${p.bond === 2 ? " selected" : ""}>⭐⭐</option>
        <option value="3"${p.bond === 3 ? " selected" : ""}>⭐⭐⭐</option>
      </select>
      <button class="delete-btn" title="削除">×</button>
    `;
    const nameEl = row.querySelector("input.name");
    const ruleEl = row.querySelector("input.rule");
    const bondEl = row.querySelector("select.bond");
    const delEl  = row.querySelector(".delete-btn");

    nameEl.addEventListener("input", () => { p.name = nameEl.value; persist(); updatePreview(); });
    ruleEl.addEventListener("input", () => { p.rule = ruleEl.value; persist(); updatePreview(); });
    bondEl.addEventListener("change", () => { p.bond = parseInt(bondEl.value, 10); persist(); updatePreview(); });

    [nameEl, ruleEl, bondEl].forEach((el) => {
      el.addEventListener("focus", () => selectForPreview(p.id));
    });
    row.addEventListener("click", (e) => {
      // 入力欄のクリックは focus でハンドルされるので、行自体のクリックはセル外用
      if (e.target === row) selectForPreview(p.id);
    });

    delEl.addEventListener("click", (ev) => {
      ev.stopPropagation();
      confirmDialog("削除しますか？", `「${p.name || "(名前なし)"}」を削除します。`, () => {
        state.plays = state.plays.filter((x) => x.id !== p.id);
        state.collection = state.collection.filter((id) => id !== p.id);
        persist();
        renderPlays();
        renderCollection();
      });
    });

    list.appendChild(row);
  });
  // 自動でプレビューを最初の項目に
  if (!state.selectedPreviewId && state.plays.length > 0) {
    selectForPreview(state.plays[0].id);
  } else {
    updatePreview();
  }
}

function selectForPreview(id) {
  state.selectedPreviewId = id;
  document.querySelectorAll(".play-row").forEach((r, i) => {
    r.classList.toggle("selected", state.plays[i] && state.plays[i].id === id);
  });
  updatePreview();
}

function updatePreview() {
  const card = document.getElementById("preview-card");
  const p = state.plays.find((x) => x.id === state.selectedPreviewId);
  if (!p || (!p.name && !p.rule)) {
    card.innerHTML = `<div class="preview-empty">プレビューする項目を選んでください</div>`;
    return;
  }
  const idx = state.plays.indexOf(p);
  const color = CAPSULE_COLORS[idx % CAPSULE_COLORS.length];
  card.innerHTML = `
    <div class="preview-cap" style="--cap-color:${color}"></div>
    <div class="preview-bond">${bondText(p.bond)}</div>
    <div class="preview-name">${escapeHtml(p.name || "(名前なし)")}</div>
    <div class="preview-rule">${escapeHtml(p.rule || "")}</div>
  `;
}

// ---------- インポート ----------
function bindImport() {
  const modal = document.getElementById("import-modal");
  document.getElementById("import-btn").addEventListener("click", () => {
    modal.classList.remove("hidden");
  });
  document.getElementById("import-cancel-btn").addEventListener("click", () => {
    modal.classList.add("hidden");
  });
  modal.addEventListener("click", (e) => {
    if (e.target.id === "import-modal") modal.classList.add("hidden");
  });

  // タブ切替
  document.querySelectorAll("#import-modal .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.tab;
      document.querySelectorAll("#import-modal .tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll("#import-modal .tab-pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === t));
    });
  });

  // 取り込み実行
  document.getElementById("import-apply-btn").addEventListener("click", async () => {
    const activeTab = document.querySelector("#import-modal .tab-btn.active").dataset.tab;
    const replace = document.getElementById("import-replace").checked;
    const hasHeader = document.getElementById("import-has-header").checked;
    let rows = [];

    try {
      if (activeTab === "paste") {
        const text = document.getElementById("paste-input").value;
        if (!text.trim()) { showToast("貼り付け内容が空です"); return; }
        rows = parseTSVCSV(text);
      } else if (activeTab === "excel") {
        const file = document.getElementById("excel-input").files[0];
        if (!file) { showToast("Excelファイルを選んでください"); return; }
        rows = await parseExcelFile(file);
      } else if (activeTab === "sheets") {
        const url = document.getElementById("sheets-url").value.trim();
        if (!url) { showToast("Googleスプレッドシートの URL を入れてください"); return; }
        rows = await fetchGoogleSheetCSV(url);
      }
    } catch (e) {
      console.error(e);
      showToast("読み込みに失敗しました：" + (e.message || e));
      return;
    }

    if (hasHeader && rows.length > 0) rows = rows.slice(1);
    const newPlays = rows
      .map((cells) => normalizePlay(cells))
      .filter((p) => p.name);

    if (newPlays.length === 0) { showToast("取り込めるあそびが見つかりませんでした"); return; }

    if (replace) {
      state.plays = [];
      state.collection = [];
    }
    newPlays.forEach((p) => {
      state.plays.push({
        id: nextId++,
        name: p.name,
        rule: p.rule,
        bond: p.bond,
        isModel: false,
      });
    });
    persist();
    renderPlays();
    renderCollection();
    modal.classList.add("hidden");
    showToast(`${newPlays.length}件取り込みました`);
  });
}

function parseTSVCSV(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  return lines.map((line) => {
    if (line.includes("\t")) return line.split("\t");
    // 簡易CSV（クォート対応）
    return parseCSVLine(line);
  });
}
function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function parseExcelFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  return rows.map((r) => r.map((c) => (c == null ? "" : String(c))));
}

async function fetchGoogleSheetCSV(url) {
  const csvUrl = convertGoogleSheetUrlToCSV(url);
  if (!csvUrl) throw new Error("URLからシートIDが読み取れませんでした");
  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error("ダウンロード失敗（共有設定をご確認ください）");
  const text = await res.text();
  return parseTSVCSV(text);
}
function convertGoogleSheetUrlToCSV(url) {
  // /d/{id}/... または /d/{id}/edit#gid=...
  const m = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return null;
  const id = m[1];
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

function normalizePlay(cells) {
  const name = (cells[0] || "").toString().trim();
  const rule = (cells[1] || "").toString().trim();
  const rawBond = (cells[2] || "").toString().trim();
  let bond = 0;
  if (rawBond) {
    if (/^[1-3]$/.test(rawBond)) bond = parseInt(rawBond, 10);
    else if (/^⭐+$/.test(rawBond)) bond = Math.min(3, [...rawBond].length);
    else if (/^[★]+$/.test(rawBond)) bond = Math.min(3, [...rawBond].length);
    else bond = 0;
  }
  return { name, rule, bond };
}

// ---------- 共有URL ----------
function bindShare() {
  document.getElementById("share-btn").addEventListener("click", () => {
    const code = encodeForShare();
    const url = `${location.origin}${location.pathname}#d=${code}`;
    document.getElementById("share-url").value = url;
    document.getElementById("share-modal").classList.remove("hidden");
  });
  document.getElementById("share-close-btn").addEventListener("click", () => {
    document.getElementById("share-modal").classList.add("hidden");
  });
  document.getElementById("share-modal").addEventListener("click", (e) => {
    if (e.target.id === "share-modal") document.getElementById("share-modal").classList.add("hidden");
  });
  document.getElementById("share-copy-btn").addEventListener("click", async () => {
    const t = document.getElementById("share-url");
    t.select();
    try {
      await navigator.clipboard.writeText(t.value);
      showToast("URLをコピーしました");
    } catch {
      document.execCommand("copy");
      showToast("URLをコピーしました");
    }
  });
}

// ---------- 確認ダイアログ ----------
function confirmDialog(title, message, onOk) {
  const modal = document.getElementById("confirm-modal");
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-message").textContent = message;
  modal.classList.remove("hidden");
  const ok = document.getElementById("confirm-ok-btn");
  const cancel = document.getElementById("confirm-cancel-btn");
  const close = () => modal.classList.add("hidden");
  const handleOk = () => { close(); cleanup(); onOk && onOk(); };
  const handleCancel = () => { close(); cleanup(); };
  const cleanup = () => {
    ok.removeEventListener("click", handleOk);
    cancel.removeEventListener("click", handleCancel);
  };
  ok.addEventListener("click", handleOk);
  cancel.addEventListener("click", handleCancel);
}

// ---------- ユーティリティ ----------
function showToast(msg) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const div = document.createElement("div");
  div.className = "toast";
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 2200);
}
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttr(s) {
  return escapeHtml(s);
}
