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
const WD = ["日", "月", "火", "水", "木", "金", "土"];
const dayLabel = (s) => { const d = parseYmd(s); return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`; };
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

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
const today = ymd(new Date());
const state = {
  store: null,
  device: loadDevice(),     // { room, me: "a" | "b" }
  names: { a: "", b: "" },
  places: [],
  events: [],
  month: (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(),
  selected: today,
  filter: "todo",
  unsub: [],
};
const nameOf = (w) => w === "both" ? "ふたり" : (state.names[w] || (w === "a" ? "ひとり目" : "ふたり目"));

/* ---------- 画面の切り替え ---------- */
function show(view) {
  $$(".view").forEach((v) => (v.hidden = v.id !== view));
  $("#tabs").hidden = view === "setup";
  $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  window.scrollTo(0, 0);
}

/* ---------- カレンダー ---------- */
function renderCalendar() {
  const m = state.month;
  $("#monthLabel").textContent = `${m.getFullYear()}年${m.getMonth() + 1}月`;

  $("#legend").replaceChildren(
    ...["a", "b", "both"].map((w) => h("span", {}, h("span", { class: `dot ${w}` }), nameOf(w)))
  );

  const byDate = {};
  for (const e of state.events) (byDate[e.date] ||= []).push(e);

  const start = new Date(m.getFullYear(), m.getMonth(), 1 - m.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (i >= 35 && d.getMonth() !== m.getMonth()) break;
    const key = ymd(d);
    const evs = (byDate[key] || []).sort(byTime);
    const cls = ["cell"];
    if (d.getMonth() !== m.getMonth()) cls.push("other");
    if (key === today) cls.push("today");
    if (key === state.selected) cls.push("selected");
    if (d.getDay() === 0) cls.push("sun");
    if (d.getDay() === 6) cls.push("sat");
    cells.push(h("button", {
      class: cls.join(" "), "aria-label": `${dayLabel(key)} 予定${evs.length}件`,
      onclick: () => {
        state.selected = key;
        if (d.getMonth() !== m.getMonth()) state.month = new Date(d.getFullYear(), d.getMonth(), 1);
        renderCalendar();
      },
    },
      h("span", { class: "num" }, d.getDate()),
      h("span", { class: "dots" }, evs.slice(0, 4).map((e) => h("span", { class: `dot ${e.who || "both"}` })))
    ));
  }
  $("#grid").replaceChildren(...cells);
  renderDay();
}

const byTime = (x, y) => (x.time || "99").localeCompare(y.time || "99");

function eventItem(e, showDate) {
  const place = e.placeId && state.places.find((p) => p.id === e.placeId);
  const sub = [showDate ? dayLabel(e.date) : null, e.time || "時間未定", nameOf(e.who || "both")].filter(Boolean).join(" · ");
  return h("li", { class: `item ${e.who || "both"}`, onclick: () => openEvent(e) },
    h("div", { class: "body" },
      h("div", { class: "t" }, e.title),
      h("div", { class: "s" }, sub),
      place ? h("div", { class: "s" }, `📍 ${place.title}`) : null,
      e.memo ? h("div", { class: "s" }, e.memo) : null
    )
  );
}

function renderDay() {
  $("#dayLabel").textContent = dayLabel(state.selected) + (state.selected === today ? " 今日" : "");
  const evs = state.events.filter((e) => e.date === state.selected).sort(byTime);
  const items = evs.map((e) => eventItem(e, false));
  if (!items.length) items.push(h("li", { class: "empty" }, "予定はありません"));

  const upcoming = state.events
    .filter((e) => e.date >= today && e.date !== state.selected)
    .sort((x, y) => x.date.localeCompare(y.date) || byTime(x, y))
    .slice(0, 5);
  if (upcoming.length) {
    items.push(h("li", {}, h("h3", { style: "margin-top:14px" }, "これからの予定")));
    items.push(...upcoming.map((e) => eventItem(e, true)));
  }
  $("#dayEvents").replaceChildren(...items);
}

/* ---------- 行きたい所 ---------- */
function renderPlaces() {
  $$(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.filter === state.filter));
  const list = state.places
    .filter((p) => state.filter === "all" || (state.filter === "done" ? p.done : !p.done))
    .sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));

  const items = list.map((p) => {
    const url = p.url && safeUrl(p.url);
    const planned = state.events.filter((e) => e.placeId === p.id).sort((x, y) => x.date.localeCompare(y.date));
    const next = planned.find((e) => e.date >= today);
    return h("li", { class: `item ${p.addedBy || "both"} ${p.done ? "done" : ""}` },
      h("button", {
        class: `check ${p.done ? "on" : ""}`, "aria-label": p.done ? "行ったを取り消す" : "行ったにする",
        onclick: () => {
          state.store.save(state.device.room, "places", p.id, { done: !p.done });
          toast(p.done ? "「行きたい」に戻しました" : "行った!にしました 🎉");
        },
      }, "✓"),
      h("div", { class: "body", onclick: () => openPlace(p) },
        h("div", { class: "t" }, p.title),
        h("div", { class: "s" }, [p.area, `${nameOf(p.addedBy)}が追加`].filter(Boolean).join(" · ")),
        p.memo ? h("div", { class: "s" }, p.memo) : null,
        url ? h("div", { class: "s" }, h("a", { href: url, target: "_blank", rel: "noopener", onclick: (ev) => ev.stopPropagation() }, "リンクを開く")) : null,
        next ? h("div", { class: "s" }, `📅 ${dayLabel(next.date)} に予定あり`) : null
      ),
      p.done ? null : h("div", { class: "btns" },
        h("button", { class: "small", onclick: () => openEvent({ title: p.title, placeId: p.id, date: state.selected >= today ? state.selected : today, who: "both" }) }, "予定に")
      )
    );
  });
  if (!items.length) {
    items.push(h("li", { class: "empty" },
      state.filter === "done" ? "まだ「行った」場所はありません" : "右下の ＋ から行きたい所を追加しよう"));
  }
  $("#placeList").replaceChildren(...items);
}

/* ---------- 予定の入力 ---------- */
function openEvent(e = {}) {
  const f = $("#eventForm");
  f.reset();
  f.title.value = e.title || "";
  f.date.value = e.date || state.selected;
  f.time.value = e.time || "";
  f.memo.value = e.memo || "";
  f.id.value = e.id || "";
  f.placeId.value = e.placeId || "";
  f.querySelector(`input[name=who][value="${e.who || "both"}"]`).checked = true;
  $$("#eventForm .wname").forEach((s) => (s.textContent = nameOf(s.dataset.w)));
  $("#eventDialogTitle").textContent = e.id ? "予定を変更" : "予定を追加";
  $("#btnDeleteEvent").hidden = !e.id;
  $("#eventDialog").showModal();
}

$("#eventForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const data = {
    title: f.title.value.trim(),
    date: f.date.value,
    time: f.time.value,
    who: f.who.value,
    memo: f.memo.value.trim(),
    placeId: f.placeId.value || "",
  };
  if (!data.title || !data.date) return;
  if (!f.id.value) data.addedBy = state.device.me;
  state.store.save(state.device.room, "events", f.id.value || null, data);
  state.selected = data.date;
  const d = parseYmd(data.date);
  state.month = new Date(d.getFullYear(), d.getMonth(), 1);
  $("#eventDialog").close();
  toast("予定を保存しました");
  if (!$("#places").hidden) show("calendar"); // 「予定に」から入れたらカレンダーを見せる
  renderCalendar();
});

$("#btnDeleteEvent").addEventListener("click", () => {
  const id = $("#eventForm").id.value;
  if (!id || !confirm("この予定を削除しますか?")) return;
  state.store.remove(state.device.room, "events", id);
  $("#eventDialog").close();
  toast("予定を削除しました");
});

/* ---------- 行きたい所の入力 ---------- */
function openPlace(p = {}) {
  const f = $("#placeForm");
  f.reset();
  f.title.value = p.title || "";
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
  const data = { title: f.title.value.trim(), area: f.area.value.trim(), url: f.url.value.trim(), memo: f.memo.value.trim() };
  if (!data.title) return;
  if (!f.id.value) { data.addedBy = state.device.me; data.done = false; }
  state.store.save(state.device.room, "places", f.id.value || null, data);
  $("#placeDialog").close();
  toast("保存しました");
});

$("#btnDeletePlace").addEventListener("click", () => {
  const id = $("#placeForm").id.value;
  if (!id || !confirm("この行きたい所を削除しますか?(予定は残ります)")) return;
  state.store.remove(state.device.room, "places", id);
  $("#placeDialog").close();
  toast("削除しました");
});

$$("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
$$("dialog").forEach((d) => d.addEventListener("click", (ev) => { if (ev.target === d) d.close(); }));

/* ---------- 設定 ---------- */
function renderSettings() {
  $("#nameA").value = state.names.a || "";
  $("#nameB").value = state.names.b || "";
  $("#whoAmI").value = state.device.me;
  $("#whoAmI").options[0].textContent = `ひとり目(${nameOf("a")})`;
  $("#whoAmI").options[1].textContent = `ふたり目(${nameOf("b")})`;
  $("#pairCode").textContent = state.device.room;
}

$("#btnSaveNames").addEventListener("click", async () => {
  const names = { a: $("#nameA").value.trim(), b: $("#nameB").value.trim() };
  state.device.me = $("#whoAmI").value;
  saveDevice(state.device);
  await state.store.saveRoom(state.device.room, { names });
  toast("保存しました");
});

$("#btnCopyCode").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.device.room);
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
  const room = newCode();
  await state.store.saveRoom(room, { names: { a: name, b: "" } });
  state.device = { room, me: "a" };
  saveDevice(state.device);
  start();
  show("settings");
  toast("ペアコードを相手に送ってください");
});

$("#btnJoin").addEventListener("click", async () => {
  const name = $("#setupName").value.trim();
  const room = normCode($("#setupCode").value);
  $("#setupMsg").textContent = "";
  if (!name) { $("#setupMsg").textContent = "名前を入れてください"; return; }
  if (!room) { $("#setupMsg").textContent = "ペアコードを入れてください"; return; }
  try {
    if (!(await state.store.roomExists(room))) {
      $("#setupMsg").textContent = "そのペアコードは見つかりませんでした。もう一度確かめてください。";
      return;
    }
  } catch (e) {
    console.error(e);
    $("#setupMsg").textContent = "つながりませんでした。電波を確かめてください。";
    return;
  }
  await state.store.saveRoom(room, { names: { b: name } });
  state.device = { room, me: "b" };
  saveDevice(state.device);
  start();
  show("calendar");
  toast("ペアに参加しました");
});

/* ---------- 起動 ---------- */
function rerender() {
  renderCalendar();
  renderPlaces();
  if (!$("#settings").hidden) renderSettings();
}

function start() {
  state.unsub.forEach((u) => u());
  const room = state.device.room;
  state.unsub = [
    state.store.watchRoom(room, (r) => { state.names = { a: "", b: "", ...(r.names || {}) }; rerender(); renderSettings(); }),
    state.store.watch(room, "places", (list) => { state.places = list; renderPlaces(); renderCalendar(); }),
    state.store.watch(room, "events", (list) => { state.events = list; renderCalendar(); renderPlaces(); }),
  ];
}

$$("#tabs button").forEach((b) => b.addEventListener("click", () => {
  show(b.dataset.view);
  if (b.dataset.view === "settings") renderSettings();
}));
$("#prevMonth").addEventListener("click", () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); });
$("#nextMonth").addEventListener("click", () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); });
$("#btnAddEvent").addEventListener("click", () => openEvent({ date: state.selected }));
$("#btnAddPlace").addEventListener("click", () => openPlace());
$$(".seg button").forEach((b) => b.addEventListener("click", () => { state.filter = b.dataset.filter; renderPlaces(); }));

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
