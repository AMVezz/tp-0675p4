/* Shared code for the web app's Train and Progress pages: storage, accounts, plan templates, metrics, small UI helpers.
   Everything lives in this browser's localStorage (per device); export/import moves it between devices. */
"use strict";
const TP = (() => {
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const DAY = 864e5;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const $ = (sel, el = document) => el.querySelector(sel);

  // ---------- dates ----------
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const monday = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const daysBetween = (a, b) => Math.round((b - a) / DAY);
  const DAYKEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const DAYNAMES = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
  const toInput = ms => { const d = new Date(ms); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fromInput = s => (s ? new Date(s).getTime() : null);
  const fmtDate = (ms, opt = { month: "short", day: "numeric" }) => new Date(ms).toLocaleDateString(undefined, opt);
  const fmtTime = ms => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const fmtDur = ms => { if (!(ms > 0)) return "0 min"; const m = Math.round(ms / 6e4); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`; };
  const fmtClock = ms => { const s = Math.max(0, Math.floor(ms / 1e3)); const h = Math.floor(s / 3600); return (h ? h + ":" + pad(Math.floor(s / 60) % 60) : Math.floor(s / 60)) + ":" + pad(s % 60); };
  const fmtNum = (n, d = 0) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });

  // ---------- accounts ----------
  const accounts = () => LS.get("tp.accounts", []);
  const currentId = () => { const id = LS.get("tp.current", null); return accounts().some(a => a.id === id) ? id : (accounts()[0]?.id ?? null); };
  const current = () => accounts().find(a => a.id === currentId()) || null;
  const nameTaken = (name, except) => accounts().some(a => a.id !== except && a.name.trim().toLowerCase() === name.trim().toLowerCase());
  function createAccount(name) {
    name = name.trim();
    if (!name) throw new Error("Enter a name.");
    if (nameTaken(name)) throw new Error(`“${name}” already exists. Pick another name or switch to it.`);
    const a = { id: uid(), name, created: Date.now() };
    LS.set("tp.accounts", [...accounts(), a]);
    LS.set("tp.current", a.id);
    try { navigator.storage?.persist?.(); } catch {}
    return a;
  }
  const switchTo = id => LS.set("tp.current", id);
  function renameAccount(id, name) {
    name = name.trim();
    if (!name) throw new Error("Enter a name.");
    if (nameTaken(name, id)) throw new Error(`“${name}” already exists.`);
    LS.set("tp.accounts", accounts().map(a => (a.id === id ? { ...a, name } : a)));
  }
  function deleteAccount(id) {
    LS.set("tp.accounts", accounts().filter(a => a.id !== id));
    LS.del("tp.data." + id); LS.del("tp.draft." + id);
    if (LS.get("tp.current") === id) LS.set("tp.current", accounts()[0]?.id ?? null);
  }

  // ---------- per-account data ----------
  const blank = () => ({ settings: {}, sessions: [], bodyweight: [] });
  const data = (id = currentId()) => ({ ...blank(), ...LS.get("tp.data." + id, {}) });
  const saveData = (d, id = currentId()) => LS.set("tp.data." + id, d);
  const draft = (id = currentId()) => LS.get("tp.draft." + id, null);
  const saveDraft = (s, id = currentId()) => LS.set("tp.draft." + id, s);
  const clearDraft = (id = currentId()) => LS.del("tp.draft." + id);
  const sessions = (d = data()) => [...d.sessions].sort((a, b) => a.start - b.start);

  function saveSession(s) {
    const d = data();
    s.updated = Date.now();
    const i = d.sessions.findIndex(x => x.id === s.id);
    if (i >= 0) d.sessions[i] = s; else d.sessions.push(s);
    if (!d.settings.planStart) d.settings.planStart = ymd(monday(s.start));
    return saveData(d);
  }
  function deleteSession(id) { const d = data(); d.sessions = d.sessions.filter(s => s.id !== id); saveData(d); }

  function exportAll() {
    const out = { app: "powerbuilding-training", version: 1, exported: new Date().toISOString(), accounts: [] };
    for (const a of accounts()) out.accounts.push({ ...a, data: data(a.id) });
    return out;
  }
  // merge: accounts match by id, then by name; sessions by id (the newer edit wins); bodyweight by date
  function importAll(obj) {
    if (!obj || !Array.isArray(obj.accounts)) throw new Error("That file isn't a training backup.");
    let added = 0, merged = 0;
    for (const inc of obj.accounts) {
      let a = accounts().find(x => x.id === inc.id) || accounts().find(x => x.name.toLowerCase() === String(inc.name).toLowerCase());
      if (!a) { a = { id: inc.id || uid(), name: String(inc.name || "Imported"), created: inc.created || Date.now() }; LS.set("tp.accounts", [...accounts(), a]); added++; }
      else merged++;
      const d = data(a.id), src = { ...blank(), ...(inc.data || {}) };
      const byId = new Map(d.sessions.map(s => [s.id, s]));
      for (const s of src.sessions) { const old = byId.get(s.id); if (!old || (s.updated || 0) >= (old.updated || 0)) byId.set(s.id, s); }
      d.sessions = [...byId.values()];
      const bw = new Map(d.bodyweight.map(b => [b.date, b]));
      for (const b of src.bodyweight) bw.set(b.date, b);
      d.bodyweight = [...bw.values()].sort((x, y) => x.date.localeCompare(y.date));
      d.settings = { ...src.settings, ...d.settings };
      saveData(d, a.id);
    }
    if (!currentId() && accounts()[0]) switchTo(accounts()[0].id);
    return { added, merged };
  }

  // ---------- plan ----------
  let PLAN = null;
  const ready = fetch("plan.json").then(r => r.json()).then(p => (PLAN = p));
  const plan = () => PLAN;
  const exName = (slug, fallback) => (slug && PLAN?.ex[slug]?.name) || fallback || "Exercise";
  const exKey = e => e.slug || "c:" + e.name.trim().toLowerCase();

  function planStart(d = data()) {
    if (d.settings.planStart) return d.settings.planStart;
    const first = sessions(d)[0];
    return ymd(monday(first ? first.start : Date.now()));
  }
  function weekFor(ms, d = data()) {
    const w = Math.floor(daysBetween(parseYmd(planStart(d)), monday(ms)) / 7) + 1;
    return Math.min(12, Math.max(1, w));
  }
  const PHASE = w => (w <= 5 ? "Block 1" : w === 6 ? "Deload" : w <= 10 ? "Block 2" : w === 11 ? "Peak" : "Test week");

  const parsePresc = p => { const m = /(\d+) × ([^@·]+?)(?:\s*@\s*(.*))?$/.exec(p || ""); return m ? { sets: +m[1], reps: m[2].trim(), effort: m[3] || "" } : null; };

  function lastSets(key, d = data()) {   // most recent logged sets for an exercise, for weight prefill
    const ss = sessions(d);
    for (let i = ss.length - 1; i >= 0; i--) {
      const e = ss[i].exercises.find(x => exKey(x) === key && x.sets.some(s => s.r > 0));
      if (e) return e.sets.filter(s => s.r > 0);
    }
    return [];
  }

  // The day's exercises for a given plan week, with prefilled set rows.
  function template(week, day) {
    const P = PLAN, base = P.days[day];
    if (!base) return { title: "Workout", note: "", exercises: [] };
    let ex = base.ex.map((e, i) => ({ ...e, pos: i + 1 }));
    let note = "";
    if (week >= 7 && week <= 11) {
      ex = ex.map(e => {
        const sw = P.swaps[day]?.[e.slug]; if (!sw) return e;
        const pr = parsePresc(sw.presc) || {};
        return { ...e, slug: sw.slug, name: sw.name, sets: pr.sets || e.sets, reps: pr.reps || "", effort: pr.effort || e.effort };
      });
    }
    const L = P.loads[String(week)]?.[day] || {};
    if (week === 6) { note = "Deload: half the accessory sets (minimum 1), RIR 3–4. Nothing near failure."; ex = ex.map(e => (L[e.slug] ? e : { ...e, sets: Math.max(1, Math.floor(e.sets / 2)), effort: "RIR 3–4" })); }
    if (week === 11) {
      const w = P.week11[day];
      note = `Peak week. ${w.main}. Accessories: ${w.acc}.`;
      ex = ex.filter(e => !w.drop.includes(e.slug) && (L[e.slug] || !w.keep.length || w.keep.includes(e.pos)))
             .map(e => (L[e.slug] ? e : { ...e, sets: 2 }));
    }
    if (week === 12) {
      const w = P.week12[day];
      note = `Test week. ${w.text}.`;
      ex = w.ex.map(e => ({ slug: e.slug, name: e.name, sets: 1, reps: "", effort: "", rest: "", note: "" }));
    }
    const d = data();
    const exercises = ex.map(e => {
      const load = L[e.slug];
      const prev = lastSets(e.slug || "c:" + e.name.toLowerCase(), d);
      const lastW = i => prev[i]?.w ?? prev[prev.length - 1]?.w ?? "";
      const groups = load && !load.sets.length ? [...load.hint.matchAll(/(\d+) × (\d+|AMRAP)/g)] : [];   // a load hint without weights, e.g. "2 × 6 @ ~80% of week-5 top set"
      let rows = load?.sets?.length ? load.sets.map(s => ({ w: s.w, r: "", target: s.amrap ? "AMRAP" : String(s.r) }))
        : groups.length ? groups.flatMap(g => Array.from({ length: +g[1] }, () => g[2])).map((r, i) => ({ w: lastW(i), r: "", target: r }))
        : Array.from({ length: e.sets || 1 }, (_, i) => ({ w: lastW(i), r: "", target: e.reps || "" }));
      rows.forEach(r => (r.target = String(r.target).replace(/\s*per .*$/, "")));   // "8–10 per leg" won't fit a reps box
      return { slug: e.slug, name: e.name, plan: { sets: e.sets, reps: e.reps, effort: e.effort, rest: e.rest, note: e.note, hint: load?.hint || "" }, sets: rows };
    });
    return { title: base.title, note, exercises };
  }

  // ---------- metrics ----------
  const e1rm = (w, r) => (w > 0 && r > 0 ? (r === 1 ? w : w * (1 + r / 30)) : 0);
  const doneSets = e => e.sets.filter(s => Number(s.r) > 0);
  const sessionDur = s => (s.end && s.start ? Math.max(0, s.end - s.start) : 0);
  function sessionTotals(s) {
    let sets = 0, reps = 0, vol = 0;
    for (const e of s.exercises) for (const x of doneSets(e)) { sets++; reps += +x.r; vol += (+x.w || 0) * +x.r; }
    return { sets, reps, vol, dur: sessionDur(s) };
  }
  // every exercise ever logged: heaviest set, best e1RM, history
  function liftStats(ss) {
    const m = new Map();
    for (const s of ss) for (const e of s.exercises) {
      const done = doneSets(e); if (!done.length) continue;
      const k = exKey(e);
      const L = m.get(k) || { key: k, slug: e.slug, name: exName(e.slug, e.name), best: null, bestE: null, sessions: 0, vol: 0, sets: 0, hist: [] };
      L.sessions++;
      let top = null, sE = 0, sV = 0;
      for (const x of done) {
        const w = +x.w || 0, r = +x.r, est = e1rm(w, r);
        L.sets++; sV += w * r;
        if (!L.best || w > L.best.w || (w === L.best.w && r > L.best.r)) L.best = { w, r, date: s.start };
        if (!L.bestE || est > L.bestE.v) L.bestE = { v: est, w, r, date: s.start };
        if (!top || w > top.w || (w === top.w && r > top.r)) top = { w, r };
        sE = Math.max(sE, est);
      }
      L.vol += sV;
      L.hist.push({ id: s.id, date: s.start, top, e1rm: sE, vol: sV, sets: done.map(x => ({ w: +x.w || 0, r: +x.r, rpe: x.rpe })) });
      m.set(k, L);
    }
    return [...m.values()];
  }
  function prs(ss) {   // a PR = beating your own previous best weight or e1RM on an exercise (first time doesn't count)
    const best = new Map(), out = [];
    for (const s of ss) for (const e of s.exercises) {
      const done = doneSets(e); if (!done.length) continue;
      const k = exKey(e), b = best.get(k);
      const w = Math.max(...done.map(x => +x.w || 0)), est = Math.max(...done.map(x => e1rm(+x.w || 0, +x.r)));
      const r = Math.max(...done.filter(x => (+x.w || 0) === w).map(x => +x.r));
      if (b) {
        if (w > b.w) out.push({ sid: s.id, date: s.start, key: k, name: exName(e.slug, e.name), type: "Heaviest", text: `${fmtNum(w)} lb × ${r}`, prev: `${fmtNum(b.w)} lb` });
        else if (est > b.e + 0.5) out.push({ sid: s.id, date: s.start, key: k, name: exName(e.slug, e.name), type: "Est. 1RM", text: `${fmtNum(est)} lb`, prev: `${fmtNum(b.e)} lb` });
      }
      best.set(k, { w: Math.max(w, b?.w || 0), e: Math.max(est, b?.e || 0) });
    }
    return out;
  }
  // fractional sets: primary muscle 1, secondary 0.5 (the counting method in the report)
  function muscleSets(ss) {
    const m = new Map();
    const add = (mus, n, ex) => { const x = m.get(mus) || { muscle: mus, sets: 0, by: new Map() }; x.sets += n; x.by.set(ex, (x.by.get(ex) || 0) + n); m.set(mus, x); };
    for (const s of ss) for (const e of s.exercises) {
      const n = doneSets(e).length; if (!n) continue;
      const info = e.slug && PLAN.ex[e.slug], name = exName(e.slug, e.name);
      if (!info) { add("other", n, name); continue; }
      info.primary.forEach(p => add(p, n, name));
      info.secondary.forEach(p => add(p, n * 0.5, name));
    }
    return [...m.values()];
  }
  const REGION = { chest: "Push", shoulders: "Push", triceps: "Push", lats: "Pull", "middle back": "Pull", traps: "Pull", biceps: "Pull", forearms: "Pull", "lower back": "Pull", quadriceps: "Legs", hamstrings: "Legs", glutes: "Legs", calves: "Legs", adductors: "Legs", abductors: "Legs", abdominals: "Core", neck: "Pull", other: "Other" };

  // ---------- small UI helpers ----------
  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5h9l1-12.5M9.5 7V4.5h5V7"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    more: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
  };
  const icon = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;

  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // account chip in the header + account sheet (native <dialog>)
  function mountAccount(onChange) {
    const head = $("header");
    let chip = $("#acct");
    if (!chip) { chip = document.createElement("button"); chip.id = "acct"; chip.type = "button"; chip.className = "acct"; head.append(chip); }
    const paint = () => { const a = current(); chip.innerHTML = icon("user") + `<span>${a ? esc(a.name) : "Sign in"}</span>`; chip.setAttribute("aria-label", a ? `Account: ${a.name}. Switch or manage accounts` : "Create an account"); };
    paint();
    const hdr = () => document.documentElement.style.setProperty("--hdr", head.offsetHeight + "px");   // sticky Progress tabs sit under the header
    hdr(); addEventListener("resize", hdr);
    let dlg = $("#acct-sheet");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "acct-sheet"; dlg.className = "sheet"; document.body.append(dlg); }
    const render = (err = "") => {
      const cur = currentId();
      dlg.innerHTML = `<form method="dialog" class="sheet-in">
        <div class="sheet-head"><h2>Accounts</h2><button class="icon-btn" value="close" aria-label="Close">${icon("x")}</button></div>
        <p class="dim small">Saved on this device only. Use a backup file to move them to another phone.</p>
        <ul class="acct-list">${accounts().map(a => `<li class="${a.id === cur ? "on" : ""}">
          <button type="button" class="acct-pick" data-id="${a.id}">${icon(a.id === cur ? "check" : "user")}<span>${esc(a.name)}</span>${a.id === cur ? '<em>Signed in</em>' : ""}</button>
          <button type="button" class="link small" data-rename="${a.id}">Rename</button>
          <button type="button" class="link small danger" data-del="${a.id}">Delete</button></li>`).join("") || '<li class="dim">No accounts yet.</li>'}</ul>
        <label class="fld"><span>New account name</span><span class="row"><input id="acct-new" autocomplete="off" maxlength="40" placeholder="e.g. Aiden"><button type="button" class="btn primary" id="acct-add">Create</button></span></label>
        ${err ? `<p class="err" role="alert">${esc(err)}</p>` : ""}
        <div class="sheet-foot"><button type="button" class="btn" id="acct-export">Export backup</button>
          <label class="btn">Import backup<input type="file" id="acct-import" accept="application/json,.json" hidden></label></div>
      </form>`;
    };
    const refresh = () => { paint(); onChange?.(); };
    dlg.onclick = e => {
      const t = e.target.closest("button,[data-id]"); if (!t) { if (e.target === dlg) dlg.close(); return; }
      try {
        if (t.dataset.id) { switchTo(t.dataset.id); dlg.close(); refresh(); toast(`Signed in as ${current().name}`); }
        else if (t.id === "acct-add") { const a = createAccount($("#acct-new", dlg).value); dlg.close(); refresh(); toast(`Created ${a.name}`); }
        else if (t.dataset.rename) { const a = accounts().find(x => x.id === t.dataset.rename); const n = prompt("New name", a.name); if (n != null) { renameAccount(a.id, n); render(); paint(); } }
        else if (t.dataset.del) {
          const a = accounts().find(x => x.id === t.dataset.del), n = data(a.id).sessions.length;
          if (confirm(`Delete “${a.name}” and its ${n} workout${n === 1 ? "" : "s"}? This can't be undone. Export a backup first if you might want them.`)) { deleteAccount(a.id); render(); refresh(); }
        }
        else if (t.id === "acct-export") downloadBackup();
      } catch (er) { render(er.message); }
    };
    dlg.onchange = async e => {
      if (e.target.id !== "acct-import" || !e.target.files[0]) return;
      try { const r = importAll(JSON.parse(await e.target.files[0].text())); dlg.close(); refresh(); toast(`Imported: ${r.added} new, ${r.merged} merged account${r.merged === 1 ? "" : "s"}`); }
      catch (er) { render(er instanceof SyntaxError ? "That file isn't valid JSON." : er.message); }
    };
    dlg.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "acct-new") { e.preventDefault(); $("#acct-add", dlg).click(); } });
    chip.onclick = () => { render(); dlg.showModal(); };
    return { open: () => chip.click(), paint };
  }
  async function downloadBackup() {
    const name = `training-backup-${ymd(new Date())}.json`;
    const blob = new Blob([JSON.stringify(exportAll(), null, 1)], { type: "application/json" });
    const file = new File([blob], name, { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === "AbortError") return; } }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5e3);
  }
  // inline "create your first account" panel used by both pages
  function signupPanel(el, onDone) {
    el.innerHTML = `<section class="panel signup"><h2>Create an account</h2>
      <p class="dim">Just a name. Your workouts and stats are saved under it on this device.</p>
      <form class="row" id="su"><input id="su-name" autocomplete="off" maxlength="40" placeholder="Your name" aria-label="Account name" required><button class="btn primary">Create</button></form>
      <p class="err" id="su-err" role="alert" hidden></p>
      <p class="dim small">Have a backup file? Use the account button at the top right to import it.</p></section>`;
    $("#su", el).onsubmit = e => {
      e.preventDefault();
      try { createAccount($("#su-name", el).value); onDone(); } catch (er) { const p = $("#su-err", el); p.hidden = false; p.textContent = er.message; }
    };
  }

  return { LS, uid, esc, $, DAY, ymd, parseYmd, monday, daysBetween, DAYKEYS, DAYNAMES, toInput, fromInput, fmtDate, fmtTime, fmtDur, fmtClock, fmtNum,
    accounts, current, currentId, createAccount, switchTo, data, saveData, draft, saveDraft, clearDraft, sessions, saveSession, deleteSession,
    exportAll, importAll, ready, plan, exName, exKey, planStart, weekFor, PHASE, template, lastSets,
    e1rm, doneSets, sessionTotals, sessionDur, liftStats, prs, muscleSets, REGION, icon, toast, mountAccount, signupPanel };
})();
