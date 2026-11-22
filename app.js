import { createStore } from "./store.js";
import { BLOOD, MBTI, MBTI_NICK, LOVE_AXES, zodiac, diagnose, loveCode, totalMessage } from "./compat.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* ---------- 小さな道具 ---------- */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
const WD = ["日", "月", "火", "水", "木", "金", "土"];
const dayLabel = (s) => { const d = parseYmd(s); return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`; };
const shortDay = (s) => { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
const mapUrl = (q) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
const stop = (fn) => (ev) => { ev.stopPropagation(); fn(ev); };

const GENRES = [
  { id: "gourmet", label: "🍴 グルメ" },
  { id: "cafe", label: "☕ カフェ" },
  { id: "outing", label: "🎡 おでかけ" },
  { id: "trip", label: "🧳 旅行" },
  { id: "other", label: "✨ その他" },
];
const genreLabel = (id) => (GENRES.find((g) => g.id === id) || GENRES[4]).label;

function toast(msg, undo) {
  const t = $("#toast");
  t.replaceChildren(document.createTextNode(msg));
  if (undo) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "元に戻す";
    b.addEventListener("click", () => { t.hidden = true; undo(); });
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), undo ? 6000 : 2200);
}

/* ---------- ゴミ箱(削除は2段階: 確認 → ゴミ箱へ。3日たつと自動で完全に消える) ---------- */
const TRASH_DAYS = 3;
const TRASH_MS = TRASH_DAYS * 24 * 3600 * 1000;
const TRASH_KINDS = { events: "📅 予定", places: "📍 行きたい所", anniv: "💑 記念日", photos: "🖼️ 写真", posts: "💬 いま", albums: "📚 アルバム", questions: "💌 質問" };
const purged = new Set();
function trashLabel(kind, x) {
  if (kind === "posts") return x.text || "写真";
  if (kind === "questions") return x.text || "";
  if (kind === "photos") return "写真";
  return x.title || "";
}
// 届いた一覧を「表示するもの」と「ゴミ箱のもの」に分ける
function splitTrash(kind, list) {
  state.trash[kind] = list.filter((x) => x.deletedAt);
  purgeOld(kind);
  if (state.device && !$("#settings").hidden) renderTrash();
  return list.filter((x) => !x.deletedAt);
}
// 3日たったものを完全に消す(消せるのは作った本人の端末だけ)
function purgeOld(kind) {
  if (!state.device || !state.store) return;
  for (const x of state.trash[kind] || []) {
    if (mine(x) && Date.now() - x.deletedAt > TRASH_MS && !purged.has(kind + x.id)) {
      purged.add(kind + x.id);
      state.store.remove(room(), kind, x.id);
    }
  }
}
// 1段階目: 確認。2段階目: ゴミ箱へ(すぐ「元に戻す」も押せる)
function softDelete(kind, x, extra = []) {
  const label = trashLabel(kind, x);
  if (!confirm(`「${label.slice(0, 30)}」を削除しますか?\n(${TRASH_DAYS}日間は、設定の「ゴミ箱」から元に戻せます)`)) return false;
  const at = Date.now();
  state.store.save(room(), kind, x.id, { deletedAt: at });
  for (const [k, y] of extra) state.store.save(room(), k, y.id, { deletedAt: at });
  toast("ゴミ箱に移しました", () => restore(kind, x, extra));
  return true;
}
function restore(kind, x, extra) {
  state.store.save(room(), kind, x.id, { deletedAt: 0 });
  // アルバム・行った場所を戻すときは、一緒に消した写真も戻す
  const key = kind === "albums" ? "albumId" : kind === "places" ? "placeId" : null;
  const more = extra || (key
    ? (state.trash.photos || []).filter((p) => p[key] === x.id && Math.abs((p.deletedAt || 0) - (x.deletedAt || 0)) < 10000).map((p) => ["photos", p])
    : []);
  for (const [k, y] of more) state.store.save(room(), k, y.id, { deletedAt: 0 });
  toast("元に戻しました");
}
function renderTrash() {
  const items = Object.keys(TRASH_KINDS).flatMap((kind) => (state.trash[kind] || []).filter(mine).map((x) => ({ kind, x })))
    // アルバムや場所と一緒に消した写真は、アルバム・場所の行にまとめる
    .filter(({ kind, x }) => !(kind === "photos" && (
      (x.albumId && (state.trash.albums || []).some((a) => a.id === x.albumId)) ||
      (x.placeId && (state.trash.places || []).some((a) => a.id === x.placeId)))))
    .sort((p, q) => q.x.deletedAt - p.x.deletedAt);
  const list = items.map(({ kind, x }) => {
    const left = Math.max(0, Math.ceil((x.deletedAt + TRASH_MS - Date.now()) / (24 * 3600 * 1000)));
    const img = kind === "photos" ? x.data : kind === "posts" ? x.photo : null;
    return h("div", { class: "trash-item" },
      img ? h("img", { src: img, alt: "" }) : null,
      h("div", { class: "body" },
        h("div", { class: "t" }, `${TRASH_KINDS[kind]} ${trashLabel(kind, x).slice(0, 40)}`),
        h("div", { class: "s" }, left > 0 ? `あと${left}日で完全に消えます` : "まもなく完全に消えます")),
      h("div", { class: "btns" },
        h("button", { type: "button", class: "small", onclick: () => restore(kind, x) }, "元に戻す"),
        h("button", { type: "button", class: "small ghost", onclick: () => {
          if (!confirm("完全に削除しますか?(もう戻せません)")) return;
          state.store.remove(room(), kind, x.id);
          const key = kind === "albums" ? "albumId" : kind === "places" ? "placeId" : null;
          if (key) for (const p of (state.trash.photos || []).filter((p) => p[key] === x.id && mine(p))) state.store.remove(room(), "photos", p.id);
        } }, "今すぐ消す")));
  });
  if (!list.length) list.push(h("p", { class: "muted" }, "ゴミ箱は空です"));
  $("#trashList").replaceChildren(...list);
}

function newCode() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(24);
  crypto.getRandomValues(buf);
  return [...buf].map((n) => chars[n % chars.length]).join("").replace(/(.{6})(?!$)/g, "$1-");
}
const normCode = (s) => s.trim().toLowerCase().replace(/\s+/g, "");

/* ---------- この端末の設定 ---------- */
const DEVICE_KEY = "couple:device";
function loadDevice() { try { return JSON.parse(localStorage.getItem(DEVICE_KEY) || "null"); } catch { return null; } }
function saveDevice(d) { try { d ? localStorage.setItem(DEVICE_KEY, JSON.stringify(d)) : localStorage.removeItem(DEVICE_KEY); } catch {} }

/* ---------- 状態 ---------- */
let today = ymd(new Date());
const state = {
  store: null,
  device: loadDevice(),     // { room, me: "a" | "b", lastSeen }
  names: { a: "", b: "" },
  places: [],
  events: [],
  anniv: [],
  photos: [],
  albums: [],
  questions: [],
  trash: {}, // ゴミ箱に入っているもの(種類ごと)
  apologies: [], // ごめんね
  members: {}, // 登録されている端末(a: 招待した側, b: 参加した側)
  posts: [],
  profiles: { a: {}, b: {} },
  month: (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(),
  selected: today,
  filter: "todo",
  genre: "all",
  sort: "new",
  unsub: [],
};
const me = () => state.device.me;
const partner = () => (me() === "a" ? "b" : "a");
const nameOf = (w) => w === "both" ? "ふたり" : (state.names[w] || (w === "a" ? "ひとり目" : "ふたり目"));
const room = () => state.device.room;

/* ---------- 色(画面のテーマはこの端末だけ / ふたりの色はプロフィールで共有) ---------- */
const THEMES = [
  { id: "pink", name: "ピンク", accent: "#f06a8a", bg: "#fff8f9", line: "#f0dfe4" },
  { id: "blue", name: "ブルー", accent: "#3d8bfd", bg: "#f5f9ff", line: "#dce8f7" },
  { id: "mint", name: "ミント", accent: "#25a98f", bg: "#f3fbf8", line: "#d5ede6" },
  { id: "lavender", name: "ラベンダー", accent: "#8e6bd8", bg: "#f8f5ff", line: "#e5ddf6" },
  { id: "orange", name: "オレンジ", accent: "#ee8433", bg: "#fff8f2", line: "#f3e2d3" },
  { id: "mono", name: "モノトーン", accent: "#4b5260", bg: "#f6f6f6", line: "#e2e2e2" },
];
const PERSON_COLORS = ["#4a90e2", "#f06a8a", "#25a98f", "#8e6bd8", "#ee8433", "#e0b43a", "#e05a5a", "#3fb6d8", "#7a8b99"];
const DEFAULT_COLOR = { a: "#4a90e2", b: "#f06a8a" };
const THEME_KEY = "couple:theme";
function loadTheme() { try { return JSON.parse(localStorage.getItem(THEME_KEY) || "{}"); } catch { return {}; } }
function saveTheme(t) { try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch {} }
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
function applyColors() {
  const t = loadTheme();
  const theme = THEMES.find((x) => x.id === t.theme) || THEMES[0];
  const mode = t.mode || "auto";
  const root = document.documentElement;
  root.dataset.mode = mode;
  const dark = mode === "dark" || (mode === "auto" && darkQuery.matches);
  root.style.setProperty("--accent", theme.accent);
  if (dark) { root.style.removeProperty("--bg"); root.style.removeProperty("--line"); }
  else { root.style.setProperty("--bg", theme.bg); root.style.setProperty("--line", theme.line); }
  for (const w of ["a", "b"]) {
    const c = (state.profiles[w] && state.profiles[w].color) || DEFAULT_COLOR[w];
    root.style.setProperty("--" + w, c);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme.accent;
}
darkQuery.addEventListener("change", applyColors);
applyColors();

function renderThemeSettings() {
  const t = loadTheme();
  $("#themeList").replaceChildren(...THEMES.map((x) =>
    h("button", { type: "button", class: `theme ${(t.theme || "pink") === x.id ? "on" : ""}`, onclick: () => { saveTheme({ ...loadTheme(), theme: x.id }); applyColors(); renderThemeSettings(); } },
      h("i", { style: `background:${x.accent}` }), x.name)));
  $$("#modeSeg button").forEach((b) => b.classList.toggle("on", (t.mode || "auto") === b.dataset.mode));
}
$$("#modeSeg button").forEach((b) => b.addEventListener("click", () => {
  saveTheme({ ...loadTheme(), mode: b.dataset.mode });
  applyColors();
  renderThemeSettings();
}));

/* ---------- 「相手が追加した新しいもの」 ----------
   タブ(カレンダー/行きたい所/思い出)ごとに「最後に見た時刻」を覚えておき、
   それより後に相手が追加したものに NEW を付ける。タブを離れた時に「見た」ことにする。 */
const CATS = ["calendar", "now", "album"]; // 行きたい所は「予定」タブの中なので calendar に含める
let currentView = null;
const snap = {}; // 今表示している NEW の基準(タブに入った時点の「最後に見た時刻」)
function seenOf(cat) { return (state.device.seen && state.device.seen[cat]) || state.device.lastSeen || 0; }
function setSeen(cat) {
  if (!state.device || !CATS.includes(cat)) return;
  state.device.seen = { ...(state.device.seen || {}), [cat]: Date.now() };
  saveDevice(state.device);
}
const isNew = (x, cat) => x.addedBy && x.addedBy !== me() && (x.createdAt || 0) > (snap[cat] ?? seenOf(cat));
const newBadge = (x, cat) => (isNew(x, cat) ? h("span", { class: "new" }, "NEW") : null);
document.addEventListener("visibilitychange", () => {
  if (!state.device) return;
  if (document.visibilityState === "hidden") setSeen(currentView);
  else {
    if (CATS.includes(currentView)) snap[currentView] = seenOf(currentView);
    today = ymd(new Date());
    rerender();
  }
});
function renderBadges() {
  // バッジは「まだ開いていないタブ」の新着の数
  const unseen = (x, cat) => x.addedBy && x.addedBy !== me() && (x.createdAt || 0) > seenOf(cat);
  const counts = {
    calendar: state.events.filter((x) => unseen(x, "calendar")).length + state.places.filter((p) => !p.done && unseen(p, "calendar")).length,
    album: state.photos.filter((x) => unseen(x, "album")).length,
    now: state.posts.filter((x) => unseen(x, "now")).length,
  };
  const qs = questionsToMe().length; // 答えていない質問は、見ても答えるまで数字を出したまま
  $$("[data-badge]").forEach((b) => {
    const k = b.dataset.badge;
    const n = (k === currentView ? 0 : counts[k] || 0) + (k === "now" ? qs : 0);
    b.textContent = n ? String(n) : "";
    b.hidden = !n;
  });
}

/* ---------- 画面の切り替え ---------- */
function show(view) {
  if (state.device && currentView !== view) {
    setSeen(currentView);
    if (CATS.includes(view)) snap[view] = seenOf(view);
  }
  currentView = view;
  $$(".view").forEach((v) => (v.hidden = v.id !== view));
  $("#tabs").hidden = view === "setup";
  $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  if (state.device && state.store) rerender(); // NEW 印とバッジを今の状態に
  window.scrollTo(0, 0);
}

/* ---------- 記念日・カウントダウン ---------- */
function nextYearly(dateStr) {
  const d = parseYmd(dateStr);
  const t = parseYmd(today);
  let n = new Date(t.getFullYear(), d.getMonth(), d.getDate());
  if (n < t) n = new Date(t.getFullYear() + 1, d.getMonth(), d.getDate());
  return ymd(n);
}
const MILESTONES = [100, 200, 300, 365, 500, 700, 730, 1000, 1095, 1500, 2000, 3000];
function renderCountdowns() {
  const cards = [];
  for (const a of allAnniv().filter((x) => x.kind === "since" && x.date <= today)) {
    const n = daysBetween(a.date, today) + 1;
    const next = MILESTONES.find((m) => m > n) || Math.ceil((n + 1) / 1000) * 1000;
    const isMilestone = MILESTONES.includes(n);
    cards.push(h("div", { class: "cd since" },
      h("div", { class: "cd-t" }, `💑 ${a.title}から`),
      h("div", { class: "cd-n" }, h("b", {}, n.toLocaleString()), "日目"),
      h("div", { class: "cd-s" }, isMilestone ? `🎉 今日は${n}日記念!` : `${next}日記念まで あと${next - n}日`)
    ));
  }
  const yearly = allAnniv()
    .filter((x) => x.kind === "yearly")
    .map((a) => ({ a, left: daysBetween(today, nextYearly(a.date)) }))
    .sort((x, y) => x.left - y.left);
  for (const { a, left } of yearly.slice(0, 3)) {
    cards.push(h("div", { class: "cd yearly" },
      h("div", { class: "cd-t" }, `🎂 ${a.title}`),
      left === 0 ? h("div", { class: "cd-n" }, h("b", {}, "今日!"), "🎉")
        : h("div", { class: "cd-n" }, "あと", h("b", {}, left), "日"),
      h("div", { class: "cd-s" }, dayLabel(nextYearly(a.date)))
    ));
  }
  const nextDate = state.events
    .filter((e) => (e.who || "both") === "both" && (e.endDate || e.date) >= today)
    .sort((x, y) => x.date.localeCompare(y.date) || byTime(x, y))[0];
  if (nextDate) {
    const left = Math.max(0, daysBetween(today, nextDate.date));
    cards.push(h("div", { class: "cd date", onclick: () => selectDay(nextDate.date) },
      h("div", { class: "cd-t" }, "📅 次のデート"),
      left === 0 ? h("div", { class: "cd-n" }, h("b", {}, "今日!")) : h("div", { class: "cd-n" }, "あと", h("b", {}, left), "日"),
      h("div", { class: "cd-s" }, nextDate.title)
    ));
  }
  $("#countdowns").replaceChildren(...cards);
  $("#countdowns").hidden = !cards.length;
}

/* ---------- カレンダー ---------- */
const byTime = (x, y) => (x.time || "99").localeCompare(y.time || "99");

// 何日か続く予定は、その日すべてに出す
function eventsByDate() {
  const map = {};
  for (const e of state.events) {
    if (!e.date) continue;
    const end = e.endDate && e.endDate > e.date ? e.endDate : e.date;
    const span = Math.min(daysBetween(e.date, end), 60);
    for (let i = 0; i <= span; i++) (map[addDays(e.date, i)] ||= []).push(e);
  }
  return map;
}
function annivOnDate(key) {
  return allAnniv().filter((a) => a.date && a.date.slice(5) === key.slice(5) && a.date <= key);
}

function selectDay(key) {
  state.selected = key;
  const d = parseYmd(key);
  state.month = new Date(d.getFullYear(), d.getMonth(), 1);
  renderCalendar();
}

function renderCalendar() {
  renderCountdowns();
  const m = state.month;
  $("#monthLabel").textContent = `${m.getFullYear()}年${m.getMonth() + 1}月`;
  $("#legend").replaceChildren(
    ...["a", "b", "both"].map((w) => h("span", {}, h("span", { class: `dot ${w}` }), nameOf(w)))
  );

  const byDate = eventsByDate();
  const start = new Date(m.getFullYear(), m.getMonth(), 1 - m.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (i >= 35 && d.getMonth() !== m.getMonth()) break;
    const key = ymd(d);
    const evs = (byDate[key] || []).slice().sort(byTime);
    const cls = ["cell"];
    if (d.getMonth() !== m.getMonth()) cls.push("other");
    if (key === today) cls.push("today");
    if (key === state.selected) cls.push("selected");
    if (d.getDay() === 0) cls.push("sun");
    if (d.getDay() === 6) cls.push("sat");
    const hasAnniv = annivOnDate(key).length > 0;
    cells.push(h("button", {
      class: cls.join(" "), "aria-label": `${dayLabel(key)} 予定${evs.length}件`,
      onclick: () => selectDay(key),
    },
      h("span", { class: "num" }, d.getDate()),
      hasAnniv ? h("span", { class: "heart" }, "♥") : null,
      h("span", { class: "dots" }, evs.slice(0, 4).map((e) =>
        h("span", { class: `dot ${e.who || "both"} ${e.endDate && e.endDate > e.date ? "long" : ""}` })))
    ));
  }
  $("#grid").replaceChildren(...cells);
  renderDay();
  renderBadges();
}

function eventItem(e, showDate) {
  const place = e.placeId && state.places.find((p) => p.id === e.placeId);
  const multi = e.endDate && e.endDate > e.date;
  const when = multi ? `${shortDay(e.date)}〜${shortDay(e.endDate)}(${daysBetween(e.date, e.endDate) + 1}日間)`
    : showDate ? dayLabel(e.date) : null;
  const sub = [when, e.time || (multi ? null : "時間未定"), nameOf(e.who || "both")].filter(Boolean).join(" · ");
  const where = e.location || (place ? [place.title, place.area].filter(Boolean).join(" ") : "");
  return h("li", { class: `item ${e.who || "both"}`, onclick: () => openEvent(e) },
    h("div", { class: "body" },
      h("div", { class: "t" }, e.title, newBadge(e, "calendar")),
      h("div", { class: "s" }, sub),
      e.location ? h("div", { class: "s" }, `📍 ${e.location}`) : place ? h("div", { class: "s" }, `📍 ${place.title}`) : null,
      e.memo ? h("div", { class: "s" }, e.memo) : null
    ),
    where ? h("a", { class: "map-btn", href: mapUrl(where), target: "_blank", rel: "noopener", onclick: (ev) => ev.stopPropagation(), "aria-label": "地図で開く" }, "🗺️") : null
  );
}

function renderDay() {
  const annivs = annivOnDate(state.selected);
  $("#dayLabel").textContent = dayLabel(state.selected) + (state.selected === today ? " 今日" : "");
  const evs = (eventsByDate()[state.selected] || []).slice().sort(byTime);
  const items = annivs.map((a) => {
    const years = parseYmd(state.selected).getFullYear() - parseYmd(a.date).getFullYear();
    const label = a.kind === "since" ? (years > 0 ? `${a.title}から${years}年 🎉` : `${a.title} 💗`) : a.auto && years > 0 ? `${a.title}(${years}歳)🎂` : `${a.title} 🎂`;
    return h("li", { class: "item anniv" }, h("div", { class: "body" }, h("div", { class: "t" }, label)));
  });
  items.push(...evs.map((e) => eventItem(e, false)));
  if (!items.length) items.push(h("li", { class: "empty" }, "予定はありません"));

  const shown = new Set(evs.map((e) => e.id));
  const upcoming = state.events
    .filter((e) => e.date >= today && !shown.has(e.id))
    .sort((x, y) => x.date.localeCompare(y.date) || byTime(x, y))
    .slice(0, 5);
  if (upcoming.length) {
    items.push(h("li", {}, h("h3", { style: "margin-top:14px" }, "これからの予定")));
    items.push(...upcoming.map((e) => eventItem(e, true)));
  }
  $("#dayEvents").replaceChildren(...items);
}

/* ---------- 行きたい所 ---------- */
const wantCount = (p) => (p.want_a ? 1 : 0) + (p.want_b ? 1 : 0);

function filteredPlaces() {
  return state.places
    .filter((p) => state.filter === "all" || (state.filter === "done" ? p.done : !p.done))
    .filter((p) => state.genre === "all" || (p.genre || "other") === state.genre);
}

function renderPlaces() {
  $$("#placeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.filter === state.filter));
  $("#genreChips").replaceChildren(
    ...[{ id: "all", label: "すべて" }, ...GENRES].map((g) =>
      h("button", { class: `chip ${state.genre === g.id ? "on" : ""}`, onclick: () => { state.genre = g.id; renderPlaces(); } }, g.label))
  );
  $("#placeSort").value = state.sort;

  const list = filteredPlaces().sort((x, y) =>
    state.sort === "want" ? (wantCount(y) - wantCount(x)) || ((y.createdAt || 0) - (x.createdAt || 0))
      : (y.createdAt || 0) - (x.createdAt || 0));

  const items = list.map((p) => {
    const url = p.url && safeUrl(p.url);
    const planned = state.events.filter((e) => e.placeId === p.id && (e.endDate || e.date) >= today)
      .sort((x, y) => x.date.localeCompare(y.date))[0];
    const iWant = !!p["want_" + me()];
    const both = p.want_a && p.want_b;
    const wantText = both ? "♥ ふたりとも行きたい!" : p.want_a ? `♥ ${nameOf("a")}が行きたい` : p.want_b ? `♥ ${nameOf("b")}が行きたい` : "";
    return h("li", { class: `item ${p.addedBy || "both"} ${p.done ? "done" : ""}` },
      h("button", {
        class: `check ${p.done ? "on" : ""}`, "aria-label": p.done ? "行ったを取り消す" : "行ったにする",
        onclick: () => toggleDone(p),
      }, "✓"),
      h("div", { class: "body", onclick: () => (p.done ? openMemory(p) : openPlace(p)) },
        h("div", { class: "t" }, p.title, newBadge(p, "calendar")),
        h("div", { class: "s" }, [genreLabel(p.genre), p.area, `${nameOf(p.addedBy)}が追加`].filter(Boolean).join(" · ")),
        wantText ? h("div", { class: `s want ${both ? "both" : ""}` }, wantText) : null,
        p.memo ? h("div", { class: "s" }, p.memo) : null,
        h("div", { class: "s links" },
          h("a", { href: mapUrl([p.title, p.area].filter(Boolean).join(" ")), target: "_blank", rel: "noopener", onclick: (ev) => ev.stopPropagation() }, "🗺️ 地図"),
          url ? h("a", { href: url, target: "_blank", rel: "noopener", onclick: (ev) => ev.stopPropagation() }, "🔗 リンク") : null),
        planned ? h("div", { class: "s" }, `📅 ${dayLabel(planned.date)} に予定あり`) : null
      ),
      p.done ? null : h("div", { class: "btns" },
        h("button", {
          class: `heart-btn ${iWant ? "on" : ""}`, "aria-label": iWant ? "行きたいを取り消す" : "私も行きたい",
          onclick: stop(() => state.store.save(room(), "places", p.id, { ["want_" + me()]: !iWant })),
        }, iWant ? "♥" : "♡"),
        h("button", { class: "small", onclick: stop(() => planPlace(p)) }, "予定に")
      )
    );
  });
  if (!items.length) {
    items.push(h("li", { class: "empty" },
      state.filter === "done" ? "まだ「行った」場所はありません" : "「＋ 追加」から行きたい所を入れてみよう"));
  }
  $("#placeList").replaceChildren(...items);
  renderBadges();
}

function planPlace(p) {
  openEvent({ title: p.title, placeId: p.id, date: state.selected >= today ? state.selected : today, who: "both",
    location: [p.title, p.area].filter(Boolean).join(" ") });
}

function toggleDone(p) {
  if (p.done) {
    state.store.save(room(), "places", p.id, { done: false });
    toast("「行きたい」に戻しました");
    return;
  }
  const visitedOn = p.visitedOn || today;
  state.store.save(room(), "places", p.id, { done: true, visitedOn });
  toast("行った!にしました 🎉 思い出を残そう");
  openMemory({ ...p, done: true, visitedOn });
}

/* ---------- ルーレット ---------- */
let rouletteTimer = null;
let roulettePick = null;
function spin() {
  const pool = state.places.filter((p) => !p.done && (state.genre === "all" || (p.genre || "other") === state.genre));
  $("#rouletteNote").textContent = state.genre === "all" ? "行きたい所リストから選びます" : `${genreLabel(state.genre)} から選びます`;
  if (!pool.length) {
    $("#rouletteName").textContent = "候補がありません";
    $("#rouletteSub").textContent = "行きたい所を追加してね";
    $("#btnRoulettePlan").hidden = true;
    return;
  }
  // ふたりとも行きたい場所は当たりやすく
  const weighted = pool.flatMap((p) => Array(1 + wantCount(p)).fill(p));
  clearInterval(rouletteTimer);
  $("#btnRoulettePlan").hidden = true;
  $("#rouletteName").classList.add("spinning");
  let n = 0;
  rouletteTimer = setInterval(() => {
    const p = weighted[Math.floor(Math.random() * weighted.length)];
    $("#rouletteName").textContent = p.title;
    $("#rouletteSub").textContent = "";
    if (++n >= 18) {
      clearInterval(rouletteTimer);
      roulettePick = weighted[Math.floor(Math.random() * weighted.length)];
      $("#rouletteName").textContent = `🎉 ${roulettePick.title}`;
      $("#rouletteName").classList.remove("spinning");
      $("#rouletteSub").textContent = [genreLabel(roulettePick.genre), roulettePick.area].filter(Boolean).join(" · ");
      $("#btnRoulettePlan").hidden = false;
    }
  }, 70);
}
$("#btnRoulette").addEventListener("click", () => { $("#rouletteDialog").showModal(); spin(); });
$("#btnSpinAgain").addEventListener("click", spin);
$("#btnRoulettePlan").addEventListener("click", () => {
  $("#rouletteDialog").close();
  if (roulettePick) planPlace(roulettePick);
});
$("#rouletteDialog").addEventListener("close", () => clearInterval(rouletteTimer));

/* ---------- 思い出アルバム ---------- */
const photosOf = (placeId) => state.photos.filter((x) => x.placeId === placeId).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
const starText = (n) => (n ? "★".repeat(n) + "☆".repeat(5 - n) : "");

function renderAlbum() {
  const list = state.places.filter((p) => p.done)
    .sort((x, y) => (y.visitedOn || "").localeCompare(x.visitedOn || "") || (y.updatedAt || 0) - (x.updatedAt || 0));
  const items = list.map((p) => {
    const ph = photosOf(p.id);
    const fresh = ph.some((x) => isNew(x, "album"));
    const reviews = ["a", "b"].filter((w) => p[`stars_${w}`]).map((w) => `${nameOf(w)} ${starText(p[`stars_${w}`])}`);
    return h("li", { class: "album-item", onclick: () => openMemory(p) },
      ph.length ? h("img", { src: ph[ph.length - 1].data, alt: "", loading: "lazy" }) : h("div", { class: "noimg" }, genreLabel(p.genre).split(" ")[0]),
      h("div", { class: "album-body" },
        h("div", { class: "t" }, p.title, fresh ? h("span", { class: "new" }, "NEW") : null),
        h("div", { class: "s" }, [p.visitedOn ? dayLabel(p.visitedOn) : null, ph.length ? `📷 ${ph.length}枚` : null].filter(Boolean).join(" · ")),
        reviews.length ? h("div", { class: "s stars-s" }, reviews.join("  ")) : h("div", { class: "s" }, "感想を書こう ✏️")
      )
    );
  });
  if (!items.length) items.push(h("li", { class: "empty" }, "行きたい所の ✓ を押すと、ここに思い出が増えていきます"));
  $("#albumList").replaceChildren(...items);
  renderBadges();
}

let memoryPlaceId = null;
function renderStars(n) {
  $("#memoryForm").stars.value = n || "";
  $("#myStars").replaceChildren(...[1, 2, 3, 4, 5].map((i) =>
    h("button", { type: "button", class: `star ${i <= (n || 0) ? "on" : ""}`, "aria-label": `${i}つ星`,
      onclick: () => renderStars(i === Number($("#memoryForm").stars.value) ? 0 : i) }, "★")));
}
function renderMemoryPhotos() {
  if (!memoryPlaceId) return;
  const ph = photosOf(memoryPlaceId);
  $("#photoGrid").replaceChildren(...ph.map((x) =>
    h("button", { type: "button", class: "photo", onclick: () => openPhoto(x) },
      h("img", { src: x.data, alt: "", loading: "lazy" }), newBadge(x, "album"))));
  if (!ph.length) $("#photoGrid").replaceChildren(h("p", { class: "muted" }, "まだ写真はありません"));
}
function renderPartnerReview(p) {
  const w = partner();
  const stars = p[`stars_${w}`];
  const text = p[`text_${w}`];
  $("#partnerReview").replaceChildren(
    h("div", { class: "review-head" }, h("span", { class: `dot ${w}` }), h("b", {}, nameOf(w)), " の感想"),
    ...(stars || text
      ? [stars ? h("div", { class: "stars-s" }, starText(stars)) : null, text ? h("div", { class: "s" }, text) : null].filter(Boolean)
      : [h("div", { class: "muted" }, "まだ書かれていません")])
  );
}
function openMemory(p) {
  memoryPlaceId = p.id;
  const f = $("#memoryForm");
  f.reset();
  f.placeId.value = p.id;
  f.visitedOn.value = p.visitedOn || "";
  f.text.value = p[`text_${me()}`] || "";
  $("#memoryTitle").textContent = `📷 ${p.title}`;
  $("#myName").textContent = nameOf(me());
  $("#myDot").className = `dot ${me()}`;
  $("#photoMsg").textContent = "";
  renderStars(p[`stars_${me()}`] || 0);
  renderPartnerReview(p);
  renderMemoryPhotos();
  // 「行った場所」も、追加した本人なら削除できる
  $("#btnDeleteVisited").hidden = !mine(p);
  if (!$("#memoryDialog").open) $("#memoryDialog").showModal();
}
$("#btnDeleteVisited").addEventListener("click", () => {
  const p = state.places.find((x) => x.id === memoryPlaceId);
  if (!p) return;
  // その場所の自分の写真も一緒にゴミ箱へ(戻すと一緒に戻る)
  const ph = photosOf(p.id).filter(mine).map((x) => ["photos", x]);
  if (softDelete("places", p, ph)) $("#memoryDialog").close();
});
$("#memoryDialog").addEventListener("close", () => { memoryPlaceId = null; });

$("#memoryForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.target;
  state.store.save(room(), "places", f.placeId.value, {
    visitedOn: f.visitedOn.value,
    [`stars_${me()}`]: Number(f.stars.value) || 0,
    [`text_${me()}`]: f.text.value.trim(),
  });
  $("#memoryDialog").close();
  toast("思い出を保存しました");
});

// 写真は小さくしてから保存(1枚およそ100KB)
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("画像を読み込めませんでした")); };
    img.src = url;
  });
}
async function compress(file, maxSide = 1080, target = 300000) {
  const img = await loadImage(file);
  let max = maxSide, q = 0.72, data = "";
  for (let i = 0; i < 6; i++) {
    const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * r);
    c.height = Math.round(img.naturalHeight * r);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    data = c.toDataURL("image/jpeg", q);
    if (data.length < target) break;
    max = Math.round(max * 0.8);
    q = Math.max(0.5, q - 0.06);
  }
  return data;
}
$("#photoInput").addEventListener("change", async (ev) => {
  const files = [...ev.target.files];
  ev.target.value = "";
  if (!files.length || !memoryPlaceId) return;
  const placeId = memoryPlaceId;
  let ok = 0;
  for (const [i, file] of files.entries()) {
    $("#photoMsg").textContent = `写真を保存しています… (${i + 1}/${files.length})`;
    try {
      const data = await compress(file);
      await state.store.save(room(), "photos", null, { placeId, data, addedBy: me() });
      ok++;
    } catch (e) {
      console.error(e);
    }
  }
  $("#photoMsg").textContent = ok === files.length ? "" : `${files.length - ok}枚は保存できませんでした`;
  if (ok) toast(`写真を${ok}枚追加しました`);
});

let viewingPhoto = null;
function openPhoto(x) {
  viewingPhoto = x;
  $("#photoBig").src = x.data;
  $("#btnDeletePhoto").hidden = !mine(x);
  $("#btnSavePhoto").href = x.data;
  $("#photoCaption").textContent = `${nameOf(x.addedBy)}が追加 · ${timeAgo(x.createdAt)}`;
  $("#photoDialog").showModal();
}
$("#btnDeletePhoto").addEventListener("click", () => {
  if (!viewingPhoto) return;
  if (softDelete("photos", viewingPhoto)) $("#photoDialog").close();
});

/* ---------- 相手のものは見るだけ ---------- */
const mine = (x) => !x || !x.id || !x.addedBy || x.addedBy === me();
function setReadonly(form, ro, note) {
  form.querySelectorAll("input:not([type=hidden]), select, textarea").forEach((el) => (el.disabled = ro));
  const submit = form.querySelector("button[type=submit]");
  if (submit) submit.hidden = ro;
  let n = form.querySelector(".ro-note");
  if (!n) { n = h("p", { class: "ro-note" }); form.querySelector("h2").after(n); }
  n.textContent = note || "";
  n.hidden = !ro;
}

/* ---------- 予定の入力 ---------- */
function openEvent(e = {}) {
  const f = $("#eventForm");
  f.reset();
  const ro = !mine(e);
  setReadonly(f, ro, `${nameOf(e.addedBy)}が入れた予定です(見るだけ)`);
  f.title.value = e.title || "";
  f.date.value = e.date || state.selected;
  f.endDate.value = e.endDate || "";
  f.time.value = e.time || "";
  f.location.value = e.location || "";
  f.memo.value = e.memo || "";
  f.id.value = e.id || "";
  f.placeId.value = e.placeId || "";
  f.querySelector(`input[name=who][value="${e.who || "both"}"]`).checked = true;
  $$("#eventForm .wname").forEach((s) => (s.textContent = nameOf(s.dataset.w)));
  $("#eventDialogTitle").textContent = ro ? "予定" : e.id ? "予定を変更" : "予定を追加";
  $("#btnDeleteEvent").hidden = !e.id || ro;
  $("#eventMsg").textContent = "";
  $("#eventDialog").showModal();
}

$("#eventForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const data = {
    title: f.title.value.trim(),
    date: f.date.value,
    endDate: f.endDate.value && f.endDate.value > f.date.value ? f.endDate.value : "",
    time: f.time.value,
    location: f.location.value.trim(),
    who: f.who.value,
    memo: f.memo.value.trim(),
    placeId: f.placeId.value || "",
  };
  if (!data.title || !data.date) return;
  if (f.endDate.value && f.endDate.value < f.date.value) {
    $("#eventMsg").textContent = "終わりの日は、始まりの日より後にしてください";
    return;
  }
  if (data.endDate && daysBetween(data.date, data.endDate) > 60) {
    $("#eventMsg").textContent = "続く予定は60日までにしてください";
    return;
  }
  if (!f.id.value) data.addedBy = me();
  state.store.save(room(), "events", f.id.value || null, data);
  $("#eventDialog").close();
  toast("予定を保存しました");
  show("calendar");
  selectDay(data.date);
});

$("#btnDeleteEvent").addEventListener("click", () => {
  const e = state.events.find((x) => x.id === $("#eventForm").id.value);
  if (!e) return;
  if (softDelete("events", e)) $("#eventDialog").close();
});

/* ---------- 行きたい所の入力 ---------- */
$("#genreSelect").replaceChildren(...GENRES.map((g) => h("option", { value: g.id }, g.label)));

function openPlace(p = {}) {
  const f = $("#placeForm");
  f.reset();
  const ro = !mine(p);
  setReadonly(f, ro, `${nameOf(p.addedBy)}が追加した場所です(見るだけ。♡ や「予定に」は使えます)`);
  f.title.value = p.title || "";
  f.genre.value = p.genre || (state.genre !== "all" ? state.genre : "outing");
  f.area.value = p.area || "";
  f.url.value = p.url || "";
  f.memo.value = p.memo || "";
  f.id.value = p.id || "";
  $("#placeDialogTitle").textContent = ro ? "行きたい所" : p.id ? "行きたい所を変更" : "行きたい所を追加";
  $("#btnDeletePlace").hidden = !p.id || ro;
  $("#placeDialog").showModal();
}

$("#placeForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const data = { title: f.title.value.trim(), genre: f.genre.value, area: f.area.value.trim(), url: f.url.value.trim(), memo: f.memo.value.trim() };
  if (!data.title) return;
  if (!f.id.value) { data.addedBy = me(); data.done = false; data["want_" + me()] = true; }
  state.store.save(room(), "places", f.id.value || null, data);
  $("#placeDialog").close();
  toast("保存しました");
});

$("#btnDeletePlace").addEventListener("click", () => {
  const p = state.places.find((x) => x.id === $("#placeForm").id.value);
  if (!p) return;
  if (softDelete("places", p)) $("#placeDialog").close();
});

$$("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
// 外側(暗いところ)を押したら閉じる。全画面のアルバムは除く
$$("dialog:not(.full)").forEach((d) => d.addEventListener("click", (ev) => {
  if (d.id === "profileDialog" && tutorial.phase === "profile") return; // チュートリアル中は閉じない
  if (ev.target === d) d.close();
}));

/* ---------- 設定 ---------- */
function renderSettings() {
  if (!state.device) return;
  $("#myNameLabel").textContent = me() === "a" ? "あなた(招待した側)" : "あなた(コードで参加した側)";
  $("#myNameDot").className = `dot ${me()}`;
  $("#myNameInput").value = state.names[me()] || "";
  $("#partnerNameText").textContent = state.names[partner()] || "(まだ参加していません)";
  $("#partnerNameDot").className = `dot ${partner()}`;
  $("#pairCode").textContent = room();
  const reg = !!(state.members && state.members[partner()]);
  $("#partnerReg").textContent = reg
    ? `パートナーの端末: 登録済み(${nameOf(partner())})`
    : "パートナーの端末: まだ登録されていません(ペアコードで参加してもらってください)";
  $("#btnResetPartner").hidden = !reg || !state.store.shared;
  $("#recoveryCode").textContent = state.device.recovery || "(まだありません)";
  renderThemeSettings();
  renderAnnivList();
  renderTrash();
}

function renderAnnivList() {
  const items = allAnniv().sort((x, y) => (x.date || "").localeCompare(y.date || "")).map((a) =>
    h("li", { class: "item anniv" },
      h("div", { class: "body" },
        h("div", { class: "t" }, (a.kind === "since" ? "💑 " : "🎂 ") + a.title),
        h("div", { class: "s" }, `${a.kind === "yearly" ? `毎年 ${Number(a.date.slice(5, 7))}月${Number(a.date.slice(8))}日` : dayLabel(a.date)} · ${a.auto ? "プロフィールの誕生日から自動" : `${nameOf(a.addedBy)}が追加`}`)),
      a.auto
        ? (a.who === me() ? h("button", { class: "small ghost", onclick: () => { show("couple"); openProfile(a.who); } }, "変更") : null)
        : mine(a)
          ? h("button", { class: "small ghost", onclick: () => softDelete("anniv", a) }, "削除")
          : null));
  if (!items.length) items.push(h("li", { class: "empty" }, "まだありません。付き合った日などを入れてみよう"));
  $("#annivList").replaceChildren(...items);
}

$("#annivForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const data = { title: f.title.value.trim(), date: f.date.value, kind: f.kind.value, addedBy: me() };
  if (!data.title || !data.date) return;
  state.store.save(room(), "anniv", null, data);
  f.reset();
  toast("記念日を追加しました");
});

$("#btnSaveNames").addEventListener("click", async () => {
  const name = $("#myNameInput").value.trim();
  if (!name) { toast("名前を入れてください"); return; }
  try {
    await state.store.saveRoom(room(), { names: { [me()]: name } });
    toast("保存しました");
  } catch (e) {
    console.error(e);
    toast("保存できませんでした");
  }
});

async function copyText(text, msgEl, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    msgEl.textContent = okMsg;
  } catch {
    msgEl.textContent = "コピーできませんでした。長押しして選んでください。";
  }
}
$("#btnCopyCode").addEventListener("click", () => copyText(room(), $("#copyMsg"), "コピーしました。LINE などで相手に送ってください。"));
$("#btnCopyRecovery").addEventListener("click", () => copyText(state.device.recovery || "", $("#recoveryMsg"), "コピーしました。スクショやメモなど、自分だけが見られる所に保存してください。"));
$("#btnNewRecovery").addEventListener("click", async () => {
  if (state.device.recovery && !confirm("新しい復元コードを作りますか?(前のコードは使えなくなります)")) return;
  try {
    await makeRecovery();
    renderSettings();
    $("#recoveryMsg").textContent = "新しい復元コードを作りました。保存しておいてください。";
  } catch (e) {
    console.error(e);
    $("#recoveryMsg").textContent = "作れませんでした。電波を確かめてください。";
  }
});

// 相手の端末の登録を外す(相手がアプリを入れ直したときなど)。データはそのまま
$("#btnResetPartner").addEventListener("click", async () => {
  const p = nameOf(partner());
  if (!confirm(`${p}の端末の登録を外しますか?\n\n${p}は、もう一度ペアコードで参加できるようになります。予定や写真などのデータは消えません。`)) return;
  if (!confirm(`本当に外しますか?\n(${p}が今使っている端末は、参加し直すまで編集できなくなります)`)) return;
  try {
    await state.store.clearMember(room(), partner());
    toast(`${p}の登録を外しました。ペアコードで参加し直してもらってください`);
  } catch (e) {
    console.error(e);
    toast("できませんでした。電波を確かめてください");
  }
});

$("#btnLeave").addEventListener("click", () => {
  if (!confirm("この端末のペア設定をやめますか?\n(ペアコードと復元コードがあれば、あとで戻れます)")) return;
  state.unsub.forEach((u) => u());
  state.unsub = [];
  state.device = null;
  saveDevice(null);
  show("setup");
});

/* ---------- 自分の立場(招待した側/参加した側)の登録 ----------
   この端末のログイン ID を部屋の members に登録し、Firebase のルールで
   「自分が作ったものだけ変更できる」ようにする。 */
function randomKey(n) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  return [...buf].map((x) => chars[x % chars.length]).join("");
}
// 復元コード: 「A-XXXX-XXXX-XXXX-XXXX」の形(先頭が立場)
async function makeRecovery() {
  const key = randomKey(16);
  await state.store.saveNow(room(), "secrets", me(), { key });
  state.device.recovery = `${me().toUpperCase()}-${key.match(/.{4}/g).join("-")}`;
  saveDevice(state.device);
}

// 起動時: この端末が自分の枠に登録されているか確かめる(以前からのペアは、ここで登録される)
async function ensureMembership() {
  if (!state.store.shared) return "ok";
  const data = await state.store.getRoom(room());
  if (!data) return "missing";
  const members = data.members || {};
  if (members[me()] === state.store.uid) {
    if (!state.device.registered) { state.device.registered = true; saveDevice(state.device); }
    return "ok";
  }
  if (members[me()]) return "taken"; // 別の端末が登録済み → 復元コードが必要
  // 一度登録した端末の枠が空いている = 相手が「登録をやり直す」を押した → 自動では入らない
  if (state.device.registered) return "removed";
  // 以前の版から使っている端末は、ここで初めて登録する
  await state.store.saveRoom(room(), { members: { [me()]: state.store.uid } });
  state.device.registered = true;
  saveDevice(state.device);
  if (!state.device.recovery) await makeRecovery().catch((e) => console.error(e));
  return "ok";
}

function showSetupMessage(msg) {
  show("setup");
  $("#setupMsg").textContent = msg;
}

/* ---------- はじめての設定 ---------- */
$("#btnNewPair").addEventListener("click", async () => {
  const name = $("#setupName").value.trim();
  if (!name) { $("#setupMsg").textContent = "名前を入れてください"; return; }
  const code = newCode();
  try {
    await state.store.saveRoom(code, { names: { a: name }, members: { a: state.store.uid } });
    state.device = { room: code, me: "a", lastSeen: Date.now(), registered: true };
    await makeRecovery();
  } catch (e) {
    console.error(e);
    $("#setupMsg").textContent = "作れませんでした。電波を確かめてください。";
    return;
  }
  saveDevice(state.device);
  start();
  show("settings");
  toast("ペアコードを相手に送ってください");
  setTimeout(maybeStartTutorial, 800);
});

$("#btnJoin").addEventListener("click", async () => {
  const name = $("#setupName").value.trim();
  const code = normCode($("#setupCode").value);
  $("#setupMsg").textContent = "";
  if (!name) { $("#setupMsg").textContent = "名前を入れてください"; return; }
  if (!code) { $("#setupMsg").textContent = "ペアコードを入れてください"; return; }
  let data;
  try {
    data = await state.store.getRoom(code);
  } catch (e) {
    console.error(e);
    $("#setupMsg").textContent = "つながりませんでした。電波を確かめてください。";
    return;
  }
  if (!data) { $("#setupMsg").textContent = "そのペアコードは見つかりませんでした。もう一度確かめてください。"; return; }
  // 空いている枠に入る(ふつうは「参加した側 b」。相手が登録をやり直した場合は空いた方)
  const members = data.members || {};
  const already = ["a", "b"].find((s) => members[s] === state.store.uid); // この端末がすでに登録済み
  const slot = already || (!members.b ? "b" : !members.a ? "a" : null);
  if (!slot) {
    $("#setupMsg").textContent = "このペアには、もう二人分の端末が登録されています。"
      + "相手の設定画面の「パートナーの登録をやり直す」を押してもらってから、もう一度参加してください。"
      + "(この端末で以前参加していた人は、下の「復元コードで戻る」も使えます)";
    return;
  }
  try {
    await state.store.saveRoom(code, { names: { [slot]: name }, members: { [slot]: state.store.uid } });
    state.device = { room: code, me: slot, lastSeen: Date.now(), registered: true };
    await makeRecovery();
  } catch (e) {
    console.error(e);
    $("#setupMsg").textContent = "参加できませんでした。もう一度ためしてください。";
    return;
  }
  saveDevice(state.device);
  start();
  show("calendar");
  toast("ペアに参加しました");
  setTimeout(maybeStartTutorial, 800);
});

// 機種変更・アプリを消したとき: ペアコード + 復元コードで自分の枠に戻る
$("#btnRecover").addEventListener("click", async () => {
  const code = normCode($("#recoverPair").value);
  const rc = $("#recoverCode").value.trim().toUpperCase().replace(/[\s-]/g, "");
  $("#recoverMsg").textContent = "";
  if (!code || rc.length !== 17 || !"AB".includes(rc[0])) {
    $("#recoverMsg").textContent = "ペアコードと復元コード(A- または B- で始まるコード)を入れてください";
    return;
  }
  const role = rc[0].toLowerCase();
  const key = rc.slice(1);
  try {
    await state.store.saveNow(code, "claims", state.store.uid, { role, key });
    await state.store.saveRoom(code, { members: { [role]: state.store.uid } });
  } catch (e) {
    console.error(e);
    $("#recoverMsg").textContent = "戻れませんでした。ペアコードと復元コードを確かめてください。";
    return;
  }
  state.device = { room: code, me: role, lastSeen: Date.now(), registered: true, recovery: `${role.toUpperCase()}-${key.match(/.{4}/g).join("-")}` };
  saveDevice(state.device);
  start();
  show("calendar");
  toast("元のペアに戻りました");
  setTimeout(maybeStartTutorial, 800);
});

/* ---------- ふたりのプロフィール・相性 ---------- */
// プロフィールの誕生日は、自動で「毎年の記念日」としてカレンダーに入る
function allAnniv() {
  const auto = ["a", "b"].filter((w) => state.profiles[w].birthday).map((w) => ({
    id: "pf-" + w, who: w, auto: true, kind: "yearly",
    title: `${nameOf(w)}の誕生日`, date: state.profiles[w].birthday,
  }));
  return [...auto, ...state.anniv];
}

function ageOf(birthday) {
  if (!birthday) return null;
  const b = parseYmd(birthday), t = parseYmd(today);
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
  return age >= 0 ? age : null;
}

function profileCard(w) {
  const p = state.profiles[w];
  const z = zodiac(p.birthday);
  const age = ageOf(p.birthday);
  const love = loveCode(p);
  const rows = [
    ["🎂 誕生日", p.birthday ? `${parseYmd(p.birthday).getFullYear()}年${dayLabel(p.birthday).replace(/\(.\)/, "")}${age != null ? `(${age}歳)` : ""}` : ""],
    ["⭐ 星座", z ? z.name : ""],
    ["🩸 血液型", p.blood ? `${p.blood}型` : ""],
    ["🧠 MBTI", p.mbti ? `${p.mbti}(${MBTI_NICK[p.mbti] || ""})` : ""],
    ["💘 ラブタイプ", [love, p.loveName].filter(Boolean).join(" ")],
    ["🎮 趣味", p.hobby], ["🍽️ 好きな食べ物", p.food],
    ["😊 嬉しいこと", p.happy], ["⚠️ 苦手なこと", p.ng], ["📝 メモ", p.memo],
  ].filter(([, v]) => v);
  return h("div", { class: `card profile ${w}` },
    h("div", { class: "profile-head" },
      avatar(w, "md"),
      h("div", {}, h("b", {}, nameOf(w)), h("div", { class: "muted" }, w === me() ? "あなた" : "パートナー")),
      h("span", { class: "grow" }),
      w === me() ? h("button", { class: "small", onclick: () => openProfile(w) }, "編集") : null),
    rows.length
      ? h("dl", { class: "profile-list" }, ...rows.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]))
      : h("p", { class: "muted" }, w === me() ? "まだ入力されていません。「編集」から入れてね" : "まだ入力されていません"));
}

// アイコン(写真がなければ名前の1文字目)
function avatar(w, size = "md") {
  const p = state.profiles[w] || {};
  return p.avatar
    ? h("img", { class: `avatar ${size} ${w}`, src: p.avatar, alt: nameOf(w) })
    : h("span", { class: `avatar ${size} ${w} letter` }, (nameOf(w) || "?").slice(0, 1));
}

function renderCouple() {
  if (!state.device) return;
  $("#profiles").replaceChildren(profileCard(me()), profileCard(partner()));
  const { total, sections } = diagnose(state.profiles.a, state.profiles.b);
  const box = $("#compat");
  if (total == null) {
    box.replaceChildren(
      h("h2", {}, "💞 ふたりの相性診断"),
      h("p", { class: "muted" }, "二人とも、誕生日・血液型・MBTI・ラブタイプのどれかを入れると相性診断ができます。"),
      ...[torisetsu()].filter(Boolean));
    return;
  }
  const hearts = Math.round(total / 20);
  box.replaceChildren(
    h("h2", {}, "💞 ふたりの相性診断"),
    h("div", { class: "total" },
      h("div", { class: "total-n" }, h("b", {}, total), "%"),
      h("div", { class: "total-h" }, "♥".repeat(hearts) + "♡".repeat(5 - hearts)),
      h("div", { class: "total-m" }, totalMessage(total))),
    ...sections.map((s) => h("div", { class: "compat-sec" },
      h("div", { class: "compat-title" }, h("span", {}, s.title), h("b", {}, `${s.score}%`)),
      h("div", { class: "bar" }, h("i", { style: `width:${s.score}%` })),
      s.good.length ? h("div", { class: "compat-good" }, h("b", {}, "👍 いいところ"), h("ul", {}, ...s.good.map((x) => h("li", {}, x)))) : null,
      s.care.length ? h("div", { class: "compat-care" }, h("b", {}, "💡 気を付けたいこと"), h("ul", {}, ...s.care.map((x) => h("li", {}, x)))) : null)),
    ...[torisetsu()].filter(Boolean),
    h("p", { class: "muted small-note" }, "※ 血液型・星座・MBTI・ラブタイプの相性は、科学的な根拠がはっきりしない「お楽しみ」です。いちばん大事なのは、二人で話し合うこと。"));
}

// 「ふたりのトリセツ」: プロフィールに書いた嬉しいこと・苦手なことをまとめる
function torisetsu() {
  const lines = [];
  for (const w of [partner(), me()]) {
    const p = state.profiles[w];
    if (p.happy) lines.push(h("li", {}, `${nameOf(w)}は「${p.happy}」が嬉しい`));
    if (p.ng) lines.push(h("li", {}, `${nameOf(w)}は「${p.ng}」が苦手`));
    if (p.food) lines.push(h("li", {}, `${nameOf(w)}の好きな食べ物は「${p.food}」`));
  }
  if (!lines.length) return null;
  return h("div", { class: "compat-sec torisetsu" }, h("div", { class: "compat-title" }, h("span", {}, "📖 ふたりのトリセツ")), h("ul", {}, ...lines));
}

const PROFILE_KEYS = ["color", "birthday", "blood", "mbti", "loveName", "hobby", "food", "happy", "ng", "memo", "love_lf", "love_ca", "love_rp", "love_eo"];
$("#pfBlood").replaceChildren(h("option", { value: "" }, "未入力"), ...BLOOD.map((b) => h("option", { value: b }, `${b}型`)));
$("#pfMbti").replaceChildren(h("option", { value: "" }, "未入力"), ...MBTI.map((m) => h("option", { value: m }, `${m} ${MBTI_NICK[m]}`)));
$("#pfLove").replaceChildren(...LOVE_AXES.map((ax) =>
  h("select", { name: "love_" + ax.key, "aria-label": "ラブタイプ" },
    h("option", { value: "" }, "−"), ...ax.options.map(([v, label]) => h("option", { value: v }, label)))));

let pendingAvatar = null; // 選んだけれどまだ保存していないアイコン
function showAvatarPreview(src) {
  const box = $("#avatarPreview");
  box.replaceChildren(src ? h("img", { class: `avatar lg ${me()}`, src, alt: "" }) : h("span", { class: `avatar lg ${me()} letter` }, (nameOf(me()) || "?").slice(0, 1)));
}
function openProfile(w) {
  if (w !== me()) return; // 相手のプロフィールは編集できない
  const f = $("#profileForm");
  const p = state.profiles[w];
  f.reset();
  f.elements.who.value = w;
  for (const k of PROFILE_KEYS) f.elements[k].value = p[k] || "";
  pendingAvatar = null;
  showAvatarPreview(p.avatar);
  renderSwatches(p.color || DEFAULT_COLOR[w]);
  const first = tutorial.phase === "profile";
  $("#profileTitle").textContent = first ? "まずはあなたのプロフィール 📝" : `${nameOf(w)}のプロフィール`;
  $("#profileForm [data-close]").hidden = first; // チュートリアル中は「やめる」を出さない
  $("#profileDialog").showModal();
}

// 自分の色を選ぶ(決まった色 + 好きな色)
function renderSwatches(current) {
  $("#profileForm").elements.color.value = current;
  const custom = !PERSON_COLORS.includes(current);
  const picker = h("input", { type: "color", value: current, "aria-label": "好きな色を選ぶ" });
  picker.addEventListener("change", () => renderSwatches(picker.value));
  $("#colorSwatches").replaceChildren(
    ...PERSON_COLORS.map((c) => h("button", {
      type: "button", class: `swatch ${c === current ? "on" : ""}`, style: `background:${c}`, "aria-label": c,
      onclick: () => renderSwatches(c),
    })),
    h("label", { class: `swatch custom ${custom ? "on" : ""}`, style: custom ? `background:${current}` : "", title: "好きな色" }, custom ? "" : "＋", picker));
}

// アイコン写真: 真ん中を正方形に切り取って小さくする
async function squareIcon(file, size = 240) {
  const img = await loadImage(file);
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
  return c.toDataURL("image/jpeg", 0.82);
}
$("#avatarInput").addEventListener("change", async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = "";
  if (!file) return;
  try {
    pendingAvatar = await squareIcon(file);
    showAvatarPreview(pendingAvatar);
  } catch (e) {
    console.error(e);
    toast("写真を読み込めませんでした");
  }
});

$("#profileForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.target;
  if (f.elements.who.value !== me()) return;
  const data = {};
  for (const k of PROFILE_KEYS) data[k] = (f.elements[k].value || "").trim();
  if (pendingAvatar) data.avatar = pendingAvatar;
  state.store.save(room(), "profiles", me(), data);
  $("#profileDialog").close();
  if (tutorial.phase === "profile") { tutorial.phase = "tour"; tutorial.i = 0; setTimeout(showCoachStep, 300); return; }
  toast(data.birthday ? "保存しました。誕生日をカレンダーに入れました 🎂" : "保存しました");
});

/* ---------- いま(今なにしてる?) ---------- */
const QUICK = ["🍚 ごはん中", "💼 仕事中", "🚃 移動中", "🛁 お風呂", "🎮 ゲーム中", "📺 テレビ見てる", "🛒 買い物中", "😴 もう寝るね", "💭 会いたい"];
function timeAgo(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "たった今";
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const latestPost = (w) => state.posts.filter((p) => p.addedBy === w).sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0))[0];

function nowCard(w) {
  const p = latestPost(w);
  return h("div", { class: `now-card ${w}` },
    h("div", { class: "now-who" }, storyAvatar(w, "sm"), h("b", {}, nameOf(w)), h("span", { class: "muted" }, p ? timeAgo(p.createdAt) : "")),
    p && p.photo ? h("img", { class: "now-photo", src: p.photo, alt: "", onclick: () => openStory(w, p.id) }) : null,
    h("div", { class: "now-text" }, p ? (p.text || "📷") : "まだ投稿がありません"));
}

/* ---------- ストーリー(写真付きの「いま」。24時間以内のものをアイコンから見る) ---------- */
const STORY_MS = 5000;
const STORY_SEEN_KEY = "couple:storySeen";
function storySeen() { try { return JSON.parse(localStorage.getItem(STORY_SEEN_KEY) || "{}"); } catch { return {}; } }
function storiesOf(w) {
  const since = Date.now() - 24 * 3600 * 1000;
  return state.posts.filter((p) => p.addedBy === w && p.photo && (p.createdAt || 0) > since)
    .sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
}
// ストーリーがあるアイコンは色の輪で囲む(見たら灰色)
function storyAvatar(w, size) {
  const list = storiesOf(w);
  const seen = storySeen()[w] || 0;
  const cls = !list.length ? "" : list.some((p) => (p.createdAt || 0) > seen) ? "has" : "seen";
  return h("button", { type: "button", class: `avatar-ring ${cls}`, "aria-label": `${nameOf(w)}のストーリー`,
    onclick: (ev) => { ev.stopPropagation(); if (list.length) openStory(w); else toast("24時間以内の写真はありません"); } }, avatar(w, size));
}
const story = { w: null, list: [], i: 0, timer: null };
function openStory(w, startId) {
  const list = storiesOf(w);
  if (!list.length) { const p = state.posts.find((x) => x.id === startId); if (p) openPostPhoto(p); return; }
  const seen = storySeen()[w] || 0;
  let i = startId ? list.findIndex((p) => p.id === startId) : list.findIndex((p) => (p.createdAt || 0) > seen);
  if (i < 0) i = 0;
  Object.assign(story, { w, list, i });
  $("#story").hidden = false;
  showStory();
}
function showStory() {
  clearTimeout(story.timer);
  const p = story.list[story.i];
  if (!p) { closeStory(); return; }
  $("#storyImg").src = p.photo;
  $("#storyText").textContent = p.text || "";
  $("#storyHead").replaceChildren(avatar(story.w, "sm"), h("b", {}, nameOf(story.w)), h("span", {}, timeAgo(p.createdAt)));
  $("#storyBars").replaceChildren(...story.list.map((_, k) => h("span", { class: k < story.i ? "done" : "" }, h("i"))));
  const bar = $("#storyBars").children[story.i].firstChild;
  requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = `width ${STORY_MS}ms linear`; bar.style.width = "100%"; }));
  // 見たところまで覚えておく
  const seen = storySeen();
  if ((p.createdAt || 0) > (seen[story.w] || 0)) { seen[story.w] = p.createdAt; try { localStorage.setItem(STORY_SEEN_KEY, JSON.stringify(seen)); } catch {} }
  story.timer = setTimeout(() => { story.i++; showStory(); }, STORY_MS);
}
function closeStory() {
  clearTimeout(story.timer);
  $("#story").hidden = true;
  renderNow();
}
$("#storyNext").addEventListener("click", () => { story.i++; showStory(); });
$("#storyPrev").addEventListener("click", () => { story.i = Math.max(0, story.i - 1); showStory(); });
$("#storyClose").addEventListener("click", closeStory);
// 下にスワイプでも閉じる
let storyTouch = null;
$("#story").addEventListener("touchstart", (ev) => { storyTouch = ev.touches[0].clientY; }, { passive: true });
$("#story").addEventListener("touchend", (ev) => {
  if (storyTouch != null && ev.changedTouches[0].clientY - storyTouch > 90) closeStory();
  storyTouch = null;
}, { passive: true });

/* ---------- ふたりの質問箱 ---------- */
const ASK_IDEAS = [
  "最近いちばん嬉しかったことは?", "次のデートでしたいことは?", "私の好きなところを3つ教えて",
  "行ってみたい旅行先は?", "付き合う前の第一印象は?", "今いちばん食べたいものは?",
  "10年後どんな暮らしをしていたい?", "私にしてほしいことはある?", "最近ハマってることは?",
  "二人でやってみたいことは?", "生まれ変わったら何になりたい?", "子どものころの夢は?",
];
const questionsToMe = () => (state.device ? state.questions.filter((q) => q.to === me() && !q.answer) : []);

function renderQuestions() {
  if (!state.device) return;
  const inbox = questionsToMe().sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
  $("#qInbox").replaceChildren(...inbox.map((q) => {
    const ta = h("textarea", { rows: "2", maxlength: "300", placeholder: "答えを書いてね" });
    return h("div", { class: "q to-me" },
      h("div", { class: "q-head" }, avatar(q.addedBy, "sm"), `💌 ${nameOf(q.addedBy)}から質問が届いています`, h("span", { class: "grow" }), timeAgo(q.createdAt)),
      h("div", { class: "q-text" }, q.text),
      ta,
      h("div", { class: "actions" }, h("span", { class: "grow" }),
        h("button", { type: "button", class: "primary small", onclick: () => {
          const answer = ta.value.trim();
          if (!answer) { toast("答えを書いてね"); return; }
          state.store.save(room(), "questions", q.id, { answer, answeredAt: Date.now() });
          toast("答えを送りました 💌");
        } }, "答える")));
  }));
  const rest = state.questions.filter((q) => !(q.to === me() && !q.answer))
    .sort((x, y) => (y.answeredAt || y.createdAt || 0) - (x.answeredAt || x.createdAt || 0));
  const items = rest.slice(0, 30).map((q) => h("div", { class: "q" },
    h("div", { class: "q-head" }, `${nameOf(q.addedBy)} → ${nameOf(q.to)}`, h("span", { class: "grow" }),
      q.answer ? timeAgo(q.answeredAt || q.createdAt) : h("span", {}, "返事待ち…"),
      mine(q) ? h("button", { type: "button", class: "small ghost", onclick: () => softDelete("questions", q) }, "削除") : null),
    h("div", { class: "q-text" }, `Q. ${q.text}`),
    q.answer ? h("div", { class: "q-ans" }, h("b", {}, `${nameOf(q.to)}の答え`), q.answer) : null));
  if (!inbox.length && !items.length) items.push(h("p", { class: "muted empty" }, "相手に聞いてみたいことを質問してみよう"));
  $("#qList").replaceChildren(...items);
  // 予定タブの上のお知らせ
  const n = inbox.length;
  $("#questionNotice").hidden = !n;
  if (n) $("#questionNotice").textContent = `💌 ${nameOf(partner())}から質問が${n}件届いています`;
  renderBadges();
}
$("#questionNotice").addEventListener("click", () => { show("now"); setTimeout(() => $("#qbox").scrollIntoView({ behavior: "smooth", block: "start" }), 50); });
$("#btnAsk").addEventListener("click", () => {
  const f = $("#askForm");
  f.reset();
  $("#askTitle").textContent = `${nameOf(partner())}に質問する`;
  $("#askIdeas").replaceChildren(...ASK_IDEAS.map((q) => h("button", { type: "button", class: "chip", onclick: () => { f.text.value = q; } }, q)));
  $("#askDialog").showModal();
});
$("#askForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const text = ev.target.text.value.trim();
  if (!text) return;
  state.store.save(room(), "questions", null, { text, addedBy: me(), to: partner(), answer: "" });
  $("#askDialog").close();
  toast(`${nameOf(partner())}に質問を送りました`);
});

/* ---------- 共有アルバム(LINE のアルバムのように二人で写真を入れる) ---------- */
let albumTab = "albums";
let openAlbumId = null;
const albumPhotos = (id) => state.photos.filter((x) => x.albumId === id).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
function renderAlbums() {
  if (!state.device) return;
  $$("#albumSeg button").forEach((b) => b.classList.toggle("on", b.dataset.tab === albumTab));
  $("#albumsPane").hidden = albumTab !== "albums";
  $("#visitedPane").hidden = albumTab !== "visited";
  const list = state.albums.slice().sort((x, y) => {
    const lx = albumPhotos(x.id).at(-1), ly = albumPhotos(y.id).at(-1);
    return ((ly && ly.createdAt) || y.createdAt || 0) - ((lx && lx.createdAt) || x.createdAt || 0);
  });
  const items = list.map((a) => {
    const ph = albumPhotos(a.id);
    const fresh = ph.some((x) => isNew(x, "album")) || isNew(a, "album");
    return h("li", { class: "album-item", onclick: () => openAlbum(a.id) },
      ph.length ? h("img", { src: ph[ph.length - 1].data, alt: "", loading: "lazy" }) : h("div", { class: "noimg" }, "📚"),
      h("div", { class: "album-body" },
        h("div", { class: "t" }, a.title, fresh ? h("span", { class: "new" }, "NEW") : null),
        h("div", { class: "s" }, `📷 ${ph.length}枚 · ${nameOf(a.addedBy)}が作成`)));
  });
  if (!items.length) items.push(h("li", { class: "empty" }, "「＋ アルバム」から作って、二人で写真を入れていこう"));
  $("#albumsList").replaceChildren(...items);
  if (openAlbumId) renderAlbumDialog();
}
$$("#albumSeg button").forEach((b) => b.addEventListener("click", () => { albumTab = b.dataset.tab; renderAlbums(); }));
$("#btnNewAlbum").addEventListener("click", async () => {
  const title = (prompt("アルバムの名前", "") || "").trim();
  if (!title) return;
  const id = await state.store.save(room(), "albums", null, { title: title.slice(0, 40), addedBy: me() });
  toast("アルバムを作りました");
  openAlbum(id);
});
function openAlbum(id) {
  openAlbumId = id;
  renderAlbumDialog();
  if (!$("#albumDialog").open) $("#albumDialog").showModal();
}
$("#albumDialog").addEventListener("close", () => { openAlbumId = null; });
function renderAlbumDialog() {
  const a = state.albums.find((x) => x.id === openAlbumId);
  if (!a) { $("#albumTitle").textContent = "アルバム"; $("#albumGrid").replaceChildren(); return; }
  const ph = albumPhotos(a.id);
  $("#albumTitle").textContent = a.title;
  $("#albumInfo").textContent = `📷 ${ph.length}枚 · ${nameOf(a.addedBy)}が作成 · 二人とも写真を追加できます`;
  $("#albumGrid").replaceChildren(...ph.map((x) =>
    h("button", { type: "button", class: "photo", onclick: () => openPhoto(x) }, h("img", { src: x.data, alt: "", loading: "lazy" }), newBadge(x, "album"))));
  if (!ph.length) $("#albumGrid").replaceChildren(h("p", { class: "muted" }, "まだ写真はありません。「＋ 写真を追加」から入れてね"));
}
$("#albumPhotoInput").addEventListener("change", async (ev) => {
  const files = [...ev.target.files];
  ev.target.value = "";
  const albumId = openAlbumId;
  if (!files.length || !albumId) return;
  let ok = 0;
  for (const [i, file] of files.entries()) {
    $("#albumMsg").textContent = `保存しています… (${i + 1}/${files.length})`;
    try {
      const data = await compress(file, 1600, 600000);
      await state.store.save(room(), "photos", null, { albumId, data, addedBy: me() });
      ok++;
    } catch (e) { console.error(e); }
  }
  $("#albumMsg").textContent = ok === files.length ? "" : `${files.length - ok}枚は保存できませんでした`;
  if (ok) toast(`写真を${ok}枚追加しました`);
});
$("#btnAlbumMenu").addEventListener("click", async () => {
  const a = state.albums.find((x) => x.id === openAlbumId);
  if (!a) return;
  if (!mine(a)) { toast(`${nameOf(a.addedBy)}が作ったアルバムです(名前の変更・削除は作った人だけ)`); return; }
  const title = prompt("アルバムの名前を変える(空にして OK を押すと削除)", a.title);
  if (title == null) return;
  if (title.trim()) {
    state.store.save(room(), "albums", a.id, { title: title.trim().slice(0, 40) });
    toast("名前を変えました");
    return;
  }
  const ph = albumPhotos(a.id);
  if (ph.some((x) => !mine(x))) { toast(`${nameOf(partner())}の写真が入っているので削除できません`); return; }
  // アルバムと中の写真をまとめてゴミ箱へ(戻すときも一緒に戻る)
  if (softDelete("albums", a, ph.map((x) => ["photos", x]))) $("#albumDialog").close();
});

function renderNow() {
  if (!state.device) return;
  $("#nowCards").replaceChildren(nowCard(partner()), nowCard(me()));
  $("#quickChips").replaceChildren(...QUICK.map((q) =>
    h("button", { type: "button", class: "chip", onclick: () => { $("#postText").value = q; $("#postText").focus(); } }, q)));
  const list = state.posts.slice().sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
  const items = list.map((p) => h("li", { class: `post ${p.addedBy}` },
    storyAvatar(p.addedBy, "sm"),
    h("div", { class: "post-body" },
      h("div", { class: "post-head" }, h("b", {}, nameOf(p.addedBy)), h("span", { class: "muted" }, timeAgo(p.createdAt)), newBadge(p, "now"),
        h("span", { class: "grow" }),
        mine(p) ? h("button", { class: "small ghost", onclick: () => softDelete("posts", p) }, "削除") : null),
      p.text ? h("div", { class: "post-text" }, p.text) : null,
      p.photo ? h("img", { class: "post-photo", src: p.photo, alt: "", loading: "lazy", onclick: () => openStory(p.addedBy, p.id) }) : null)));
  if (!items.length) items.push(h("li", { class: "empty" }, "「いま何してる?」を写真や文字で送ってみよう"));
  $("#postList").replaceChildren(...items);
  renderBadges();
}

function openPostPhoto(p) {
  viewingPhoto = null;
  $("#photoBig").src = p.photo;
  $("#btnDeletePhoto").hidden = true;
  $("#btnSavePhoto").href = p.photo;
  $("#photoCaption").textContent = `${nameOf(p.addedBy)} · ${timeAgo(p.createdAt)}`;
  $("#photoDialog").showModal();
}

let postPhoto = null;
$("#postPhotoInput").addEventListener("change", async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = "";
  if (!file) return;
  try {
    postPhoto = await compress(file);
    $("#postPreview").replaceChildren(h("img", { src: postPhoto, alt: "" }),
      h("button", { type: "button", class: "small ghost", onclick: () => { postPhoto = null; $("#postPreview").replaceChildren(); } }, "写真をやめる"));
  } catch (e) {
    console.error(e);
    toast("写真を読み込めませんでした");
  }
});
$("#postForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const text = $("#postText").value.trim();
  if (!text && !postPhoto) { toast("文字か写真を入れてね"); return; }
  const data = { text, addedBy: me() };
  if (postPhoto) data.photo = postPhoto;
  state.store.save(room(), "posts", null, data);
  $("#postText").value = "";
  postPhoto = null;
  $("#postPreview").replaceChildren();
  toast("送りました");
});

/* ---------- 起動画面(ふたりのアイコンとハート) ---------- */
let splashOpen = false;
function renderSplash() {
  if (!splashOpen || !state.device) return;
  const since = allAnniv().filter((a) => a.kind === "since" && a.date <= today).sort((x, y) => x.date.localeCompare(y.date))[0];
  const p = latestPost(partner());
  $("#splashBody").replaceChildren(...[
    h("div", { class: "splash-pair" },
      h("div", { class: "splash-person" }, avatar(me(), "xl"), h("div", {}, nameOf(me()))),
      h("div", { class: "splash-heart" }, "♥"),
      h("div", { class: "splash-person" }, avatar(partner(), "xl"), h("div", {}, nameOf(partner())))),
    since ? h("div", { class: "splash-days" }, "付き合って ", h("b", {}, (daysBetween(since.date, today) + 1).toLocaleString()), " 日目") : null,
    p ? h("div", { class: "splash-now" }, `${nameOf(partner())}のいま: ${p.text || "📷 写真"}(${timeAgo(p.createdAt)})`) : null,
    questionsToMe().length ? h("div", { class: "splash-now splash-q" }, `💌 ${nameOf(partner())}から質問が${questionsToMe().length}件届いています`) : null,
    h("div", { class: "splash-tap" }, "タップしてはじめる")].filter(Boolean));
}
function openSplash() {
  splashOpen = true;
  $("#splash").hidden = false;
  renderSplash();
}
$("#splash").addEventListener("click", () => {
  if (!splashOpen) return;
  splashOpen = false;
  // ハートが画面いっぱいに広がって、そのまま今の画面へ
  heartBurst(() => {
    $("#splash").hidden = true;
    if (!maybeStartTutorial()) showPendingOverlay();
  });
});

/* ---------- ハートが画面いっぱいに広がる演出 ---------- */
const HEARTS = ["♥", "💗", "💕", "💖", "♥", "💞"];
const HEART_COLORS = ["#f06a8a", "#ff8fab", "#ff5c8a", "#ffb3c6", "#e63e6d"];
function heartBurst(atPeak) {
  const box = h("div", { class: "burst" }, h("div", { class: "big" }, "♥"));
  const w = innerWidth, ht = innerHeight;
  const n = Math.min(170, Math.round((w * ht) / 2200));
  for (let i = 0; i < n; i++) {
    const size = 22 + Math.random() * 56;
    const el = h("span", { class: "h" }, HEARTS[i % HEARTS.length]);
    el.style.cssText = [
      `left:${Math.random() * w}px`, `top:${ht * 0.35 + Math.random() * ht * 0.75}px`,
      `font-size:${size}px`, `color:${HEART_COLORS[i % HEART_COLORS.length]}`,
      `--dx:${(Math.random() - 0.5) * 120}px`, `--dy:${-(ht * 0.3 + Math.random() * ht * 0.6)}px`,
      `--rot:${(Math.random() - 0.5) * 60}deg`, `--d:${0.9 + Math.random() * 0.6}s`, `--delay:${Math.random() * 0.35}s`,
    ].join(";");
    box.append(el);
  }
  document.body.append(box);
  try { navigator.vibrate && navigator.vibrate(30); } catch {}
  // 画面がハートで埋まったころに下を切り替え、ハートを消していく
  setTimeout(() => { if (atPeak) atPeak(); box.classList.add("fade"); }, 1000);
  setTimeout(() => box.remove(), 1600);
}

/* ---------- ごめんね(ケンカしたとき) ---------- */
const SORRY_IDEAS = ["さっきはごめんね", "言いすぎた、ごめん", "ちゃんと話したいな", "大好きだよ、仲直りしよ", "落ち着いたら電話していい?"];
const SORRY_SEEN_KEY = "couple:sorrySeen";
function sorrySeen() { try { return JSON.parse(localStorage.getItem(SORRY_SEEN_KEY) || "{}"); } catch { return {}; } }
function markSorrySeen(id) { const s = sorrySeen(); s[id] = Date.now(); try { localStorage.setItem(SORRY_SEEN_KEY, JSON.stringify(s)); } catch {} }
const laterThisTime = new Set(); // 「あとで」を押したもの(次に開いたらまた出す)
const sorryToMe = () => (state.device ? state.apologies.filter((x) => x.to === me() && !x.reply && !laterThisTime.has(x.id)) : []);
// 自分が送ったごめんねに、まだ見ていない返事が来ているか
const sorryReplies = () => (state.device ? state.apologies.filter((x) => x.addedBy === me() && x.reply && !sorrySeen()[x.id + ":" + x.reply]) : []);

function renderSorry() {
  if (!state.device) return;
  const mineLatest = state.apologies.filter((x) => x.addedBy === me()).sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0))[0];
  const st = $("#sorryStatus");
  if (mineLatest && !mineLatest.reply) st.textContent = `ごめんねを送りました(${timeAgo(mineLatest.createdAt)})。返事を待っています…`;
  else if (mineLatest && mineLatest.reply === "ok" && Date.now() - (mineLatest.repliedAt || 0) < 86400000) st.textContent = "💞 仲直りしました";
  else if (mineLatest && mineLatest.reply === "wait" && Date.now() - (mineLatest.repliedAt || 0) < 86400000) st.textContent = `${nameOf(partner())}はもう少し時間がほしいみたい。そっと待とう`;
  else st.textContent = "言いにくいときは、ボタンでごめんねを送ろう";
  showPendingOverlay();
}

function openOverlay(children) {
  $("#overlayBox").replaceChildren(...children.filter(Boolean));
  $("#overlay").hidden = false;
}
function closeOverlay() { $("#overlay").hidden = true; }

// 届いているごめんね・返事を、全画面で知らせる(起動画面の後に)
function showPendingOverlay() {
  if (!state.device || splashOpen || !$("#overlay").hidden || tutorial.phase) return;
  const got = sorryToMe().sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0))[0];
  if (got) {
    const answer = (reply) => {
      state.store.save(room(), "apologies", got.id, { reply, repliedAt: Date.now() });
      closeOverlay();
      if (reply === "ok") heartBurst(() => toast("仲直り 💞"));
      else toast("「もう少し待って」と伝えました");
    };
    openOverlay([
      h("div", { class: "overlay-emoji" }, "🙏"),
      h("div", { class: "overlay-title" }, `${nameOf(got.addedBy)}からごめんねが届いています`),
      got.text ? h("div", { class: "overlay-msg" }, got.text) : null,
      h("div", { class: "muted" }, timeAgo(got.createdAt)),
      h("div", { class: "overlay-btns" },
        h("button", { type: "button", class: "love", onclick: () => answer("ok") }, "いいよ 💗 仲直りしよ"),
        h("button", { type: "button", onclick: () => answer("wait") }, "もう少し時間がほしい"),
        h("button", { type: "button", class: "ghost", onclick: () => { laterThisTime.add(got.id); closeOverlay(); } }, "あとで")),
    ]);
    return;
  }
  const rep = sorryReplies()[0];
  if (rep) {
    markSorrySeen(rep.id + ":" + rep.reply);
    if (rep.reply === "ok") {
      heartBurst();
      setTimeout(() => openOverlay([
        h("div", { class: "overlay-emoji" }, "💞"),
        h("div", { class: "overlay-title" }, "仲直り成立!"),
        h("div", { class: "muted" }, `${nameOf(partner())}が「いいよ」って言ってくれました`),
        h("div", { class: "overlay-btns" }, h("button", { type: "button", class: "love", onclick: closeOverlay }, "よかった"))]), 900);
    } else {
      openOverlay([
        h("div", { class: "overlay-emoji" }, "⏳"),
        h("div", { class: "overlay-title" }, `${nameOf(partner())}はもう少し時間がほしいみたい`),
        h("div", { class: "muted" }, "ごめんねはちゃんと届いています。落ち着くまでそっと待とう"),
        h("div", { class: "overlay-btns" }, h("button", { type: "button", onclick: closeOverlay }, "わかった"))]);
    }
  }
}

$("#btnSorry").addEventListener("click", () => {
  const f = $("#sorryForm");
  f.reset();
  $("#sorryTitle").textContent = `🙏 ${nameOf(partner())}にごめんねを送る`;
  $("#sorryIdeas").replaceChildren(...SORRY_IDEAS.map((t) => h("button", { type: "button", class: "chip", onclick: () => { f.text.value = t; } }, t)));
  $("#sorryDialog").showModal();
});
$("#sorryForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const text = ev.target.text.value.trim() || "ごめんね";
  state.store.save(room(), "apologies", null, { text, addedBy: me(), to: partner(), reply: "" });
  $("#sorryDialog").close();
  toast(`${nameOf(partner())}にごめんねを送りました`);
});

/* ---------- チュートリアル(この版から、端末ごとに1回だけ) ----------
   1. まず自分のプロフィールを書いてもらう(保存するまで進めない)
   2. 画面の一部を照らしながら、各タブの使い方を説明する */
const TUTORIAL_KEY = "couple:tutorial";
const TUTORIAL_VERSION = "1"; // ここを上げると、全員がもう一度チュートリアルを受ける
const tutorial = { phase: null, i: 0 };
function tutorialDone() { try { return localStorage.getItem(TUTORIAL_KEY) === TUTORIAL_VERSION; } catch { return true; } }
function finishTutorial(burst) {
  try { localStorage.setItem(TUTORIAL_KEY, TUTORIAL_VERSION); } catch {}
  tutorial.phase = null;
  $("#coach").hidden = true;
  show("calendar");
  if (burst) heartBurst(() => toast("たのしんでね 💞"));
  setTimeout(showPendingOverlay, burst ? 1700 : 300);
}

// 起動画面のあと・ペアに入った直後に呼ぶ。始めたら true
function maybeStartTutorial() {
  if (!state.device || tutorial.phase || tutorialDone() || splashOpen) return false;
  tutorial.phase = "welcome";
  showWelcome();
  return true;
}

function coachSkipButton() {
  return h("button", { type: "button", class: "ghost small", onclick: () => {
    if (confirm("使い方の説明をスキップしますか?(もう表示されません)")) finishTutorial(false);
  } }, "スキップ");
}

function showWelcome() {
  $("#coach").hidden = false;
  $("#coachHole").className = "coach-hole none";
  const b = $("#coachBubble");
  b.style.top = "22%";
  b.replaceChildren(h("div", { class: "coach-welcome" },
    h("div", { class: "overlay-emoji" }, "💞"),
    // 名前は最初の画面で本人が入れたもの。まだ読み込めていなければ名前なしで呼ぶ
    h("div", { class: "coach-title" }, state.names[me()] ? `ようこそ、${state.names[me()]}さん!` : "ようこそ!"),
    h("div", { class: "coach-text" }, "ふたりの予定帳へようこそ。\nまずは、あなたのプロフィールを書いてね。\nアイコン写真・自分の色・誕生日などを入れると、相手にも見えるようになります。"),
    h("div", { class: "actions" },
      h("span", { class: "grow" }),
      h("button", { type: "button", class: "primary", onclick: () => {
        tutorial.phase = "profile";
        $("#coach").hidden = true;
        show("couple");
        openProfile(me());
      } }, "プロフィールを書く"))));
}

// 説明の順番。view: 開くタブ / target: 照らす場所 / when: 出す条件
const COACH_STEPS = [
  { view: "settings", target: () => $("#pairCode").closest(".code-box"), when: () => !(state.members && state.members[partner()]),
    title: "📮 まずは相手を招待", text: "このペアコードを LINE などで相手に送ってね。\n相手がアプリでコードを入れると、二人の予定帳がつながります。" },
  { view: "calendar", target: () => $("#grid"), title: "📅 カレンダー",
    text: "日付をタップすると、その日の予定が見られます。\n点の色は「だれの予定か」(自分・相手・ふたり)です。\n左右にスワイプすると月が変わります。" },
  { view: "calendar", target: () => $("#btnAddEvent"), title: "＋ 予定を追加",
    text: "ここから予定を入れられます。\n旅行など何日か続く予定は「終わりの日」も入れてね。" },
  { view: "calendar", target: () => $("#places .sec-head"), title: "📍 行きたい所",
    text: "カレンダーの下は「行きたい所リスト」。\n♡ で「私も行きたい」、「🎲 どこ行く?」で行き先をルーレットで決められます。\n✓ を押すと「行った場所」として思い出に残ります。" },
  { view: "now", target: () => $("#postForm"), title: "💬 いま",
    text: "「いま何してる?」を写真や文字で送れます。\n写真を送ると24時間だけアイコンに輪が付いて、ストーリーのように見られます。" },
  { view: "now", target: () => $("#qbox"), title: "💌 ふたりの質問箱",
    text: "相手に聞いてみたいことを質問できます。\n質問が届くと、お知らせが出ます。" },
  { view: "now", target: () => $(".sorry-card"), title: "🙏 ごめんねボタン",
    text: "ケンカしちゃったときは、ここからごめんねを送れます。\n相手は「いいよ 💗」で返事できます。" },
  { view: "album", target: () => $("#albumSeg"), title: "📷 思い出",
    text: "二人で写真を入れられる「アルバム」と、\n「行った場所」の写真や感想がここに並びます。" },
  { view: "couple", target: () => $("#compat"), title: "💞 ふたり",
    text: "二人のプロフィールと相性診断です。\n相手のプロフィールが入ると、相性や「ふたりのトリセツ」が見られます。" },
  { view: "settings", target: () => $("#recoveryCode").closest(".code-box"), title: "🔑 復元コード(大事!)",
    text: "機種変更やアプリを消したときに、元に戻るためのコードです。\nスクショやメモで、あなただけが見られる所に保存しておいてね。" },
  { view: "settings", target: () => $("#themeList").closest(".card"), title: "🎨 設定",
    text: "画面の色・記念日・ゴミ箱などはここから。\n削除したものは3日間、ゴミ箱から戻せます。" },
  { view: null, target: null, title: "準備完了!",
    text: "下のボタンか、画面を左右にスワイプしてタブを移動できます。\nふたりの予定帳、たのしんでね 💞" },
];
const activeSteps = () => COACH_STEPS.filter((s) => !s.when || s.when());

function showCoachStep() {
  const steps = activeSteps();
  const s = steps[tutorial.i];
  if (!s) { finishTutorial(true); return; }
  $("#coach").hidden = false;
  if (s.view) show(s.view);
  const el = s.target && s.target();
  // 照らす所を画面の上のほうに出して、下に吹き出しの場所を空ける
  if (el) window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 90));
  // スクロールが終わってから照らす位置を決める
  setTimeout(() => placeCoach(el, s, steps), 250);
}

function placeCoach(el, s, steps) {
  const hole = $("#coachHole");
  const b = $("#coachBubble");
  const last = tutorial.i === steps.length - 1;
  b.replaceChildren(
    h("div", { class: "coach-step" }, `使い方 ${tutorial.i + 1} / ${steps.length}`),
    h("div", { class: "coach-title" }, s.title),
    h("div", { class: "coach-text" }, s.text),
    h("div", { class: "coach-dots" }, ...steps.map((_, k) => h("i", { class: k === tutorial.i ? "on" : "" }))),
    h("div", { class: "actions" },
      last ? null : coachSkipButton(),
      h("span", { class: "grow" }),
      tutorial.i > 0 ? h("button", { type: "button", class: "small", onclick: () => { tutorial.i--; showCoachStep(); } }, "戻る") : null,
      h("button", { type: "button", class: "primary", onclick: () => { tutorial.i++; showCoachStep(); } }, last ? "はじめる 💞" : "次へ")));
  if (!el) {
    hole.className = "coach-hole none";
    b.style.top = "28%";
    return;
  }
  const r = el.getBoundingClientRect();
  const pad = 6;
  hole.className = "coach-hole";
  Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  // 吹き出しは、照らした所の下 → 入らなければ上 → それも無理なら画面の下のほうに出す
  const bh = b.offsetHeight || 200;
  const bottomLimit = innerHeight - 80;
  let top;
  if (r.bottom + 14 + bh <= bottomLimit) top = r.bottom + 14;
  else if (r.top - 14 - bh >= 12) top = r.top - 14 - bh;
  else top = Math.max(12, bottomLimit - bh);
  b.style.top = `${top}px`;
}
addEventListener("resize", () => { if (tutorial.phase === "tour") showCoachStep(); });
// プロフィールはチュートリアル中は閉じられない
$("#profileDialog").addEventListener("cancel", (ev) => { if (tutorial.phase === "profile") ev.preventDefault(); });

/* ---------- 起動 ---------- */
function rerender() {
  renderCalendar();
  renderPlaces();
  renderAlbum();
  renderAlbums();
  renderCouple();
  renderNow();
  renderQuestions();
  renderSplash();
  if (!$("#settings").hidden) renderSettings();
}

function start() {
  state.unsub.forEach((u) => u());
  if (!state.device.lastSeen) { state.device.lastSeen = Date.now(); saveDevice(state.device); }
  const r = room();
  state.unsub = [
    state.store.watchRoom(r, (x) => { state.names = { a: "", b: "", ...(x.names || {}) }; state.members = x.members || {}; rerender(); }),
    state.store.watch(r, "places", (list) => {
      state.places = splitTrash("places", list);
      renderPlaces(); renderCalendar(); renderAlbum();
      const p = memoryPlaceId && list.find((x) => x.id === memoryPlaceId);
      if (p) renderPartnerReview(p);
    }),
    state.store.watch(r, "events", (list) => { state.events = splitTrash("events", list); renderCalendar(); renderPlaces(); }),
    state.store.watch(r, "anniv", (list) => { state.anniv = splitTrash("anniv", list); renderCalendar(); if (!$("#settings").hidden) renderAnnivList(); }),
    state.store.watch(r, "photos", (list) => { state.photos = splitTrash("photos", list); renderAlbum(); renderAlbums(); renderMemoryPhotos(); }),
    state.store.watch(r, "albums", (list) => { state.albums = splitTrash("albums", list); renderAlbums(); }),
    state.store.watch(r, "questions", (list) => { state.questions = splitTrash("questions", list); renderQuestions(); renderSplash(); }),
    state.store.watch(r, "apologies", (list) => { state.apologies = list; renderSorry(); }, { limit: 20 }),
    state.store.watch(r, "profiles", (list) => {
      state.profiles = { a: {}, b: {} };
      for (const x of list) if (x.id === "a" || x.id === "b") state.profiles[x.id] = x;
      applyColors();
      renderCouple(); renderCalendar(); renderNow(); renderSplash();
      if (!$("#settings").hidden) renderAnnivList();
    }),
    state.store.watch(r, "posts", (list) => { state.posts = splitTrash("posts", list); renderNow(); renderSplash(); }, { limit: 60 }),
  ];
}

$$("#tabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));

function moveMonth(step, slide = true) {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + step, 1);
  renderCalendar();
  if (slide) slideIn($("#grid"), step);
}
$("#prevMonth").addEventListener("click", () => moveMonth(-1));
$("#nextMonth").addEventListener("click", () => moveMonth(1));

/* ---------- スワイプ(指に合わせて画面が動く) ----------
   カレンダーの日付の部分 → 月を変える
   それ以外の場所 → となりのタブへ */
const TAB_ORDER = ["calendar", "now", "album", "couple", "settings"];
const EASE = "transform .26s cubic-bezier(.2,.8,.2,1)";
function setX(el, x, animated) {
  el.style.transition = animated ? EASE : "none";
  el.style.transform = x ? `translateX(${x}px)` : "";
}
function after(ms, fn) { setTimeout(fn, ms); }
// ボタンで月を変えたときの、横からすべり込む動き
function slideIn(el, step) {
  const w = el.parentElement.clientWidth;
  setX(el, step * w * 0.35, false);
  el.style.opacity = "0.4";
  void el.offsetWidth; // 位置を確定させてから戻す
  el.style.transition = EASE + ", opacity .26s";
  el.style.transform = "";
  el.style.opacity = "";
  after(300, () => { el.style.cssText = ""; });
}

let drag = null;
function clearPeek() {
  if (!drag) return;
  if (drag.peek) { drag.peek.classList.remove("peek", "dragging"); drag.peek.style.cssText = ""; drag.peek.hidden = true; drag.peek = null; }
}
document.addEventListener("touchstart", (ev) => {
  drag = null;
  if (ev.touches.length !== 1 || !state.device || !TAB_ORDER.includes(currentView)) return;
  if (document.querySelector("dialog[open]") || !$("#splash").hidden || !$("#story").hidden || !$("#overlay").hidden || !$("#coach").hidden) return;
  const target = ev.target;
  // 横にスクロールする部分や入力欄では反応させない
  if (target.closest(".countdowns, .chips, input, textarea, select, .tabs")) return;
  const t = ev.touches[0];
  drag = {
    x: t.clientX, y: t.clientY, at: Date.now(), dx: 0, lock: null,
    mode: currentView === "calendar" && target.closest(".grid-wrap, .cal-head, .weekdays, .legend") ? "month" : "tab",
    w: $("#views").clientWidth, peek: null, dir: 0,
  };
}, { passive: true });

document.addEventListener("touchmove", (ev) => {
  if (!drag) return;
  const t = ev.touches[0];
  const dx = t.clientX - drag.x;
  const dy = t.clientY - drag.y;
  if (!drag.lock) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    drag.lock = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
  }
  if (drag.lock !== "x") return;
  ev.preventDefault(); // 横に動かしている間は縦にスクロールしない
  drag.dx = dx;
  if (drag.mode === "month") {
    $("#grid").classList.add("dragging");
    setX($("#grid"), dx, false);
    return;
  }
  const cur = $("#" + currentView);
  const dir = dx < 0 ? 1 : -1;
  const name = TAB_ORDER[TAB_ORDER.indexOf(currentView) + dir];
  if (dir !== drag.dir) {
    clearPeek();
    drag.dir = dir;
    if (name) {
      const nb = $("#" + name);
      // となりの画面を、今見えている高さに並べて出す
      const top = Math.max(0, window.scrollY - $("#views").offsetTop);
      nb.hidden = false;
      nb.classList.add("peek", "dragging");
      nb.style.top = top + "px";
      drag.peek = nb;
      if (name === "now") renderNow();
    }
  }
  cur.classList.add("dragging");
  // 端の先にはもう画面がないので、重く動かす
  const x = name ? dx : dx * 0.25;
  setX(cur, x, false);
  if (drag.peek) setX(drag.peek, x + dir * drag.w, false);
}, { passive: false });

document.addEventListener("touchend", () => {
  if (!drag || drag.lock !== "x") { drag = null; return; }
  const d = drag;
  const v = d.dx / Math.max(1, Date.now() - d.at); // 速さ(px/ms)
  const go = Math.abs(d.dx) > d.w * 0.3 || (Math.abs(d.dx) > 40 && Math.abs(v) > 0.45);
  const dir = d.dx < 0 ? 1 : -1;

  if (d.mode === "month") {
    const grid = $("#grid");
    if (!go) { setX(grid, 0, true); after(300, () => { grid.classList.remove("dragging"); grid.style.cssText = ""; }); drag = null; return; }
    setX(grid, -dir * d.w, true);
    after(240, () => {
      moveMonth(dir, false);
      setX(grid, dir * d.w, false);
      void grid.offsetWidth; // 位置を確定させてから戻す
      setX(grid, 0, true);
      after(300, () => { grid.classList.remove("dragging"); grid.style.cssText = ""; });
    });
    drag = null;
    return;
  }

  const cur = $("#" + currentView);
  const nb = d.peek;
  if (!go || !nb) {
    setX(cur, 0, true);
    if (nb) setX(nb, dir * d.w, true);
    after(280, () => { cur.classList.remove("dragging"); cur.style.cssText = ""; clearPeek(); drag = null; });
    return;
  }
  setX(cur, -dir * d.w, true);
  setX(nb, 0, true);
  after(270, () => {
    const name = nb.id;
    cur.classList.remove("dragging");
    cur.style.cssText = "";
    nb.classList.remove("peek", "dragging");
    nb.style.cssText = "";
    drag = null;
    show(name);
  });
}, { passive: true });
document.addEventListener("touchcancel", () => {
  if (!drag) return;
  const cur = currentView && $("#" + currentView);
  if (cur) { cur.style.cssText = ""; cur.classList.remove("dragging"); }
  $("#grid").style.cssText = "";
  clearPeek();
  drag = null;
});
$("#btnAddEvent").addEventListener("click", () => openEvent({ date: state.selected }));
$("#btnAddPlace").addEventListener("click", () => openPlace());
$$("#placeSeg button").forEach((b) => b.addEventListener("click", () => { state.filter = b.dataset.filter; renderPlaces(); }));
$("#placeSort").addEventListener("change", (ev) => { state.sort = ev.target.value; renderPlaces(); });

(async function boot() {
  const join = new URLSearchParams(location.search).get("join");
  if (join) $("#setupCode").value = join;
  try {
    state.store = await createStore();
  } catch (e) {
    console.error(e);
    document.body.prepend(h("p", { class: "error", style: "padding:16px" }, "データの置き場所につながりませんでした。電波を確かめて、開き直してください。"));
    return;
  }
  $("#mode").textContent = state.store.shared ? "" : "お試しモード(この端末だけに保存)";
  if (state.device && state.device.room) {
    let status = "ok";
    try {
      status = await ensureMembership();
    } catch (e) {
      console.warn("登録の確認ができませんでした(電波がない?)", e); // 端末の保存分で開く
    }
    if (status === "ok") {
      openSplash();
      start();
      show("calendar");
    } else {
      $("#recoverPair").value = state.device.room;
      if (state.device.recovery) $("#recoverCode").value = state.device.recovery;
      if (status === "removed") $("#setupCode").value = state.device.room;
      showSetupMessage(status === "taken"
        ? "この端末は、ペアにまだ登録されていません。下の「復元コードで戻る」に復元コードを入れてください。"
        : status === "removed"
          ? "この端末の登録は、パートナーによって外されました。使い続けるときは、名前を入れて「コードで参加する」を押してください。"
          : "ペアが見つかりませんでした。もう一度ペアを作るか、参加してください。");
      state.device = null;
      saveDevice(null);
    }
  } else show("setup");

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn(e));
  }
})();
