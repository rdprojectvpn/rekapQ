// js/app.js — logika aplikasi Order Manager PRO+
// Membutuhkan: js/parser.js (normalizeText, parseTanggal)

const STORAGE_KEY = "orders";
const PAGES = ["home", "app", "guide", "faq", "about", "privacy", "terms", "contact"];
const HOUR = 3600000;

// localStorage yang aman (tidak error jika diblokir browser)
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} }
};

let data = [];
let activeTab = store.get("activeStatusTab") || "belum";
let sortMode = store.get("sortMode") === "manual" ? "manual" : "deadline";
let undoItem = null, undoIndex = -1, toastTimer = null;
let draggedId = null, editingId = null;

const $ = (sel) => document.querySelector(sel);

// =====================================================
// UTIL
// =====================================================
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}

function statusOf(x) { return x.progress === "proses" || x.progress === "selesai" ? x.progress : "belum"; }

function dayStatus(date) {
  if (!date) return "";
  const n = new Date();
  const a = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const d = Math.round((b - a) / 86400000);
  return d === 0 ? "today" : d === 1 ? "tomorrow" : d === 2 ? "h2" : "";
}

function realtimeBadge(date) {
  if (!date) return "";
  const diff = date - new Date(), h = diff / HOUR;
  if (diff <= 0) return '<span class="tag red">⛔ LEWAT</span>';
  if (h <= 1) return '<span class="tag red">🚨 &lt;1 JAM</span>';
  if (h <= 3) return '<span class="tag red">⚠️ &lt;3 JAM</span>';
  if (h <= 6) return '<span class="tag orange">⏰ &lt;6 JAM</span>';
  return "";
}

function countdown(date) {
  const diff = date - new Date();
  if (diff <= 0) return "⛔ Deadline terlewat";
  const day = Math.floor(diff / 86400000), h = Math.floor(diff % 86400000 / HOUR), m = Math.floor(diff % HOUR / 60000);
  return day ? `⏳ ${day} hari ${h} jam lagi` : h ? `⏳ ${h} jam ${m} menit lagi` : `⏳ ${m} menit lagi`;
}

function formatDeadline(info) {
  if (!info) return "Tidak ada tanggal / waktu";
  const opt = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
  if (info.hasTime) return info.date.toLocaleString("id-ID", { ...opt, hour: "2-digit", minute: "2-digit" });
  return info.date.toLocaleDateString("id-ID", opt) + " · sampai akhir hari";
}

// =====================================================
// DATA: simpan, urutkan
// =====================================================
function save() {
  data.forEach((x, i) => (x.order = i));
  store.set(STORAGE_KEY, JSON.stringify(data));
}

function loadData() {
  let raw = [];
  try { raw = JSON.parse(store.get(STORAGE_KEY) || "[]"); } catch (_) {}
  data = (Array.isArray(raw) ? raw : []).map((x, i) => ({
    id: x.id || genId(),
    text: x.text || "",
    progress: statusOf(x),
    note: x.note || "",
    order: x.order ?? i
  }));
}

// Peta id → hasil baca deadline (dihitung sekali per render)
function analyze() { return new Map(data.map((x) => [x.id, parseTanggal(x.text)])); }

// Urutan tampil. Mode "manual" memakai urutan array apa adanya.
function sortedAll(dates = analyze()) {
  if (sortMode === "manual") return [...data];
  return [...data].sort((a, b) => {
    const sa = a.progress === "selesai", sb = b.progress === "selesai";
    if (sa !== sb) return sa ? 1 : -1;
    const da = dates.get(a.id), db = dates.get(b.id);
    if (da && !db) return -1;
    if (!da && db) return 1;
    if (!da && !db) return 0;           // sama-sama tanpa tanggal: tetap urutan input
    return da.date - db.date;
  });
}

function setSortMode(mode) {
  sortMode = mode;
  store.set("sortMode", mode);
  $("#sortMode").value = mode;
}

// Dipanggil sebelum pengaturan urutan manual: bekukan urutan yang sedang terlihat
function enterManualMode() {
  if (sortMode === "manual") return;
  data = sortedAll();
  setSortMode("manual");
  showToast("Mode urutan diubah ke “Urut manual”.");
}

// =====================================================
// AKSI ORDER
// =====================================================
function tambah() {
  const input = $("#input");
  let added = 0, dup = 0;
  input.value.split("\n").forEach((line) => {
    const clean = line.trim();
    if (!clean) return;
    const norm = normalizeText(clean);
    if (data.some((x) => normalizeText(x.text) === norm)) { dup++; return; }
    data.unshift({ id: genId(), text: clean, progress: "belum", note: "", order: 0 });
    added++;
  });
  if (!added && !dup) { input.focus(); return; }
  if (added) { setTab("belum", false); input.value = ""; }
  save(); render();
  const parts = [];
  if (added) parts.push(`✅ ${added} order ditambahkan`);
  if (dup) parts.push(`ℹ️ ${dup} duplikat diabaikan`);
  showToast(parts.join(" • "));
}

function hapus(id) {
  const i = data.findIndex((x) => x.id === id);
  if (i < 0) return;
  undoItem = { ...data[i] };
  undoIndex = i;
  data.splice(i, 1);
  save(); render();
  showToast("Order dihapus.", { undo: true, ms: 5000 });
}

function undoDelete() {
  if (!undoItem) return;
  data.splice(Math.min(undoIndex, data.length), 0, undoItem);
  undoItem = null;
  save(); render(); hideToast();
}

function hapusSemuaData() {
  if (!data.length) { showToast("Tidak ada data untuk dihapus."); return; }
  if (!confirm("Hapus SEMUA data order? Semua status Belum, Proses, dan Selesai akan dihapus.")) return;
  data = [];
  store.del(STORAGE_KEY);
  render();
}

function updateProgress(id, val) {
  const x = data.find((a) => a.id === id);
  if (!x) return;
  x.progress = val;
  save(); render();
}

function moveManual(id, dir) {
  enterManualMode();
  const vis = visibleList(analyze()).map((x) => x.id);   // tetangga yang benar-benar terlihat
  const pos = vis.indexOf(id), target = vis[pos + dir];
  if (pos < 0 || !target) return;
  const a = data.findIndex((x) => x.id === id), b = data.findIndex((x) => x.id === target);
  [data[a], data[b]] = [data[b], data[a]];
  save(); render();
}

// ---------- Dialog edit ----------
const dlgEdit = $("#dlgEdit");

function openEdit(id) {
  const x = data.find((a) => a.id === id);
  if (!x) return;
  editingId = id;
  $("#editText").value = x.text;
  $("#editNote").value = x.note || "";
  dlgEdit.showModal();
  $("#editText").focus();
}

function saveEdit() {
  const x = data.find((a) => a.id === editingId);
  const text = $("#editText").value.trim();
  if (!x || !text) { $("#editText").focus(); return; }
  const norm = normalizeText(text);
  if (data.some((a) => a.id !== x.id && normalizeText(a.text) === norm)) {
    showToast("⚠️ Order dengan isi yang sama sudah ada.");
    return;
  }
  x.text = text;
  x.note = $("#editNote").value.trim();
  save(); render();
  dlgEdit.close();
}

$("#editSave").addEventListener("click", saveEdit);
$("#editCancel").addEventListener("click", () => dlgEdit.close());
$("#editText").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveEdit(); } });
dlgEdit.addEventListener("click", (e) => { if (e.target === dlgEdit) dlgEdit.close(); });

// =====================================================
// RENDER
// =====================================================
function visibleList(dates) {
  const q = normalizeText($("#search").value);
  return sortedAll(dates).filter((x) =>
    statusOf(x) === activeTab && (!q || normalizeText(x.text).includes(q) || normalizeText(x.note).includes(q))
  );
}

function cardHTML(d, info) {
  const open = d.progress !== "selesai";
  const day = open ? dayStatus(info?.date) : "";
  const isSuper = open && info && info.date - new Date() <= HOUR;
  const dayTag = day === "today" ? '<span class="tag red">🔴 HARI INI</span>'
    : day === "tomorrow" ? '<span class="tag orange">🟠 BESOK</span>'
    : day === "h2" ? '<span class="tag blue">🔵 H-2</span>' : "";
  const id = escapeHtml(d.id);

  return `
  <div class="order ${d.progress} ${day} ${isSuper ? "super-priority" : ""}" draggable="true" data-id="${id}">
    <div class="drag-handle" title="Geser untuk mengatur urutan">☷</div>
    <div>
      <div class="title">
        ${isSuper ? '<span class="urgent-big">⚠️ SUPER PRIORITAS</span>' : ""}
        ${dayTag}${open && info ? realtimeBadge(info.date) : ""}${escapeHtml(d.text)}
      </div>
      <div class="meta">
        <span>${escapeHtml(formatDeadline(info))}</span>
        ${info ? "" : '<span class="parse-warning">⚠️ Deadline tidak terdeteksi</span>'}
        ${info && open ? `<span class="countdown">${escapeHtml(countdown(info.date))}</span>` : ""}
      </div>
      ${d.note ? `<div class="note">📝 ${escapeHtml(d.note)}</div>` : ""}
    </div>
    <select class="progress p-${d.progress}" aria-label="Status order">
      <option value="belum" ${d.progress === "belum" ? "selected" : ""}>Belum</option>
      <option value="proses" ${d.progress === "proses" ? "selected" : ""}>Proses</option>
      <option value="selesai" ${d.progress === "selesai" ? "selected" : ""}>Selesai</option>
    </select>
    <div class="actions">
      <button data-act="up" title="Naik">▲</button>
      <button data-act="down" title="Turun">▼</button>
      <button data-act="edit" title="Edit / catatan">✏️</button>
      <button data-act="del" class="del" title="Hapus">🗑️</button>
    </div>
  </div>`;
}

function render() {
  const dates = analyze();
  const list = visibleList(dates);
  $("#output").innerHTML = list.length
    ? list.map((d) => cardHTML(d, dates.get(d.id))).join("")
    : `<div class="empty">${data.length ? "Tidak ada order pada tab ini." : "Belum ada order. Tulis di panel kiri lalu tekan “Tambah Order”."}</div>`;
  updateTabs();
  updateDashboard(dates);
}

function updateTabs() {
  const c = { belum: 0, proses: 0, selesai: 0 };
  data.forEach((x) => c[statusOf(x)]++);
  Object.keys(c).forEach((k) => ($("#count-" + k).textContent = c[k]));
  document.querySelectorAll(".status-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === activeTab));
}

function updateDashboard(dates) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tom = new Date(start); tom.setDate(tom.getDate() + 1);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  let over = 0, today = 0, tomorrow = 0, week = 0;

  data.forEach((x) => {
    if (x.progress === "selesai") return;
    const info = dates.get(x.id);
    if (!info) return;
    if (info.date < now) over++;
    const ds = new Date(info.date.getFullYear(), info.date.getMonth(), info.date.getDate());
    if (ds.getTime() === start.getTime()) today++;
    if (ds.getTime() === tom.getTime()) tomorrow++;
    if (ds >= start && ds < end) week++;
  });
  $("#dash-over").textContent = over;
  $("#dash-today").textContent = today;
  $("#dash-tomorrow").textContent = tomorrow;
  $("#dash-week").textContent = week;
}

function setTab(tab, rerender = true) {
  activeTab = tab;
  store.set("activeStatusTab", tab);
  if (rerender) render();
}

// =====================================================
// TOAST
// =====================================================
function showToast(text, { undo = false, ms = 3200 } = {}) {
  $("#toastText").textContent = text;
  $("#toastUndo").style.display = undo ? "" : "none";
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { hideToast(); undoItem = undo ? null : undoItem; }, ms);
}
function hideToast() { $("#toast").classList.remove("show"); }

// =====================================================
// EVENT
// =====================================================
$("#btnTambah").addEventListener("click", tambah);
$("#input").addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); tambah(); } });
$("#btnHapusSemua").addEventListener("click", hapusSemuaData);
$("#toastUndo").addEventListener("click", undoDelete);
$("#search").addEventListener("input", render);
$("#sortMode").addEventListener("change", (e) => { setSortMode(e.target.value); render(); });
document.querySelector(".status-tabs").addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab]");
  if (t) setTab(t.dataset.tab);
});

// Tombol di dalam kartu (delegasi)
const output = $("#output");
output.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const id = btn.closest(".order").dataset.id;
  ({ up: () => moveManual(id, -1), down: () => moveManual(id, 1), edit: () => openEdit(id), del: () => hapus(id) })[btn.dataset.act]?.();
});
output.addEventListener("change", (e) => {
  if (e.target.matches("select.progress")) updateProgress(e.target.closest(".order").dataset.id, e.target.value);
});

// Drag & drop
output.addEventListener("dragstart", (e) => {
  const card = e.target.closest(".order");
  if (!card) return;
  draggedId = card.dataset.id;
  card.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", draggedId);
});
output.addEventListener("dragover", (e) => {
  const card = e.target.closest(".order");
  if (!card || !draggedId) return;
  e.preventDefault();
  output.querySelectorAll(".drop-target").forEach((c) => c !== card && c.classList.remove("drop-target"));
  card.classList.toggle("drop-target", card.dataset.id !== draggedId);
});
output.addEventListener("drop", (e) => {
  const card = e.target.closest(".order");
  if (!card || !draggedId) return;
  e.preventDefault();
  const targetId = card.dataset.id;
  if (targetId !== draggedId) {
    enterManualMode();
    const a = data.findIndex((x) => x.id === draggedId), b = data.findIndex((x) => x.id === targetId);
    if (a >= 0 && b >= 0) { const [item] = data.splice(a, 1); data.splice(b, 0, item); save(); }
  }
  draggedId = null;
  render();
});
output.addEventListener("dragend", () => { draggedId = null; render(); });

// =====================================================
// HALAMAN, TEMA, JAM
// =====================================================
function showPage(page) {
  if (!PAGES.includes(page)) page = "home";
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === "page-" + page));
  document.querySelectorAll(".nav button").forEach((b) => b.classList.toggle("active", b.id === "nav-" + page));
  if (page === "app") render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  history.replaceState(null, "", "#" + page);
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-page]");
  if (!el) return;
  e.preventDefault();
  showPage(el.dataset.page);
});

$("#themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("light");
  store.set("theme", document.body.classList.contains("light") ? "light" : "dark");
});

// Pintasan: "/" fokus ke pencarian (saat di halaman aplikasi)
document.addEventListener("keydown", (e) => {
  if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  if (!$("#page-app").classList.contains("active")) return;
  e.preventDefault();
  $("#search").focus();
});

function updateClock() {
  $("#clock").textContent = new Date().toLocaleString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
}

// =====================================================
// INIT
// =====================================================
(function init() {
  if (store.get("theme") === "light") document.body.classList.add("light");
  loadData();
  save();
  $("#sortMode").value = sortMode;
  $("#year").textContent = new Date().getFullYear();
  updateClock();
  setInterval(updateClock, 1000);
  // Segarkan countdown tiap menit (tidak saat sedang drag / edit)
  setInterval(() => {
    if ($("#page-app").classList.contains("active") && !draggedId && !dlgEdit.open) render();
  }, 60000);
  showPage(location.hash.replace("#", "") || "home");
})();
