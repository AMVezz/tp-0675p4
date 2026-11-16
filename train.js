/* Train page: start today's planned session (prefilled from plan.json), log weight × reps per set, finish with times.
   The in-progress session is saved as a draft on every keystroke, so closing the app mid-workout loses nothing. */
"use strict";
(() => {
  const { $, esc, icon, fmtNum, fmtDur, fmtClock, fmtDate, fmtTime, toInput, fromInput } = TP;
  const app = $("#app");
  let S = null, mode = "start", timer = null;   // mode: start | session | finish

  const num = v => (v === "" || v == null || isNaN(+v) ? "" : +v);
  const persist = () => { if (S && !S.saved) TP.saveDraft(S); };

  function newSession(week, day, empty) {
    const t = empty ? { title: "Workout", note: "", exercises: [] } : TP.template(week, day);
    return { id: TP.uid(), week, day, title: t.title, note: t.note, start: Date.now(), end: null, notes: "",
             exercises: t.exercises.map(e => ({ ...e, id: TP.uid() })) };
  }

  // ---------- start screen ----------
  function renderStart() {
    mode = "start"; stopTimer();
    if (!TP.current()) return TP.signupPanel(app, route);
    const now = Date.now(), d = TP.data(), week = TP.weekFor(now, d), day = TP.DAYKEYS[new Date().getDay()];
    const P = TP.plan(), rest = day === "sun";
    const t = rest ? null : TP.template(week, day);
    const recent = TP.sessions(d).slice(-5).reverse();
    const weekOpts = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}"${i + 1 === week ? " selected" : ""}>Week ${i + 1} · ${TP.PHASE(i + 1)}</option>`).join("");
    const dayOpts = Object.keys(P.days).map(k => `<option value="${k}"${k === (rest ? "mon" : day) ? " selected" : ""}>${TP.DAYNAMES[k]} · ${esc(P.days[k].title)}</option>`).join("");
    app.innerHTML = `
      <section class="panel today-card">
        <p class="meta">Week ${week} of 12 · ${TP.PHASE(week)}</p>
        ${rest ? `<h2>Sunday is a rest day</h2><p class="dim">Pick another session below if you're making one up.</p>`
               : `<h2>${TP.DAYNAMES[day]} · ${esc(t.title)}</h2>
        ${t.note ? `<p class="note-line">${esc(t.note)}</p>` : ""}
        <ol class="preview">${t.exercises.map(e => `<li><span>${esc(e.name)}</span><span class="dim">${e.sets.length} × ${esc(e.sets[0]?.target || e.plan.reps || "")}</span></li>`).join("")}</ol>
        <button class="btn primary big" id="go-today">${icon("plus")}Start workout</button>`}
      </section>
      <section class="panel">
        <h2 class="h-sm">Another session</h2>
        <div class="pick"><label class="fld"><span>Week</span><select id="pk-week">${weekOpts}</select></label>
        <label class="fld"><span>Day</span><select id="pk-day">${dayOpts}</select></label></div>
        <div class="row wrap"><button class="btn" id="go-pick">Start this session</button><button class="btn" id="go-empty">Empty workout</button></div>
        <p class="dim small">Plan week 1 began ${fmtDate(TP.parseYmd(TP.planStart(d)).getTime(), { weekday: "short", month: "short", day: "numeric", year: "numeric" })}.
          <button class="link small" id="chg-start">Change</button></p>
        <form id="start-form" class="row" hidden><input type="date" id="start-date" value="${TP.planStart(d)}" aria-label="Plan start date"><button class="btn">Save</button></form>
      </section>
      <section class="panel">
        <div class="row between"><h2 class="h-sm">Recent workouts</h2>${recent.length ? '<a class="small" href="progress.html#history">All history</a>' : ""}</div>
        ${recent.length ? `<ul class="list">${recent.map(sessionRow).join("")}</ul>` : '<p class="dim">No workouts yet. Your first one will show up here.</p>'}
      </section>`;
    $("#go-today")?.addEventListener("click", () => begin(week, day));
    $("#go-pick").onclick = () => begin(+$("#pk-week").value, $("#pk-day").value);
    $("#go-empty").onclick = () => begin(week, rest ? "mon" : day, true);
    $("#chg-start").onclick = () => { $("#start-form").hidden = false; $("#start-date").focus(); };
    $("#start-form").onsubmit = e => {
      e.preventDefault(); const v = $("#start-date").value; if (!v) return;
      const dd = TP.data(); dd.settings.planStart = TP.ymd(TP.monday(TP.parseYmd(v))); TP.saveData(dd); renderStart(); TP.toast("Plan start updated");
    };
  }
  function sessionRow(s) {
    const t = TP.sessionTotals(s);
    return `<li><a href="train.html#edit=${s.id}"><span><b>${esc(s.title)}</b><span class="dim small">${fmtDate(s.start, { weekday: "short", month: "short", day: "numeric" })} · Wk ${s.week}</span></span>
      <span class="nums">${fmtDur(t.dur)}<span class="dim small">${t.sets} sets · ${fmtNum(t.vol)} lb</span></span>${icon("chev")}</a></li>`;
  }
  function begin(week, day, empty) {
    S = newSession(week, day, empty); persist();
    renderSession();
    window.scrollTo(0, 0);
  }

  // ---------- active / editing session ----------
  const planLine = p => [p.sets && p.reps ? `${p.sets} × ${p.reps}` : p.reps, p.effort, p.rest && `rest ${p.rest}`].filter(Boolean).join(" · ");
  function exHtml(e, i) {
    const info = e.slug && TP.plan().ex[e.slug];
    const thumb = info ? `<img class="thumb" src="${info.img}" alt="" loading="lazy">` : `<span class="thumb blank"></span>`;
    const name = info ? `<a class="lift-name" href="exercises.html#${e.slug}">${esc(e.name)}</a>` : `<span class="lift-name">${esc(e.name)}</span>`;
    const p = e.plan || {};
    return `<article class="lift" data-i="${i}">
      <div class="lift-head">${thumb}<div class="lift-title">${name}${planLine(p) ? `<p class="lift-plan">${esc(planLine(p))}</p>` : ""}</div>
        <details class="more"><summary aria-label="Options for ${esc(e.name)}">${icon("more")}</summary><div class="menu-pop">
          ${i > 0 ? `<button type="button" data-act="up">${icon("up")}Move up</button>` : ""}
          ${i < S.exercises.length - 1 ? `<button type="button" data-act="down">${icon("down")}Move down</button>` : ""}
          <button type="button" data-act="rm-ex" class="danger">${icon("trash")}Remove exercise</button></div></details></div>
      ${p.hint ? `<p class="hint"><b>Plan</b> ${esc(p.hint)}</p>` : ""}${p.note ? `<p class="lift-note dim small">${esc(p.note)}</p>` : ""}
      <div class="sets" role="table" aria-label="${esc(e.name)} sets">
        <div class="set set-h" role="row"><span role="columnheader">Set</span><span role="columnheader">lb</span><span role="columnheader">Reps</span><span role="columnheader">RPE</span><span role="columnheader"><span class="sr">Done</span></span></div>
        ${e.sets.map((s, j) => setHtml(s, j)).join("")}
      </div>
      <div class="lift-foot"><button type="button" class="btn ghost" data-act="add-set">${icon("plus")}Add set</button>
        ${e.sets.length > 1 ? `<button type="button" class="link small" data-act="rm-set">Remove last set</button>` : ""}</div>
    </article>`;
  }
  function setHtml(s, j) {
    const done = num(s.r) > 0;
    return `<div class="set${done ? " is-done" : ""}" role="row" data-j="${j}"><span class="n" role="cell">${j + 1}</span>
      <input role="cell" data-f="w" inputmode="decimal" enterkeyhint="next" value="${esc(s.w)}" aria-label="Set ${j + 1} weight in pounds" placeholder="–">
      <input role="cell" data-f="r" inputmode="numeric" enterkeyhint="next" value="${esc(s.r)}" aria-label="Set ${j + 1} reps" placeholder="${esc(s.target || "reps")}">
      <input role="cell" data-f="rpe" inputmode="decimal" enterkeyhint="done" value="${esc(s.rpe ?? "")}" aria-label="Set ${j + 1} RPE (optional)" placeholder="–">
      <button type="button" role="cell" class="done" data-act="done" aria-pressed="${done}" aria-label="${done ? "Undo" : "Mark"} set ${j + 1} done">${icon("check")}</button></div>`;
  }
  function renderSession() {
    mode = "session";
    const editing = !!S.saved;
    app.innerHTML = `
      <section class="panel sess-head">
        <p class="meta">${S.week ? `Week ${S.week} · ${TP.PHASE(S.week)} · ` : ""}${TP.DAYNAMES[S.day] || ""}</p>
        <h2>${esc(S.title)}</h2>
        ${S.note ? `<p class="note-line">${esc(S.note)}</p>` : ""}
        <div class="times"><label class="fld"><span>Start</span><input type="datetime-local" id="t-start" value="${toInput(S.start)}"></label>
        ${editing ? `<label class="fld"><span>End</span><input type="datetime-local" id="t-end" value="${S.end ? toInput(S.end) : ""}"></label>` : ""}</div>
      </section>
      <div id="lifts">${S.exercises.map(exHtml).join("") || '<p class="dim empty">No exercises yet. Add one below.</p>'}</div>
      <section class="panel add-ex" id="add-ex">
        <button type="button" class="btn ghost wide" id="add-open">${icon("plus")}Add exercise</button>
        <div id="add-panel" hidden><label class="fld"><span>Find or type an exercise</span><input id="add-q" autocomplete="off" placeholder="e.g. hack squat"></label><ul class="pick-list" id="add-list"></ul></div>
      </section>
      <section class="panel"><label class="fld"><span>Notes</span><textarea id="s-notes" rows="3" placeholder="How it felt, pain, sleep, anything worth remembering">${esc(S.notes)}</textarea></label>
        ${editing ? `<button type="button" class="link danger" id="del-sess">${icon("trash")}Delete this workout</button>` : `<button type="button" class="link danger" id="discard">Discard workout</button>`}</section>
      <div class="dock" role="region" aria-label="Workout status">
        <div class="dock-in"><div class="dock-stats">${editing ? "" : `<span class="clock">${icon("clock")}<b id="elapsed">${fmtClock(Date.now() - S.start)}</b></span>`}<span id="dock-tot" class="dim"></span></div>
        ${editing ? `<a class="btn" href="train.html">Cancel</a><button class="btn primary" id="save-edit">Save changes</button>` : `<button class="btn primary" id="finish">Finish</button>`}</div>
      </div>`;
    totals();
    if (!editing) startTimer();
  }
  function totals() {
    const t = TP.sessionTotals(S), el = $("#dock-tot");
    if (el) el.textContent = `${t.sets} set${t.sets === 1 ? "" : "s"} · ${fmtNum(t.vol)} lb`;
  }
  function startTimer() { stopTimer(); timer = setInterval(() => { const el = $("#elapsed"); if (el) el.textContent = fmtClock(Date.now() - S.start); }, 1000); }
  function stopTimer() { clearInterval(timer); timer = null; }

  function redrawLift(i) {
    const old = app.querySelector(`.lift[data-i="${i}"]`);
    if (old) old.outerHTML = exHtml(S.exercises[i], i);
  }
  const redrawLifts = () => { $("#lifts").innerHTML = S.exercises.map(exHtml).join("") || '<p class="dim empty">No exercises yet. Add one below.</p>'; };

  // all session interactions are delegated from #app
  app.addEventListener("input", e => {
    if (mode === "start") return;
    const t = e.target, set = t.closest(".set"), lift = t.closest(".lift");
    if (set && lift && t.dataset.f) {
      const s = S.exercises[+lift.dataset.i].sets[+set.dataset.j];
      s[t.dataset.f] = t.value.replace(",", ".");
      const done = num(s.r) > 0;
      set.classList.toggle("is-done", done);
      const b = set.querySelector(".done"); b.setAttribute("aria-pressed", done); b.setAttribute("aria-label", `${done ? "Undo" : "Mark"} set ${+set.dataset.j + 1} done`);
      totals(); persist(); return;
    }
    if (t.id === "s-notes") { S.notes = t.value; persist(); }
    if (t.id === "add-q") fillAddList(t.value);
  });
  app.addEventListener("change", e => {
    const t = e.target;
    if (t.id === "t-start") { const v = fromInput(t.value); if (v) { S.start = v; persist(); } }
    if (t.id === "t-end") { S.end = fromInput(t.value); }
    if (t.id === "f-start") { const v = fromInput(t.value); if (v) { S.start = v; renderFinish(); } }
    if (t.id === "f-end") { const v = fromInput(t.value); if (v) { S.end = v; renderFinish(); } }
  });
  app.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || mode === "start") return;
    const lift = b.closest(".lift"), i = lift ? +lift.dataset.i : -1, ex = S.exercises[i];
    switch (b.dataset.act) {
      case "done": {
        const j = +b.closest(".set").dataset.j, s = ex.sets[j], row = b.closest(".set");
        if (num(s.r) > 0) { s.r = ""; row.querySelector('[data-f="r"]').value = ""; }
        else if (/^\d+$/.test(s.target || "")) { s.r = s.target; row.querySelector('[data-f="r"]').value = s.target; }
        else { row.querySelector('[data-f="r"]').focus(); return; }
        row.querySelector('[data-f="r"]').dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
      case "add-set": { const last = ex.sets[ex.sets.length - 1] || {}; ex.sets.push({ w: last.w ?? "", r: "", target: last.target || ex.plan?.reps || "" }); persist(); redrawLift(i); totals(); app.querySelector(`.lift[data-i="${i}"] .set:last-child [data-f="r"]`)?.focus(); return; }
      case "rm-set": ex.sets.pop(); persist(); redrawLift(i); totals(); return;
      case "rm-ex":
        if (TP.doneSets(ex).length && !confirm(`Remove ${ex.name} and its logged sets?`)) return;
        S.exercises.splice(i, 1); persist(); redrawLifts(); totals(); return;
      case "up": case "down": {
        const k = b.dataset.act === "up" ? i - 1 : i + 1;
        [S.exercises[i], S.exercises[k]] = [S.exercises[k], S.exercises[i]]; persist(); redrawLifts(); return;
      }
    }
    if (b.id === "add-open") { $("#add-panel").hidden = false; b.hidden = true; fillAddList(""); $("#add-q").focus(); }
    if (b.dataset.slug !== undefined || b.dataset.custom !== undefined) addExercise(b.dataset.slug || null, b.dataset.custom);
    if (b.id === "finish") { S.end = Date.now(); renderFinish(); window.scrollTo(0, 0); }
    if (b.id === "discard" && confirm("Discard this workout? Nothing from it will be saved.")) { TP.clearDraft(); S = null; renderStart(); }
    if (b.id === "save-edit") saveEdit();
    if (b.id === "del-sess" && confirm("Delete this workout? This can't be undone.")) { TP.deleteSession(S.id); S = null; location.hash = ""; renderStart(); TP.toast("Workout deleted"); }
    if (b.id === "f-back") renderSession();
    if (b.id === "f-save") finishSave();
  });
  app.addEventListener("keydown", e => {   // Enter on the keypad moves weight -> reps -> next set's weight
    if (e.key !== "Enter" || !e.target.dataset?.f) return;
    e.preventDefault();
    const ins = [...app.querySelectorAll(".set input")];
    ins[ins.indexOf(e.target) + 1]?.focus();
  });

  function fillAddList(q) {
    const P = TP.plan(), ql = q.trim().toLowerCase();
    const hits = Object.entries(P.ex).filter(([s, x]) => !ql || x.name.toLowerCase().includes(ql) || s.includes(ql)).slice(0, 12);
    $("#add-list").innerHTML = hits.map(([s, x]) => `<li><button type="button" data-slug="${s}"><img class="thumb" src="${x.img}" alt="" loading="lazy"><span>${esc(x.name)}<span class="dim small">${esc(x.group)}</span></span></button></li>`).join("")
      + (ql ? `<li><button type="button" data-custom="${esc(q.trim())}">${icon("plus")}<span>Add “${esc(q.trim())}” as a custom exercise</span></button></li>` : "");
  }
  function addExercise(slug, custom) {
    const name = slug ? TP.plan().ex[slug].name : custom;
    const prev = TP.lastSets(slug || "c:" + name.toLowerCase());
    S.exercises.push({ id: TP.uid(), slug, name, plan: {}, sets: Array.from({ length: Math.max(3, prev.length) }, (_, j) => ({ w: prev[j]?.w ?? prev[0]?.w ?? "", r: "", target: prev[j] ? String(prev[j].r) : "" })) });
    persist(); renderSession();
    app.querySelector(".lift:last-of-type")?.scrollIntoView({ block: "center" });
  }

  // ---------- finish ----------
  const cleaned = () => ({ ...S, exercises: S.exercises.map(e => ({ ...e, sets: e.sets.filter(s => num(s.r) > 0).map(s => ({ w: num(s.w) || 0, r: num(s.r), ...(num(s.rpe) ? { rpe: num(s.rpe) } : {}) })) })).filter(e => e.sets.length) });
  function newPrs(clean) {
    const all = TP.sessions().filter(s => s.id !== clean.id).concat(clean).sort((a, b) => a.start - b.start);
    return TP.prs(all).filter(p => p.sid === clean.id);
  }
  function renderFinish() {
    mode = "finish"; stopTimer();
    const c = cleaned(), t = TP.sessionTotals({ ...c, end: S.end }), bad = S.end <= S.start, prs = newPrs(c);
    app.innerHTML = `<section class="panel finish">
      <h2>Finish workout</h2>
      <div class="times"><label class="fld"><span>Start</span><input type="datetime-local" id="f-start" value="${toInput(S.start)}"></label>
      <label class="fld"><span>End</span><input type="datetime-local" id="f-end" value="${toInput(S.end)}"></label></div>
      ${bad ? '<p class="err" role="alert">The end time is before the start time. Fix one of them to save.</p>' : ""}
      <dl class="stats"><div><dt>Duration</dt><dd>${fmtDur(S.end - S.start)}</dd></div><div><dt>Sets</dt><dd>${t.sets}</dd></div>
        <div><dt>Reps</dt><dd>${fmtNum(t.reps)}</dd></div><div><dt>Volume</dt><dd>${fmtNum(t.vol)}<small> lb</small></dd></div></dl>
      ${prs.length ? `<h3 class="h-sm">New records</h3><ul class="pr-list">${prs.map(p => `<li><b>${esc(p.name)}</b><span>${p.type}: ${p.text}</span><span class="dim small">was ${p.prev}</span></li>`).join("")}</ul>` : ""}
      ${t.sets ? "" : '<p class="err" role="alert">No sets logged yet. Enter reps for at least one set, or discard the workout.</p>'}
      <div class="row wrap"><button class="btn primary big" id="f-save"${bad || !t.sets ? " disabled" : ""}>${icon("check")}Save workout</button><button class="btn" id="f-back">Keep training</button></div>
    </section>`;
  }
  function finishSave() {
    const c = cleaned(); delete c.saved;
    c.saved = true;
    TP.saveSession(c); TP.clearDraft(); S = null;
    TP.toast("Workout saved");
    location.hash = ""; renderStart();
    window.scrollTo(0, 0);
  }
  function saveEdit() {
    if (S.end && S.end <= S.start) return TP.toast("End time must be after the start time.");
    const c = cleaned(); TP.saveSession(c); S = null; location.hash = ""; renderStart(); TP.toast("Changes saved");
  }

  // ---------- routing ----------
  function route() {
    acct.paint();
    const m = /edit=([\w]+)/.exec(location.hash);
    if (m) {
      const s = TP.data().sessions.find(x => x.id === m[1]);
      if (s) { S = JSON.parse(JSON.stringify(s)); S.saved = true; S.exercises.forEach(e => { e.plan ||= {}; e.sets.forEach(x => (x.target = "")); }); return renderSession(); }
    }
    const d = TP.current() && TP.draft();
    if (d) { S = d; return renderSession(); }
    S = null; renderStart();
  }
  const acct = TP.mountAccount(() => { S = null; location.hash = ""; route(); });
  window.addEventListener("hashchange", route);
  TP.ready.then(route).catch(() => { app.innerHTML = '<p class="err">Couldn\'t load the plan data. Open the app once with a connection so it can save everything for offline use.</p>'; });
})();
