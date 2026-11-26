// js/parser.js — membaca deadline (tanggal & jam) dari teks bebas berbahasa Indonesia

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s:/.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function validDateParts(y, m, d) {
  const x = new Date(y, m, d);
  return x.getFullYear() === y && x.getMonth() === m && x.getDate() === d;
}

// Mengembalikan { hour, minute, hasTime }. Tanpa jam → 23:59 dan hasTime=false.
function parseWaktu(rawText) {
  const text = String(rawText || "").toLowerCase();
  const NO_TIME = { hour: 23, minute: 59, hasTime: false };
  let hour = null, minute = 0, period = null;

  // "jam 9", "pukul 09.30 pagi"
  let m = text.match(/\b(?:jam|pukul|pkl)\s*(\d{1,2})(?:\s*[:.]\s*(\d{1,2}))?\s*(pagi|siang|sore|malam|am|pm)?\b/i);
  if (m) {
    hour = +m[1];
    minute = m[2] == null ? 0 : +m[2];
    period = m[3]?.toLowerCase() || null;
  }

  // "15:30", "09.00"
  if (hour === null) {
    for (const c of text.matchAll(/\b(\d{1,2})\s*[:.]\s*(\d{2})\b/g)) {
      const h = +c[1], mi = +c[2];
      if (h <= 23 && mi <= 59) { hour = h; minute = mi; break; }
    }
  }

  // "5 sore", "9 pm"
  if (hour === null) {
    m = text.match(/\b(\d{1,2})\s*(pagi|siang|sore|malam|am|pm)\b/i);
    if (m) { hour = +m[1]; period = m[2].toLowerCase(); }
  }

  if (hour === null) return NO_TIME;

  if (period === "am" && hour === 12) hour = 0;
  else if (period === "pm" && hour < 12) hour += 12;
  else if (period === "pagi" && hour === 12) hour = 0;
  else if ((period === "siang" || period === "sore") && hour < 12) hour += 12;
  else if (period === "malam" && hour < 12) hour += 12;

  if (hour > 23 || minute > 59) return NO_TIME;
  return { hour, minute, hasTime: true };
}

const BULAN = {
  januari: 0, jan: 0, februari: 1, feb: 1, pebruari: 1, peb: 1, maret: 2, mar: 2, april: 3, apr: 3,
  mei: 4, juni: 5, jun: 5, juli: 6, jul: 6, agustus: 7, agu: 7, agt: 7, ags: 7,
  september: 8, sep: 8, sept: 8, oktober: 9, okt: 9, november: 10, nov: 10, desember: 11, des: 11
};
const HARI = { minggu: 0, ahad: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6 };

// Mengembalikan { date, hasTime, type } atau null jika tidak ada deadline yang dikenali.
function parseTanggal(text, referenceDate = new Date()) {
  if (!text) return null;

  const clean = String(text).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/jum['’]at/g, "jumat")
    .replace(/\s+/g, " ").trim();

  const now = new Date(referenceDate);
  const w = parseWaktu(clean);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const result = (y, m, d, type) => {
    if (!validDateParts(y, m, d)) return null;
    return {
      date: new Date(y, m, d, w.hour, w.minute, w.hasTime ? 0 : 59, w.hasTime ? 0 : 999),
      hasTime: w.hasTime,
      type
    };
  };
  const offsetDay = (n, type) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
    return result(d.getFullYear(), d.getMonth(), d.getDate(), type);
  };
  // Tanggal tanpa tahun yang sudah lewat → dianggap tahun depan
  const nextYearIfNeeded = (r, explicit) => {
    if (!r || explicit) return r;
    const d = new Date(r.date.getFullYear(), r.date.getMonth(), r.date.getDate());
    return d < today ? result(r.date.getFullYear() + 1, r.date.getMonth(), r.date.getDate(), r.type) : r;
  };

  // --- Kata relatif ---
  if (/\bhari ini\b/.test(clean)) return offsetDay(0, "hari-ini");
  if (/\bkemarin\b/.test(clean)) return offsetDay(-1, "kemarin");
  if (/\bbesok\b/.test(clean)) return offsetDay(1, "besok");
  if (/\blusa\b/.test(clean)) return offsetDay(2, "lusa");

  let m = clean.match(/\b(\d{1,3})\s*hari\s+lagi\b/);
  if (m) return offsetDay(+m[1], "hari-lagi");
  m = clean.match(/\b(\d{1,3})\s*hari\s+(?:yang\s+)?lalu\b/);
  if (m) return offsetDay(-m[1], "hari-lalu");

  // --- 2026-08-28 ---
  m = clean.match(/\b(20\d{2})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})\b/);
  if (m) { const r = result(+m[1], +m[2] - 1, +m[3], "tanggal-iso"); if (r) return r; }

  // --- 28/08/2026, 28-08, 28.08.26 ---
  m = clean.match(/\b(?:tgl|tanggal)?\s*(\d{1,2})\s*([\/.-])\s*(\d{1,2})(?:\s*\2\s*(\d{2}|\d{4}))?\b/);
  if (m && +m[3] >= 1 && +m[3] <= 12) {
    const explicit = !!m[4];
    let y = explicit ? +m[4] : now.getFullYear();
    if (y < 100) y += 2000;
    const r = result(y, +m[3] - 1, +m[1], "tanggal-angka");
    if (r) return nextYearIfNeeded(r, explicit);
  }

  // --- 28 Agustus [2026] ---
  const names = Object.keys(BULAN).sort((a, b) => b.length - a.length).join("|");
  m = clean.match(new RegExp("\\b(?:tgl|tanggal)?\\s*(\\d{1,2})\\s*(" + names + ")(?:\\s+(\\d{4}))?\\b", "i"));
  if (m) {
    const explicit = !!m[3];
    const r = result(explicit ? +m[3] : now.getFullYear(), BULAN[m[2].toLowerCase()], +m[1], "tanggal-bulan");
    if (r) return nextYearIfNeeded(r, explicit);
  }

  // --- "tanggal 25" ---
  m = clean.match(/\b(?:tgl|tanggal)\s*(\d{1,2})\b/);
  if (m) {
    let y = now.getFullYear(), mo = now.getMonth();
    const d = +m[1];
    let r = result(y, mo, d, "tanggal-hari");
    if (r && new Date(y, mo, d) < today) {
      mo++;
      if (mo > 11) { mo = 0; y++; }
      r = result(y, mo, d, "tanggal-hari");
    }
    if (r) return r;
  }

  // --- Nama hari: "Senin", "Senin depan" ---
  for (const [name, target] of Object.entries(HARI)) {
    if (!new RegExp("\\b" + name + "\\b").test(clean)) continue;
    let diff = (target - now.getDay() + 7) % 7;
    const next = /\b(minggu|pekan)\s+depan\b/.test(clean) || new RegExp("\\b" + name + "\\s+depan\\b").test(clean);
    if (next) diff = diff === 0 ? 7 : diff;
    else if (diff === 0 && w.hasTime) {
      const same = result(now.getFullYear(), now.getMonth(), now.getDate(), "nama-hari");
      if (same.date <= now) diff = 7;
    }
    return offsetDay(diff, "nama-hari");
  }

  // --- Hanya jam: hari ini, atau besok jika sudah lewat ---
  if (w.hasTime) {
    const r = offsetDay(0, "hanya-jam");
    return r.date <= now ? offsetDay(1, "hanya-jam") : r;
  }
  return null;
}
