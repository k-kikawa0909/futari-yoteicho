// ふたりの相性診断(お楽しみ用)
// 血液型・星座・MBTI・ラブタイプは、どれも科学的な根拠がはっきりしない「性格のめやす」です。
// 文章は一般によく言われる傾向をもとに、このアプリ用に書き起こしたものです。

export const BLOOD = ["A", "B", "O", "AB"];
export const MBTI = ["ISTJ", "ISFJ", "INFJ", "INTJ", "ISTP", "ISFP", "INFP", "INTP",
  "ESTP", "ESFP", "ENFP", "ENTP", "ESTJ", "ESFJ", "ENFJ", "ENTJ"];
export const MBTI_NICK = {
  ISTJ: "管理者", ISFJ: "擁護者", INFJ: "提唱者", INTJ: "建築家", ISTP: "巨匠", ISFP: "冒険家", INFP: "仲介者", INTP: "論理学者",
  ESTP: "起業家", ESFP: "エンターテイナー", ENFP: "運動家", ENTP: "討論者", ESTJ: "幹部", ESFJ: "領事", ENFJ: "主人公", ENTJ: "指揮官",
};
// ラブタイプの4つの軸(診断結果の4文字を1文字ずつ選ぶ)
export const LOVE_AXES = [
  { key: "lf", options: [["L", "L:リードしたい"], ["F", "F:リードされたい"]] },
  { key: "ca", options: [["C", "C:甘えたい"], ["A", "A:甘えられたい"]] },
  { key: "rp", options: [["R", "R:現実派"], ["P", "P:情熱派"]] },
  { key: "eo", options: [["E", "E:真面目・慎重"], ["O", "O:楽観的"]] },
];

/* ---------- 星座 ---------- */
const SIGNS = [
  ["山羊座", 1, 19, "earth"], ["水瓶座", 2, 18, "air"], ["魚座", 3, 20, "water"], ["牡羊座", 4, 19, "fire"],
  ["牡牛座", 5, 20, "earth"], ["双子座", 6, 21, "air"], ["蟹座", 7, 22, "water"], ["獅子座", 8, 22, "fire"],
  ["乙女座", 9, 22, "earth"], ["天秤座", 10, 23, "air"], ["蠍座", 11, 22, "water"], ["射手座", 12, 21, "fire"],
  ["山羊座", 12, 31, "earth"],
];
const ELEMENT = { fire: "火", earth: "地", air: "風", water: "水" };
export function zodiac(birthday) {
  if (!birthday) return null;
  const [, m, d] = birthday.split("-").map(Number);
  for (const [name, mm, dd, el] of SIGNS) {
    if (m < mm || (m === mm && d <= dd)) return { name, element: el };
  }
  return null;
}

/* ---------- 血液型 ---------- */
const BLOOD_PAIRS = {
  "A-A": [78, "気配りのポイントが似ていて、言わなくても分かり合える安心感があります。", "二人とも我慢しがち。不満は小さいうちに言葉にしよう。"],
  "A-B": [62, "きっちり派と自由派。お互いにないものを持っていて刺激になります。", "予定や約束の守り方で温度差が出やすい。決めごとは早めに共有を。"],
  "A-O": [88, "おおらかな O が、慎重な A を安心させる好相性と言われます。", "A は気をつかいすぎ、O は大ざっぱになりがち。「ありがとう」を口に出そう。"],
  "A-AB": [74, "落ち着いた雰囲気が似ていて、静かに過ごす時間が心地いい二人。", "本音を見せるのに時間がかかる組み合わせ。ゆっくり話す時間をつくって。"],
  "B-B": [80, "好きなことに夢中になれる者どうし。一緒にいて飽きません。", "二人ともマイペース。相手の予定も気にかける一言を。"],
  "B-O": [86, "B の自由さを O が大きく受け止める、のびのびした関係になりやすい。", "O の「まとめ役」に頼りすぎないように。B からも計画を出してみて。"],
  "B-AB": [82, "発想がユニークな二人。話がどんどん広がります。", "気分の波が重なると距離ができやすい。疲れた日は無理に合わせなくて OK。"],
  "O-O": [76, "おおらかで面倒見のいい二人。にぎやかで明るい関係。", "どちらも主導権をとりたくなる場面が。役割を交代でまわそう。"],
  "O-AB": [70, "まっすぐな O と冷静な AB。足りないところを補い合えます。", "AB のクールさを冷たいと受け取らないで。気持ちは言葉で確かめて。"],
  "AB-AB": [79, "距離感の取り方が同じで、ほどよい関係を保てます。", "二人とも一人の時間が大切。会えない日もこまめに連絡を。"],
};
function bloodPair(a, b) {
  return BLOOD_PAIRS[`${a}-${b}`] || BLOOD_PAIRS[`${b}-${a}`] || null;
}

/* ---------- 星座のエレメント ---------- */
function zodiacPair(e1, e2) {
  if (e1 === e2) return [85, "同じエレメントどうし。価値観やテンポが似ていて自然体でいられます。", "似ているぶん、欠点も同じ。二人で同じ方向に行きすぎないよう、ときどき立ち止まって。"];
  const good = [["fire", "air"], ["earth", "water"]];
  if (good.some(([x, y]) => (x === e1 && y === e2) || (x === e2 && y === e1))) {
    return [80, "お互いを引き立て合う組み合わせ。一緒にいると前向きになれます。", "盛り上がりやすい反面、勢いで決めがち。大きな決断は一晩おいてから。"];
  }
  return [65, "感じ方が違うぶん、新しい世界を見せてくれる相手です。", "「普通はこう」が違う二人。違いを面白がる気持ちを大切に。"];
}

/* ---------- MBTI ---------- */
function mbtiPair(a, b) {
  let score = 60;
  const good = [];
  const care = [];
  if (a[1] === b[1]) { score += 14; good.push("ものの見方(S/N)が同じで、会話のテンポや興味が合いやすい。"); }
  else { care.push(`${a[1] === "S" ? "現実派(S)" : "発想派(N)"}と${b[1] === "S" ? "現実派(S)" : "発想派(N)"}。段取りは S、アイデア出しは N と役割を分けると◎。`); }
  if (a[0] !== b[0]) { score += 6; good.push("外向(E)と内向(I)で、にぎやかさと落ち着きのバランスがとれる。"); care.push("E は人と会って元気に、I は一人で充電。休日の過ごし方はお互いのペースを尊重して。"); }
  else { score += 4; good.push(a[0] === "E" ? "二人ともアクティブ。出かける計画がすぐ決まる。" : "二人とも家時間が好き。のんびり過ごせる。"); }
  if (a[2] !== b[2]) { score += 6; care.push("考える派(T)と感じる派(F)。相談されたら、まず解決策より「そうだったんだね」と気持ちを受け止めて。"); }
  else { score += 6; good.push(a[2] === "T" ? "話し合いが論理的で、問題を一緒に解決しやすい。" : "気持ちに寄り添い合える、やさしい関係。"); }
  if (a[3] !== b[3]) { score += 3; care.push("計画派(J)と臨機応変派(P)。旅行は「大枠だけ決めて、あとはその場で」がちょうどいい。"); }
  else { score += 8; good.push(a[3] === "J" ? "予定の立て方が同じでスムーズ。" : "思い立ったらすぐ動ける身軽さが合う。"); }
  return [Math.min(score, 98), good, care];
}

/* ---------- ラブタイプ(4つの軸) ---------- */
function lovePair(a, b) {
  let score = 60;
  const good = [];
  const care = [];
  if (a.lf && b.lf) {
    if (a.lf !== b.lf) { score += 10; good.push("リードしたい人とリードされたい人。デートの役割分担が自然に決まる。"); }
    else if (a.lf === "L") { care.push("二人ともリードしたいタイプ。意見がぶつかったら「今回はあなた、次は私」と交代制に。"); }
    else { care.push("二人ともリードされたいタイプ。行き先が決まらないときはルーレットに任せよう 🎲"); }
  }
  if (a.ca && b.ca) {
    if (a.ca !== b.ca) { score += 12; good.push("甘えたい人と甘えられたい人。お互いの欲しいものがぴったり合う。"); }
    else if (a.ca === "C") { care.push("二人とも甘えたいタイプ。「今日は私が甘やかす日」を決めて交代で。"); }
    else { care.push("二人とも頼られたいタイプ。弱っているときは素直に「助けて」と言ってみて。"); }
  }
  if (a.rp && b.rp) {
    if (a.rp === b.rp) { score += 8; good.push(a.rp === "R" ? "恋愛の温度感が落ち着いていて、日常を大切にできる。" : "二人とも情熱的。記念日やサプライズで盛り上がれる。"); }
    else { care.push("情熱派(P)は言葉やイベントを、現実派(R)は毎日の安心を大事にしがち。どちらも愛情表現だと知っておこう。"); }
  }
  if (a.eo && b.eo) {
    if (a.eo !== b.eo) { score += 6; good.push("慎重さと楽観さで、ちょうどいいバランスに。"); care.push("心配性の相手には「大丈夫」より「一緒に確認しよう」が効く。"); }
    else { score += 4; if (a.eo === "E") care.push("二人とも真面目。ときどき予定を入れない「ゆるい日」をつくって。"); else care.push("二人とも楽観的。お金や期限のことは、カレンダーにメモしておこう。"); }
  }
  return [Math.min(score, 98), good, care];
}

/* ---------- まとめ ---------- */
export function diagnose(pa, pb) {
  const sections = [];
  if (pa.blood && pb.blood) {
    const r = bloodPair(pa.blood, pb.blood);
    if (r) sections.push({ title: `🩸 血液型 ${pa.blood}型 × ${pb.blood}型`, score: r[0], good: [r[1]], care: [r[2]] });
  }
  const za = zodiac(pa.birthday), zb = zodiac(pb.birthday);
  if (za && zb) {
    const r = zodiacPair(za.element, zb.element);
    sections.push({ title: `⭐ 星座 ${za.name}(${ELEMENT[za.element]}) × ${zb.name}(${ELEMENT[zb.element]})`, score: r[0], good: [r[1]], care: [r[2]] });
  }
  if (pa.mbti && pb.mbti) {
    const [s, g, c] = mbtiPair(pa.mbti, pb.mbti);
    sections.push({ title: `🧠 MBTI ${pa.mbti} × ${pb.mbti}`, score: s, good: g, care: c });
  }
  const la = { lf: pa.love_lf, ca: pa.love_ca, rp: pa.love_rp, eo: pa.love_eo };
  const lb = { lf: pb.love_lf, ca: pb.love_ca, rp: pb.love_rp, eo: pb.love_eo };
  if (Object.values(la).some(Boolean) && Object.values(lb).some(Boolean)) {
    const [s, g, c] = lovePair(la, lb);
    sections.push({ title: `💘 ラブタイプ ${loveCode(pa) || "?"} × ${loveCode(pb) || "?"}`, score: s, good: g, care: c });
  }
  // 表示は 80〜100% の範囲にする(ふたりで楽しむためのものなので)
  for (const s of sections) s.score = Math.max(80, Math.min(100, Math.round(80 + (s.score - 60) * 20 / 38)));
  const total = sections.length ? Math.round(sections.reduce((n, x) => n + x.score, 0) / sections.length) : null;
  return { total, sections };
}

export function loveCode(p) {
  const code = [p.love_lf, p.love_ca, p.love_rp, p.love_eo].map((x) => x || "-").join("");
  return code === "----" ? "" : code;
}

export function totalMessage(score) {
  if (score >= 95) return "運命レベルの相性!このまま仲良くね 💞";
  if (score >= 90) return "とっても相性ばっちり!違いも楽しめる二人です 😊";
  if (score >= 85) return "違うところがあるからこそ、補い合える二人 🤝";
  return "正反対だからこそ、毎日が新しい発見。言葉で伝え合うのが仲良しのコツ 💬";
}
