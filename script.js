/* =========================================================
   教室あそびガチャ
   ========================================================= */

// ---------- 設定 ----------
const STORAGE_KEY        = "kyoshitsu-asobi-gacha-v1";        // 自分用（編集者）
const STORAGE_KEY_SHARED = "kyoshitsu-asobi-gacha-shared-v1"; // 共有URLからのプレイヤー用
const MODEL_COUNT = 50;   // 1〜50はモデルあそび枠
const MAX_PLAYS  = 100;   // ＋追加で増やせる上限
const CAPSULE_COLORS = [
  "#ff7aa2", "#ffae5a", "#ffd66e", "#a8e063",
  "#5dd6c2", "#5dbef7", "#9d8df1", "#d792f0",
  "#ff8a8a", "#7ed957", "#56ccf2", "#bb6bd9"
];
// 同じ色相でやや濃い影色（カプセル下半分のグラデーション用）
const CAPSULE_COLORS_DARK = [
  "#d8516f", "#d88636", "#cfa83a", "#7eb83f",
  "#36a892", "#3494d0", "#6e62cc", "#a865c0",
  "#d65c5c", "#56a838", "#3aa3c8", "#8d49a8"
];
function colorPair(idx) {
  const i = ((idx % CAPSULE_COLORS.length) + CAPSULE_COLORS.length) % CAPSULE_COLORS.length;
  return { c: CAPSULE_COLORS[i], d: CAPSULE_COLORS_DARK[i] };
}
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
let isSharedView = false; // 共有URL（#d=...）から開かれた場合 true

// ---------- 初期化 ----------
window.addEventListener("DOMContentLoaded", () => {
  init();
});

function init() {
  // URLハッシュからの復元 → なければ localStorage → なければデフォルト
  const fromUrl = readFromHash();
  if (fromUrl) {
    isSharedView = true;
    state.plays = fromUrl.plays || [];
    state.allowDuplicate = !!fromUrl.allowDuplicate;
    nextId = computeNextId();
    // コレクション（プレイヤー側の進行状況）だけ shared 用ストレージから復元
    const saved = loadLocal();
    if (saved && saved.collection) state.collection = saved.collection;
    // 共有URLは保持したままにする（リロード時も共有モードを維持）
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

  // 共有URLビューでは設定タブを隠す
  if (isSharedView) applySharedView();

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
function activeStorageKey() {
  return isSharedView ? STORAGE_KEY_SHARED : STORAGE_KEY;
}
function persist() {
  try {
    if (isSharedView) {
      // 共有モードでは plays は URL 側が真とし、コレクションだけ保存
      localStorage.setItem(activeStorageKey(), JSON.stringify({
        collection: state.collection,
      }));
    } else {
      localStorage.setItem(activeStorageKey(), JSON.stringify({
        plays: state.plays,
        collection: state.collection,
        allowDuplicate: state.allowDuplicate,
      }));
    }
  } catch (e) { /* ignore quota */ }
}
function loadLocal() {
  try {
    const raw = localStorage.getItem(activeStorageKey());
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// 共有ビュー：設定タブと「URL末尾のhashを書き換える」処理を抑制
function applySharedView() {
  const settingsBtn = document.querySelector('.nav-btn[data-screen="settings"]');
  if (settingsBtn) settingsBtn.style.display = "none";
  const settingsScreen = document.getElementById("screen-settings");
  if (settingsScreen) {
    settingsScreen.classList.remove("active");
    settingsScreen.style.display = "none";
  }
  // ガチャ画面が確実に表示
  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.screen === "gacha"));
  document.querySelectorAll(".screen").forEach((s) =>
    s.classList.toggle("active", s.id === "screen-gacha"));
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

const NUM_CAPSULES = 80;
function randomCapsulePosition() {
  // カプセル54pxはキューブ280pxの約19%。x: 0〜80%
  const x = Math.random() * 80;
  // 重力で下に溜まるような分布（pow で下寄せ）
  const yBase = Math.pow(Math.random(), 0.6);
  const y = yBase * 80;
  const rot = Math.floor(Math.random() * 360);
  return { x, y, rot };
}
function renderDomeCapsules() {
  const dome = document.getElementById("dome-inner");
  dome.innerHTML = "";
  for (let i = 0; i < NUM_CAPSULES; i++) {
    const el = document.createElement("div");
    el.className = "mini-capsule";
    const colorIdx = (i * 7 + 3) % CAPSULE_COLORS.length;
    const { c, d } = colorPair(colorIdx + Math.floor(Math.random() * CAPSULE_COLORS.length));
    el.style.setProperty("--cap-color", c);
    el.style.setProperty("--cap-color-dark", d);
    const p = randomCapsulePosition();
    el.style.setProperty("--x", p.x.toFixed(1) + "%");
    el.style.setProperty("--y", p.y.toFixed(1) + "%");
    el.style.setProperty("--rot", p.rot + "deg");
    el.style.animationDelay = (Math.random() * 0.18).toFixed(3) + "s";
    dome.appendChild(el);
  }
}

// 既存カプセルを「リアルにかき混ぜる」：
//   - 上のカプセルほど大きく動く（衝撃が強く伝わる）
//   - 下のカプセルは詰まっていてあまり動かない
//   - 全体的に重力で下に流れる傾向
//   - 各カプセルにランダムな衝撃ベクトル（CSS変数）を渡して bounce アニメーション
function shuffleCapsulesABit() {
  document.querySelectorAll(".mini-capsule").forEach((el) => {
    const cur = {
      x: parseFloat(el.style.getPropertyValue("--x")) || 40,
      y: parseFloat(el.style.getPropertyValue("--y")) || 40,
      rot: parseFloat(el.style.getPropertyValue("--rot")) || 0,
    };
    // 上のほうほど可動域大（impactScale が 1〜0.25）
    const impactScale = 0.25 + Math.max(0, 1 - cur.y / 80) * 0.85;
    // 横揺れ：±3〜10% 範囲（impactScaleに応じる）
    const dx = (Math.random() - 0.5) * 12 * impactScale;
    // 縦揺れ：上に瞬間ジャンプ気味＋重力バイアスで下へ
    //   下半分は小さく、上半分はやや上に動いた後に落ちる
    let dy;
    if (cur.y > 65) {
      dy = (Math.random() - 0.6) * 4 * impactScale; // ほぼ動かない、わずかに沈む
    } else {
      // 軽く跳ねた後、重力で結局少し下に着地する傾向
      dy = (Math.random() * 6 - 1) * impactScale;  // -1〜+5
    }
    let nx = cur.x + dx;
    let ny = cur.y + dy;
    nx = Math.max(0, Math.min(80, nx));
    ny = Math.max(0, Math.min(85, ny));
    const drot = (Math.random() - 0.5) * 50 * impactScale;
    const nrot = cur.rot + drot;
    el.style.setProperty("--x", nx.toFixed(1) + "%");
    el.style.setProperty("--y", ny.toFixed(1) + "%");
    el.style.setProperty("--rot", nrot.toFixed(0) + "deg");
    // ジャンプ・回転のCSS変数（衝撃感）
    const jumpUp = -(4 + Math.random() * 10) * impactScale;
    const sideKick = (Math.random() - 0.5) * 8 * impactScale;
    const tilt = (Math.random() - 0.5) * 14 * impactScale;
    el.style.setProperty("--byu", jumpUp.toFixed(1) + "px");
    el.style.setProperty("--bxd", sideKick.toFixed(1) + "px");
    el.style.setProperty("--bx",  tilt.toFixed(1) + "deg");
  });
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
  const btn = document.getElementById("pull-btn");
  if (btn) btn.disabled = true;
  const pickedIndex = Math.floor(Math.random() * pool.length);
  const picked = pool[pickedIndex];

  // (1) つまみを 120°→240°→360° と3段階で「ガチャ・ガチャ・ガチャ」と回す
  //    各クリックの瞬間に、キューブ内のカプセルが揺れ + すこしかき混ぜられる
  const lever = document.getElementById("lever");
  lever.style.transform = "rotate(0deg)";
  void lever.offsetWidth;
  const clickAt = (time, deg) => {
    setTimeout(() => {
      lever.style.transform = `rotate(${deg}deg)`;
      shuffleCapsulesABit();
      document.querySelectorAll(".mini-capsule").forEach((el) => {
        el.classList.remove("shaking");
        void el.offsetWidth;
        el.classList.add("shaking");
      });
    }, time);
  };
  clickAt(60, 120);
  clickAt(490, 240);
  clickAt(920, 360);

  // (3) 3回目の回転完了頃にカプセルが排出口から出てくる
  const colorIdx = Math.floor(Math.random() * CAPSULE_COLORS.length);
  const { c: color, d: colorDark } = colorPair(colorIdx);
  const fly = document.getElementById("capsule-fly");
  fly.style.setProperty("--cap-color", color);
  fly.style.setProperty("--cap-color-dark", colorDark);

  // (3a) ふた（取り出し口）がパカッと開く
  const door = document.getElementById("output-door");
  setTimeout(() => { if (door) door.classList.add("opening"); }, 1380);
  setTimeout(() => {
    fly.hidden = false;
    fly.classList.remove("dropping");
    void fly.offsetWidth;
    fly.classList.add("dropping");
  }, 1500);
  // ふたを閉じる
  setTimeout(() => { if (door) door.classList.remove("opening"); }, 2330);

  // (4) 結果モーダルを表示
  setTimeout(() => {
    fly.hidden = true;
    fly.classList.remove("dropping");
    document.querySelectorAll(".mini-capsule.shaking").forEach((el) => el.classList.remove("shaking"));
    showResult(picked, color, { colorDark });
    isSpinning = false;
    if (btn) btn.disabled = false;
  }, 2400);
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
  if (opts.colorDark) cap.style.setProperty("--cap-color-dark", opts.colorDark);
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
      celebrate();
    }, 380);
  }, opts.fromCollection ? 200 : 700);
}

// ---------- 紙吹雪・キラキラ ----------
function celebrate() {
  // 既存レイヤがあれば消す（連続再生対策）
  document.querySelectorAll(".celebrate-layer").forEach((l) => l.remove());

  const layer = document.createElement("div");
  layer.className = "celebrate-layer";
  document.body.appendChild(layer);

  // 中央のグロー
  const stage = document.getElementById("result-stage");
  if (stage) {
    stage.classList.remove("celebrate");
    void stage.offsetWidth;
    stage.classList.add("celebrate");
  }

  // 後光（四方八方に広がる光線・2層で回転方向を変えて立体感）
  // body 直下に配置（celebrate-layer の中だと一部ブラウザで描画されない問題回避）
  const ray1 = document.createElement("div");
  ray1.className = "lightrays celebrate-rays";
  const ray2 = document.createElement("div");
  ray2.className = "lightrays celebrate-rays layer-2";
  document.body.appendChild(ray1);
  document.body.appendChild(ray2);
  setTimeout(() => { ray1.remove(); ray2.remove(); }, 3000);

  // キラキラ
  const N_SPARKLE = 36;
  for (let i = 0; i < N_SPARKLE; i++) {
    const s = document.createElement("div");
    s.className = "sparkle";
    const x = Math.random() * 100;
    const y = 6 + Math.random() * 80;
    const dur = 1.0 + Math.random() * 1.0;
    const delay = Math.random() * 1.6;
    const scale = 0.7 + Math.random() * 1.0;
    s.style.left = x + "vw";
    s.style.top = y + "vh";
    s.style.transform = `scale(${scale})`;
    s.style.setProperty("--dur", dur.toFixed(2) + "s");
    s.style.setProperty("--delay", delay.toFixed(2) + "s");
    layer.appendChild(s);
  }

  // 後始末
  setTimeout(() => layer.remove(), 5500);
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
    const { c: color, d: colorDark } = colorPair(idx);
    const styleStr = unlocked
      ? `--cap-color:${color};--cap-color-dark:${colorDark}`
      : ``;
    card.innerHTML = `
      <div class="col-cap" style="${styleStr}"></div>
      <div class="col-name">${unlocked ? escapeHtml(p.name) : "？？？？"}</div>
      <div class="col-bond">${unlocked ? bondText(p.bond) : ""}</div>
    `;
    if (unlocked) {
      card.addEventListener("click", () => {
        showResult(p, color, { fromCollection: true, colorDark });
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
    if (state.plays.length >= MAX_PLAYS) {
      showToast(`追加できるのは${MAX_PLAYS}個までです`);
      return;
    }
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
  const counter = document.getElementById("play-counter");
  if (counter) {
    counter.textContent = `${state.plays.length} / ${MAX_PLAYS}`;
    counter.classList.toggle("full", state.plays.length >= MAX_PLAYS);
  }
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
  const { c: color, d: colorDark } = colorPair(idx);
  card.innerHTML = `
    <div class="preview-cap" style="--cap-color:${color};--cap-color-dark:${colorDark}"></div>
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
    const before = state.plays.length;
    let skipped = 0;
    newPlays.forEach((p) => {
      if (state.plays.length >= MAX_PLAYS) { skipped++; return; }
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
    const added = state.plays.length - before;
    if (skipped > 0) {
      showToast(`${added}件取り込み。${MAX_PLAYS}個の上限により ${skipped}件スキップしました`);
    } else {
      showToast(`${added}件取り込みました`);
    }
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
