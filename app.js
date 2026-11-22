import { createStore } from "./store.js";

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

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2200);
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

/* ---------- 「相手が追加した新しいもの」 ----------
   タブ(カレンダー/行きたい所/思い出)ごとに「最後に見た時刻」を覚えておき、
   それより後に相手が追加したものに NEW を付ける。タブを離れた時に「見た」ことにする。 */
const CATS = ["calendar", "places", "album"];
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
    calendar: state.events.filter((x) => unseen(x, "calendar")).length,
    places: state.places.filter((p) => !p.done && unseen(p, "places")).length,
    album: state.photos.filter((x) => unseen(x, "album")).length,
  };
  $$("[data-badge]").forEach((b) => {
    const n = b.dataset.badge === currentView ? 0 : counts[b.dataset.badge] || 0;
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
  for (const a of state.anniv.filter((x) => x.kind === "since" && x.date <= today)) {
    const n = daysBetween(a.date, today) + 1;
    const next = MILESTONES.find((m) => m > n) || Math.ceil((n + 1) / 1000) * 1000;
    const isMilestone = MILESTONES.includes(n);
    cards.push(h("div", { class: "cd since" },
      h("div", { class: "cd-t" }, `💑 ${a.title}から`),
      h("div", { class: "cd-n" }, h("b", {}, n.toLocaleString()), "日目"),
      h("div", { class: "cd-s" }, isMilestone ? `🎉 今日は${n}日記念!` : `${next}日記念まで あと${next - n}日`)
    ));
  }
  const yearly = state.anniv
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
  return state.anniv.filter((a) => a.date && a.date.slice(5) === key.slice(5) && a.date <= key);
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
    const label = a.kind === "since" ? (years > 0 ? `${a.title}から${years}年 🎉` : `${a.title} 💗`) : `${a.title} 🎂`;
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
        h("div", { class: "t" }, p.title, newBadge(p, "places")),
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
      state.filter === "done" ? "まだ「行った」場所はありません" : "右下の ＋ から行きたい所を追加しよう"));
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
  if (!$("#memoryDialog").open) $("#memoryDialog").showModal();
}
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
async function compress(file) {
  const img = await loadImage(file);
  let max = 1080, q = 0.72, data = "";
  for (let i = 0; i < 6; i++) {
    const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * r);
    c.height = Math.round(img.naturalHeight * r);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    data = c.toDataURL("image/jpeg", q);
    if (data.length < 300000) break;
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
  $("#photoDialog").showModal();
}
$("#btnDeletePhoto").addEventListener("click", () => {
  if (!viewingPhoto || !confirm("この写真を削除しますか?(二人とも見られなくなります)")) return;
  state.store.remove(room(), "photos", viewingPhoto.id);
  $("#photoDialog").close();
  toast("写真を削除しました");
});

/* ---------- 予定の入力 ---------- */
function openEvent(e = {}) {
  const f = $("#eventForm");
  f.reset();
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
  $("#eventDialogTitle").textContent = e.id ? "予定を変更" : "予定を追加";
  $("#btnDeleteEvent").hidden = !e.id;
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
  const id = $("#eventForm").id.value;
  if (!id || !confirm("この予定を削除しますか?")) return;
  state.store.remove(room(), "events", id);
  $("#eventDialog").close();
  toast("予定を削除しました");
});

/* ---------- 行きたい所の入力 ---------- */
$("#genreSelect").replaceChildren(...GENRES.map((g) => h("option", { value: g.id }, g.label)));

function openPlace(p = {}) {
  const f = $("#placeForm");
  f.reset();
  f.title.value = p.title || "";
  f.genre.value = p.genre || (state.genre !== "all" ? state.genre : "outing");
  f.area.value = p.area || "";
  f.url.value = p.url || "";
  f.memo.value = p.memo || "";
  f.id.value = p.id || "";
  $("#placeDialogTitle").textContent = p.id ? "行きたい所を変更" : "行きたい所を追加";
  $("#btnDeletePlace").hidden = !p.id;
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
  const id = $("#placeForm").id.value;
  if (!id || !confirm("この行きたい所を削除しますか?(予定と写真は残ります)")) return;
  state.store.remove(room(), "places", id);
  $("#placeDialog").close();
  toast("削除しました");
});

$$("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
$$("dialog").forEach((d) => d.addEventListener("click", (ev) => { if (ev.target === d) d.close(); }));

/* ---------- 設定 ---------- */
function renderSettings() {
  if (!state.device) return;
  $("#nameA").value = state.names.a || "";
  $("#nameB").value = state.names.b || "";
  $("#whoAmI").value = me();
  $("#whoAmI").options[0].textContent = `ひとり目(${nameOf("a")})`;
  $("#whoAmI").options[1].textContent = `ふたり目(${nameOf("b")})`;
  $("#pairCode").textContent = room();
  renderAnnivList();
}

function renderAnnivList() {
  const items = state.anniv.slice().sort((x, y) => (x.date || "").localeCompare(y.date || "")).map((a) =>
    h("li", { class: "item anniv" },
      h("div", { class: "body" },
        h("div", { class: "t" }, (a.kind === "since" ? "💑 " : "🎂 ") + a.title),
        h("div", { class: "s" }, `${dayLabel(a.date)} · ${a.kind === "since" ? "この日から○日目" : "毎年の記念日"}`)),
      h("button", { class: "small ghost", onclick: () => {
        if (!confirm(`「${a.title}」を削除しますか?`)) return;
        state.store.remove(room(), "anniv", a.id);
      } }, "削除")));
  if (!items.length) items.push(h("li", { class: "empty" }, "まだありません。付き合った日や誕生日を入れてみよう"));
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
  const names = { a: $("#nameA").value.trim(), b: $("#nameB").value.trim() };
  state.device.me = $("#whoAmI").value;
  saveDevice(state.device);
  await state.store.saveRoom(room(), { names });
  toast("保存しました");
});

$("#btnCopyCode").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(room());
    $("#copyMsg").textContent = "コピーしました。LINE などで相手に送ってください。";
  } catch {
    $("#copyMsg").textContent = "コピーできませんでした。コードを長押しして選んでください。";
  }
});

$("#btnLeave").addEventListener("click", () => {
  if (!confirm("この端末のペア設定をやめますか?\n(ペアコードを控えておけば、あとで戻れます)")) return;
  state.unsub.forEach((u) => u());
  state.unsub = [];
  state.device = null;
  saveDevice(null);
  show("setup");
});

/* ---------- はじめての設定 ---------- */
$("#btnNewPair").addEventListener("click", async () => {
  const name = $("#setupName").value.trim();
  if (!name) { $("#setupMsg").textContent = "名前を入れてください"; return; }
  const code = newCode();
  await state.store.saveRoom(code, { names: { a: name, b: "" } });
  state.device = { room: code, me: "a", lastSeen: Date.now() };
  saveDevice(state.device);
  start();
  show("settings");
  toast("ペアコードを相手に送ってください");
});

$("#btnJoin").addEventListener("click", async () => {
  const name = $("#setupName").value.trim();
  const code = normCode($("#setupCode").value);
  $("#setupMsg").textContent = "";
  if (!name) { $("#setupMsg").textContent = "名前を入れてください"; return; }
  if (!code) { $("#setupMsg").textContent = "ペアコードを入れてください"; return; }
  try {
    if (!(await state.store.roomExists(code))) {
      $("#setupMsg").textContent = "そのペアコードは見つかりませんでした。もう一度確かめてください。";
      return;
    }
  } catch (e) {
    console.error(e);
    $("#setupMsg").textContent = "つながりませんでした。電波を確かめてください。";
    return;
  }
  await state.store.saveRoom(code, { names: { b: name } });
  state.device = { room: code, me: "b", lastSeen: Date.now() };
  saveDevice(state.device);
  start();
  show("calendar");
  toast("ペアに参加しました");
});

/* ---------- 起動 ---------- */
function rerender() {
  renderCalendar();
  renderPlaces();
  renderAlbum();
  if (!$("#settings").hidden) renderSettings();
}

function start() {
  state.unsub.forEach((u) => u());
  if (!state.device.lastSeen) { state.device.lastSeen = Date.now(); saveDevice(state.device); }
  const r = room();
  state.unsub = [
    state.store.watchRoom(r, (x) => { state.names = { a: "", b: "", ...(x.names || {}) }; rerender(); }),
    state.store.watch(r, "places", (list) => {
      state.places = list;
      renderPlaces(); renderCalendar(); renderAlbum();
      const p = memoryPlaceId && list.find((x) => x.id === memoryPlaceId);
      if (p) renderPartnerReview(p);
    }),
    state.store.watch(r, "events", (list) => { state.events = list; renderCalendar(); renderPlaces(); }),
    state.store.watch(r, "anniv", (list) => { state.anniv = list; renderCalendar(); if (!$("#settings").hidden) renderAnnivList(); }),
    state.store.watch(r, "photos", (list) => { state.photos = list; renderAlbum(); renderMemoryPhotos(); }),
  ];
}

$$("#tabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));
$("#prevMonth").addEventListener("click", () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); });
$("#nextMonth").addEventListener("click", () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); });
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
  if (state.device && state.device.room) { start(); show("calendar"); }
  else show("setup");

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn(e));
  }
})();
