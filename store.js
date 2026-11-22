// データの置き場所。Firebase の設定があれば二人で共有、なければこの端末だけに保存。
import { firebaseConfig } from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";

export async function createStore() {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    return createFirebaseStore();
  }
  return createLocalStore();
}

const newest = (opts) => (list) => {
  if (!opts || !opts.limit) return list;
  return list.slice().sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0)).slice(0, opts.limit);
};

/* ---------- お試しモード(この端末だけ) ---------- */
function createLocalStore() {
  const listeners = new Map(); // key -> Set(cb)
  const key = (room, kind) => `couple:${room}:${kind}`;
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const emit = (k) => {
    const v = read(k);
    (listeners.get(k) || []).forEach((cb) => cb(v));
  };
  window.addEventListener("storage", (e) => { if (e.key && listeners.has(e.key)) emit(e.key); });
  const on = (k, cb) => {
    if (!listeners.has(k)) listeners.set(k, new Set());
    listeners.get(k).add(cb);
    cb(read(k));
    return () => listeners.get(k).delete(cb);
  };
  const save = async (room, kind, id, data) => {
    const k = key(room, kind);
    const map = read(k);
    const newId = id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
    map[newId] = { ...(map[newId] || { createdAt: Date.now() }), ...data, updatedAt: Date.now() };
    write(k, map);
    emit(k);
    return newId;
  };

  return {
    shared: false,
    uid: "local",
    async roomExists(room) { return Object.keys(read(key(room, "room"))).length > 0; },
    async getRoom(room) { return read(key(room, "room")); },
    watchRoom(room, cb) { return on(key(room, "room"), cb); },
    async saveRoom(room, data) {
      const k = key(room, "room");
      const cur = read(k);
      write(k, {
        ...cur, ...data,
        names: { ...(cur.names || {}), ...(data.names || {}) },
        members: { ...(cur.members || {}), ...(data.members || {}) },
      });
      emit(k);
    },
    // 枠(招待した側 a / 参加した側 b)の登録を外す
    async clearMember(room, slot) {
      const k = key(room, "room");
      const cur = read(k);
      const members = { ...(cur.members || {}) };
      delete members[slot];
      write(k, { ...cur, members });
      emit(k);
    },
    watch(room, kind, cb, opts) {
      const pick = newest(opts);
      return on(key(room, kind), (map) => cb(pick(Object.entries(map).map(([id, v]) => ({ id, ...v })))));
    },
    save,
    saveNow: save,
    async remove(room, kind, id) {
      const k = key(room, kind);
      const map = read(k);
      delete map[id];
      write(k, map);
      emit(k);
    },
  };
}

/* ---------- 共有モード(Firebase) ---------- */
async function createFirebaseStore() {
  const { initializeApp } = await import(FB + "firebase-app.js");
  const { getAuth, signInAnonymously, onAuthStateChanged } = await import(FB + "firebase-auth.js");
  const fs = await import(FB + "firebase-firestore.js");

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  let db;
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache() }); // 電波がない時も見られるように
  } catch {
    db = fs.getFirestore(app);
  }

  // 端末ごとの匿名ログイン(アプリを消さない限り、同じ端末は同じ ID のまま)
  const user = await new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (u) => {
      if (u) { stop(); resolve(u); }
    });
    signInAnonymously(auth).catch(reject);
  });

  const col = (room, kind) => fs.collection(db, "rooms", room, kind);
  const roomDoc = (room) => fs.doc(db, "rooms", room);
  const write = (room, kind, id, data) => {
    const ref = id ? fs.doc(col(room, kind), id) : fs.doc(col(room, kind));
    const body = id ? { ...data, updatedAt: Date.now() } : { ...data, createdAt: Date.now(), updatedAt: Date.now() };
    return { ref, promise: fs.setDoc(ref, body, { merge: true }) };
  };

  return {
    shared: true,
    uid: user.uid,
    async roomExists(room) { return (await fs.getDoc(roomDoc(room))).exists(); },
    async getRoom(room) {
      // 端末の保存分ではなく、必ずサーバーの最新を見る
      const s = await fs.getDocFromServer(roomDoc(room)).catch(() => fs.getDoc(roomDoc(room)));
      return s.exists() ? s.data() : null;
    },
    watchRoom(room, cb) {
      return fs.onSnapshot(roomDoc(room), (s) => cb(s.data() || {}), (e) => console.error(e));
    },
    async saveRoom(room, data) {
      await fs.setDoc(roomDoc(room), { ...data, updatedAt: fs.serverTimestamp() }, { merge: true });
    },
    // 枠(招待した側 a / 参加した側 b)の登録を外す
    async clearMember(room, slot) {
      await fs.updateDoc(roomDoc(room), { ["members." + slot]: fs.deleteField(), updatedAt: fs.serverTimestamp() });
    },
    watch(room, kind, cb, opts) {
      const q = opts && opts.limit
        ? fs.query(col(room, kind), fs.orderBy("createdAt", "desc"), fs.limit(opts.limit))
        : col(room, kind);
      return fs.onSnapshot(q, (snap) => {
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, (e) => console.error(e));
    },
    // 電波が悪くても待たされないよう、書き込みの完了は待たない
    async save(room, kind, id, data) {
      const { ref, promise } = write(room, kind, id, data);
      promise.catch((e) => console.error(e));
      return ref.id;
    },
    // 完了を待つ必要があるとき用(ペアの登録など)
    async saveNow(room, kind, id, data) {
      const { ref, promise } = write(room, kind, id, data);
      await promise;
      return ref.id;
    },
    async remove(room, kind, id) {
      fs.deleteDoc(fs.doc(col(room, kind), id)).catch((e) => console.error(e));
    },
  };
}
