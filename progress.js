/* Progress page: overview, every lift (heaviest first), muscle-group volume, history. Charts are hand-built SVG,
   drawn at the container's real width so text stays 1:1 on a phone and on a desktop. */
"use strict";
(() => {
  const { $, esc, icon, fmtNum, fmtDur, fmtDate, DAY } = TP;
  const app = $("#app");
  const RANGES = [[4, "4 weeks"], [12, "12 weeks"], [0, "All time"]];
  let range = TP.LS.get("tp.range", 12);
  const charts = new Map();
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------- data helpers ----------
  function rangeStart(ss) {
    const thisMon = TP.monday(Date.now()).getTime();
    if (range) return thisMon - (range - 1) * 7 * DAY;
    return ss.length ? TP.monday(ss[0].start).getTime() : thisMon;
  }
  function weeks(from) {   // Monday timestamps from `from` to this week
    const out = [], end = TP.monday(Date.now()).getTime();
    for (let t = from; t <= end + 1; t = TP.monday(t + 8 * DAY).getTime()) out.push(t);
    return out;
  }
  const weekIdx = (ws, ms) => { const m = TP.monday(ms).getTime(); return ws.findIndex(w => Math.abs(w - m) < DAY); };
  const latestBw = d => d.bodyweight.length ? d.bodyweight[d.bodyweight.length - 1] : null;

  // ---------- charts ----------
  // spec: {type:'bar'|'line', rows:[{x,label,v,tip}], fmt, series2?:[{x,v,tip}], legend?:[...], h}
  function chart(id, spec, title, tableHead) {
    charts.set(id, spec);
    const rows = spec.rows;
    const table = `<details class="as-table"><summary>Show as table</summary><div class="tbl"><table class="plain"><thead><tr><th>${esc(tableHead[0])}</th><th>${esc(tableHead[1])}</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.label)}</td><td>${esc(spec.fmt(r.v))}</td></tr>`).join("")}</tbody></table></div></details>`;
    const legend = spec.legend ? `<ul class="legend">${spec.legend.map(l => `<li><i class="sw ${l.cls}"></i>${esc(l.text)}</li>`).join("")}</ul>` : "";
    return `<figure class="fig"><figcaption>${title}</figcaption>${legend}<div class="chart" data-chart="${id}" role="img" aria-label="${esc(title.replace(/<[^>]+>/g, ""))}"></div>${table}</figure>`;
  }
  const niceMax = v => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
  function drawCharts() {
    for (const el of app.querySelectorAll(".chart[data-chart]")) {
      const s = charts.get(el.dataset.chart); if (!s) continue;
      const W = Math.max(260, el.clientWidth), H = s.h || 170, L = 44, R = 10, T = 12, B = 26;
      const iw = W - L - R, ih = H - T - B;
      const vals = s.rows.map(r => r.v).concat((s.series2 || []).map(r => r.v));
      let lo = 0, hi = niceMax(Math.max(...vals, 0));
      if (s.type === "line") {   // zoom the y range around the data, the way a weight or e1RM trend needs
        const mn = Math.min(...vals), mx = Math.max(...vals), pad = Math.max(2, (mx - mn) * 0.15);
        lo = Math.max(0, Math.floor((mn - pad) / 5) * 5); hi = Math.ceil((mx + pad) / 5) * 5; if (hi === lo) hi = lo + 5;
      }
      const y = v => T + ih - ((v - lo) / (hi - lo)) * ih;
      let g = "";
      const div = [5, 4, 3, 2].find(k => { const st = (hi - lo) / k, m = st / 10 ** Math.floor(Math.log10(st)); return [1, 2, 2.5, 5].some(x => Math.abs(x - m) < 1e-9); }) || 4;
      for (let k = 0; k <= div; k++) {   // recessive grid + y labels on round steps
        const v = lo + ((hi - lo) * k) / div, yy = y(v).toFixed(1);
        g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text class="ax" x="${L - 6}" y="${(+yy + 4).toFixed(1)}" text-anchor="end">${esc(s.axis ? s.axis(v) : fmtNum(v))}</text>`;
      }
      let marks = "", hits = "";
      const n = s.rows.length, every = Math.ceil(n / Math.max(2, Math.floor(iw / 54)));
      if (s.type === "bar") {
        const slot = iw / Math.max(n, 1), bw = Math.max(3, Math.min(28, slot - 2));
        s.rows.forEach((r, i) => {
          const cx = L + slot * i + slot / 2, top = y(r.v), x0 = cx - bw / 2, rad = Math.min(4, bw / 2, (T + ih - top));
          if (r.v > 0) marks += `<path class="bar" d="M${x0},${T + ih}V${top + rad}Q${x0},${top} ${x0 + rad},${top}H${x0 + bw - rad}Q${x0 + bw},${top} ${x0 + bw},${top + rad}V${T + ih}Z"/>`;
          hits += `<rect class="hit" x="${(cx - slot / 2).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${ih}" data-tip="${esc(r.tip)}" tabindex="-1"/>`;
          if (i % every === 0 || i === n - 1) marks += `<text class="ax" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(r.label)}</text>`;
        });
      } else {
        const xs = s.rows.map(r => r.x).concat((s.series2 || []).map(r => r.x));
        const x0 = Math.min(...xs), x1 = Math.max(...xs), span = Math.max(x1 - x0, DAY);
        const x = t => L + (n === 1 && !s.series2 ? iw / 2 : ((t - x0) / span) * iw);
        if (s.series2) s.series2.forEach(p => { marks += `<circle class="dot2" cx="${x(p.x).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3"/>`; hits += `<circle class="hit" cx="${x(p.x).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="10" data-tip="${esc(p.tip)}"/>`; });
        if (n > 1) marks += `<path class="line" d="${s.rows.map((r, i) => (i ? "L" : "M") + x(r.x).toFixed(1) + "," + y(r.v).toFixed(1)).join("")}"/>`;
        s.rows.forEach(r => {
          if (!s.noDots) marks += `<circle class="dot" cx="${x(r.x).toFixed(1)}" cy="${y(r.v).toFixed(1)}" r="4"/>`;
          hits += `<circle class="hit" cx="${x(r.x).toFixed(1)}" cy="${y(r.v).toFixed(1)}" r="14" data-tip="${esc(r.tip)}"/>`;
        });
        const lab = [x0, x1].filter((t, i, a) => i === 0 || t !== a[0]);
        lab.forEach((t, i) => (marks += `<text class="ax" x="${x(t).toFixed(1)}" y="${H - 8}" text-anchor="${lab.length === 1 ? "middle" : i ? "end" : "start"}">${esc(fmtDate(t))}</text>`));
      }
      el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}<line class="base" x1="${L}" x2="${W - R}" y1="${T + ih}" y2="${T + ih}"/>${marks}${hits}</svg>`;
    }
  }
  // one shared tooltip for every chart mark and calendar cell; tap or hover
  const tip = document.createElement("div"); tip.className = "tip"; tip.setAttribute("role", "tooltip"); document.body.append(tip);
  let tipFor = null;
  function showTip(t) {
    tipFor = t; tip.textContent = t.dataset.tip; tip.classList.add("show");
    const r = t.getBoundingClientRect(), tw = tip.offsetWidth;
    tip.style.left = Math.min(innerWidth - tw - 8, Math.max(8, r.left + r.width / 2 - tw / 2)) + "px";
    tip.style.top = Math.max(8, r.top + scrollY - tip.offsetHeight - 8) + "px";
    app.querySelectorAll(".is-hot").forEach(x => x.classList.remove("is-hot")); t.classList.add("is-hot");
  }
  const hideTip = () => { tip.classList.remove("show"); tipFor?.classList.remove("is-hot"); tipFor = null; };
  app.addEventListener("pointerover", e => { const t = e.target.closest("[data-tip]"); if (t && e.pointerType === "mouse") showTip(t); });
  app.addEventListener("pointerout", e => { if (e.pointerType === "mouse" && e.target.closest("[data-tip]")) hideTip(); });
  document.addEventListener("click", e => { const t = e.target.closest?.("[data-tip]"); if (t && app.contains(t)) { tipFor === t ? hideTip() : showTip(t); } else hideTip(); });
  addEventListener("scroll", hideTip, { passive: true });
  let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(drawCharts, 120); });

  // ---------- views ----------
  const tabs = cur => `<nav class="seg tabs" aria-label="Progress sections">${[["overview", "Overview"], ["lifts", "Lifts"], ["muscles", "Muscles"], ["history", "History"]]
    .map(([k, n]) => `<a href="#${k}"${k === cur ? ' aria-current="page" class="on"' : ""}>${n}</a>`).join("")}</nav>`;
  const rangeSeg = () => `<div class="seg range" role="group" aria-label="Time range">${RANGES.map(([v, n]) => `<button type="button" data-range="${v}" aria-pressed="${v === range}"${v === range ? ' class="on"' : ""}>${n}</button>`).join("")}</div>`;
  const rangeLabel = () => RANGES.find(r => r[0] === range)[1].toLowerCase();

  function overview(d, all) {
    const from = rangeStart(all), ss = all.filter(s => s.start >= from), ws = weeks(from);
    const tot = ss.reduce((a, s) => { const t = TP.sessionTotals(s); a.sets += t.sets; a.reps += t.reps; a.vol += t.vol; a.dur += t.dur; return a; }, { sets: 0, reps: 0, vol: 0, dur: 0 });
    const thisWeek = all.filter(s => s.start >= TP.monday(Date.now()).getTime()).length;
    let streak = 0;   // consecutive weeks with at least one workout, counting back from this week (or last week if this one is empty so far)
    { let w = TP.monday(Date.now()).getTime(); const has = t => all.some(s => TP.monday(s.start).getTime() === t);
      if (!has(w)) w = TP.monday(w - 3 * DAY).getTime();
      while (has(w)) { streak++; w = TP.monday(w - 3 * DAY).getTime(); } }
    const lifts = TP.liftStats(all), big = ["back-squat", "bench-press", "deadlift"].map(k => lifts.find(l => l.key === k)?.bestE?.v || 0);
    const total = big.reduce((a, b) => a + b, 0), bw = latestBw(d);
    const rpes = ss.flatMap(s => s.exercises.flatMap(e => TP.doneSets(e).map(x => +x.rpe).filter(Boolean)));
    const per = ws.map(w => ({ w, vol: 0, sets: 0, dur: 0, n: 0 }));
    ss.forEach(s => { const i = weekIdx(ws, s.start); if (i < 0) return; const t = TP.sessionTotals(s); per[i].vol += t.vol; per[i].sets += t.sets; per[i].dur += t.dur; per[i].n++; });
    const wl = w => fmtDate(w);
    const recs = TP.prs(all).filter(p => p.date >= from).reverse().slice(0, 8);

    const stat = (k, v, sub = "") => `<div><dt>${k}</dt><dd>${v}</dd>${sub ? `<p class="sub">${sub}</p>` : ""}</div>`;
    return `
      <dl class="stats wide">
        ${stat("Workouts", fmtNum(ss.length), `${thisWeek} of 6 this week`)}
        ${stat("Training time", fmtDur(tot.dur), ss.length ? `${fmtDur(tot.dur / ss.length)} per workout` : "")}
        ${stat("Volume", `${fmtNum(tot.vol)}<small> lb</small>`, ss.length ? `${fmtNum(tot.vol / ss.length)} lb per workout` : "")}
        ${stat("Sets · reps", `${fmtNum(tot.sets)}<small> · ${fmtNum(tot.reps)}</small>`, ss.length ? `${fmtNum(tot.sets / ss.length, 1)} sets per workout` : "")}
        ${stat("Week streak", `${streak}<small> wk</small>`, "weeks in a row with a workout")}
        ${stat("Big-3 est. total", total ? `${fmtNum(total)}<small> lb</small>` : "–", "best est. 1RM: squat + bench + deadlift")}
        ${stat("Relative strength", total && bw ? `${fmtNum(total / bw.lb, 2)}<small>× bw</small>` : "–", bw ? `at ${fmtNum(bw.lb, 1)} lb bodyweight` : "log bodyweight below")}
        ${stat("Average RPE", rpes.length ? fmtNum(rpes.reduce((a, b) => a + b, 0) / rpes.length, 1) : "–", rpes.length ? `${rpes.length} sets rated` : "rate sets on the Train page")}
      </dl>
      <section class="panel">${chart("vol", { type: "bar", rows: per.map(p => ({ label: wl(p.w), v: p.vol, tip: `Week of ${wl(p.w)}: ${fmtNum(p.vol)} lb in ${p.n} workout${p.n === 1 ? "" : "s"}` })), fmt: v => fmtNum(v) + " lb", axis: v => (v >= 1000 ? fmtNum(v / 1000, 1) + "k" : fmtNum(v)) }, "Volume per week <span>lb lifted (weight × reps)</span>", ["Week of", "Volume"])}</section>
      <div class="two">
        <section class="panel">${chart("sets", { type: "bar", rows: per.map(p => ({ label: wl(p.w), v: p.sets, tip: `Week of ${wl(p.w)}: ${p.sets} sets` })), fmt: v => fmtNum(v) + " sets" }, "Working sets per week", ["Week of", "Sets"])}</section>
        <section class="panel">${chart("time", { type: "bar", rows: per.map(p => ({ label: wl(p.w), v: Math.round(p.dur / 6e4), tip: `Week of ${wl(p.w)}: ${fmtDur(p.dur)}` })), fmt: v => fmtNum(v) + " min", axis: v => fmtNum(v) }, "Training time per week <span>minutes</span>", ["Week of", "Minutes"])}</section>
      </div>
      <section class="panel"><h2 class="h-sm">Consistency</h2>${calendar(all)}</section>
      <section class="panel"><h2 class="h-sm">Recent records <span class="dim small">${rangeLabel()}</span></h2>
        ${recs.length ? `<ul class="pr-list">${recs.map(p => `<li><a href="#lift=${encodeURIComponent(p.key)}"><b>${esc(p.name)}</b><span>${p.type}: ${p.text}</span><span class="dim small">${fmtDate(p.date)} · was ${p.prev}</span></a></li>`).join("")}</ul>`
          : '<p class="dim">Beat a previous best weight or estimated 1RM on any exercise and it shows up here.</p>'}</section>
      ${bodyweight(d)}`;
  }

  function calendar(all) {   // last 12 weeks, Mon–Sun rows; shade = sets logged that day (one hue, light → dark)
    const start = TP.monday(Date.now()).getTime() - 11 * 7 * DAY, byDay = new Map();
    all.forEach(s => { const k = TP.ymd(new Date(s.start)); const t = TP.sessionTotals(s); const x = byDay.get(k) || { sets: 0, titles: [] }; x.sets += t.sets; x.titles.push(s.title); byDay.set(k, x); });
    const lvl = n => (!n ? 0 : n < 10 ? 1 : n < 18 ? 2 : n < 25 ? 3 : 4);
    let cells = "";
    for (let w = 0; w < 12; w++) for (let dd = 0; dd < 7; dd++) {
      const t = start + (w * 7 + dd) * DAY, day = new Date(t), k = TP.ymd(day), x = byDay.get(k), future = t > Date.now();
      const label = `${fmtDate(t, { weekday: "short", month: "short", day: "numeric" })}: ${x ? `${x.titles.join(", ")} · ${x.sets} sets` : future ? "upcoming" : "rest"}`;
      cells += `<span class="cell l${future ? "f" : lvl(x?.sets)}" style="grid-column:${w + 2};grid-row:${dd + 1}" data-tip="${esc(label)}"></span>`;
    }
    const rows = ["Mon", "", "Wed", "", "Fri", "", "Sun"].map((n, i) => `<span class="cal-lab" style="grid-row:${i + 1}">${n}</span>`).join("");
    return `<div class="cal" role="img" aria-label="Workouts per day over the last 12 weeks">${rows}${cells}</div>
      <p class="cal-key dim small"><span>Fewer sets</span>${[0, 1, 2, 3, 4].map(l => `<span class="cell l${l}"></span>`).join("")}<span>More</span></p>`;
  }

  function bodyweight(d) {
    const bw = d.bodyweight, today = TP.ymd(new Date());
    const avg = (from, to) => { const xs = bw.filter(b => b.date > from && b.date <= to).map(b => b.lb); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
    const shift = n => TP.ymd(new Date(Date.now() - n * DAY));
    const a1 = avg(shift(14), today), a0 = avg(shift(28), shift(14)), rate = a1 != null && a0 != null ? (a1 - a0) / 2 : null;
    const verdict = rate == null ? "Weigh in most mornings; after about four weeks this shows your weekly rate of gain."
      : rate < 0.5 ? "Below the plan's 0.5–0.75 lb/week target. The nutrition page says how to adjust intake."
      : rate > 0.75 ? "Above the plan's 0.5–0.75 lb/week target. More of the gain may be fat; see the nutrition page."
      : "On target (0.5–0.75 lb/week).";
    const pts = bw.map(b => ({ x: TP.parseYmd(b.date).getTime(), v: b.lb, tip: `${fmtDate(TP.parseYmd(b.date).getTime())}: ${fmtNum(b.lb, 1)} lb` }));
    const roll = pts.map(p => { const xs = pts.filter(q => q.x > p.x - 14 * DAY && q.x <= p.x); const v = xs.reduce((a, q) => a + q.v, 0) / xs.length; return { x: p.x, v, tip: `14-day average ${fmtDate(p.x)}: ${fmtNum(v, 1)} lb`, label: fmtDate(p.x) }; });
    return `<section class="panel" id="bw"><h2 class="h-sm">Bodyweight</h2>
      <form class="row" id="bw-form"><label class="fld grow"><span>Today's weight (lb)</span><input id="bw-in" inputmode="decimal" placeholder="${bw.length ? fmtNum(bw[bw.length - 1].lb, 1) : "200"}"></label><button class="btn primary">Save</button></form>
      ${bw.length ? `<dl class="stats"><div><dt>Latest</dt><dd>${fmtNum(bw[bw.length - 1].lb, 1)}<small> lb</small></dd></div>
        <div><dt>14-day average</dt><dd>${a1 != null ? fmtNum(a1, 1) + "<small> lb</small>" : "–"}</dd></div>
        <div><dt>Rate</dt><dd>${rate != null ? (rate >= 0 ? "+" : "") + fmtNum(rate, 2) + "<small> lb/wk</small>" : "–"}</dd></div>
        <div><dt>Change since first</dt><dd>${(bw[bw.length - 1].lb - bw[0].lb >= 0 ? "+" : "") + fmtNum(bw[bw.length - 1].lb - bw[0].lb, 1)}<small> lb</small></dd></div></dl>` : ""}
      <p class="verdict">${verdict}</p>
      ${bw.length > 1 ? chart("bw", { type: "line", rows: roll, series2: pts, noDots: true, fmt: v => fmtNum(v, 1) + " lb", legend: [{ cls: "s1", text: "14-day average" }, { cls: "s2", text: "Daily weigh-in" }] }, "Bodyweight trend", ["Date", "14-day average"]) : ""}
      ${bw.length ? `<details class="as-table"><summary>Edit weigh-ins</summary><ul class="list compact">${bw.slice().reverse().slice(0, 30).map(b => `<li><span>${fmtDate(TP.parseYmd(b.date).getTime(), { weekday: "short", month: "short", day: "numeric" })}</span><span class="nums">${fmtNum(b.lb, 1)} lb</span><button type="button" class="icon-btn" data-bw-del="${b.date}" aria-label="Delete weigh-in for ${b.date}">${icon("x")}</button></li>`).join("")}</ul></details>` : ""}
    </section>`;
  }

  const SORTS = [["weight", "Heaviest"], ["e1rm", "Est. 1RM"], ["sessions", "Frequent"], ["recent", "Recent"]];
  let sort = TP.LS.get("tp.liftSort", "weight"), q = "";
  function liftsView(all) {
    const L = TP.liftStats(all), sm = TP.plan().startMax;
    const key = { weight: l => [l.best.w, l.bestE.v], e1rm: l => [l.bestE.v, l.best.w], sessions: l => [l.sessions, l.best.w], recent: l => [l.hist[l.hist.length - 1].date, 0] }[sort];
    L.sort((a, b) => { const x = key(a), y = key(b); return y[0] - x[0] || y[1] - x[1]; });
    const shown = L.filter(l => !q || l.name.toLowerCase().includes(q));
    if (!L.length) return `<section class="panel"><p class="dim">No lifts logged yet. Finish a workout on the <a href="train.html">Train</a> page and every exercise you log appears here, heaviest first.</p></section>`;
    return `<section class="panel">
      <div class="lift-tools"><div class="seg" role="group" aria-label="Sort lifts">${SORTS.map(([k, n]) => `<button type="button" data-sort="${k}" aria-pressed="${k === sort}"${k === sort ? ' class="on"' : ""}>${n}</button>`).join("")}</div>
      ${L.length > 8 ? `<input type="search" id="lift-q" placeholder="Filter ${L.length} lifts" value="${esc(q)}" aria-label="Filter lifts">` : ""}</div>
      <p class="dim small">All time · ${L.length} exercise${L.length === 1 ? "" : "s"} logged. Est. 1RM = weight × (1 + reps ÷ 30).</p>
      <ol class="lifts">${shown.map((l, i) => {
        const info = l.slug && TP.plan().ex[l.slug], start = sm[l.slug];
        const delta = start ? Math.round(l.bestE.v - start) : null;
        return `<li><a href="#lift=${encodeURIComponent(l.key)}">
          <span class="rank">${sort === "weight" || sort === "e1rm" ? i + 1 : ""}</span>
          ${info ? `<img class="thumb" src="${info.img}" alt="" loading="lazy">` : '<span class="thumb blank"></span>'}
          <span class="lift-main"><b>${esc(l.name)}</b><span class="dim small">${l.best.w ? `${fmtNum(l.best.w)} × ${l.best.r}` : `Bodyweight × ${l.best.r}`} on ${fmtDate(l.best.date)} · ${l.sessions} session${l.sessions === 1 ? "" : "s"}</span>
            <span class="dim small">Est. 1RM ${fmtNum(l.bestE.v)} lb${delta != null ? ` · <span class="${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "+" : "−"}${Math.abs(delta)} vs start</span>` : ""}</span></span>
          <span class="lift-num"><b>${l.best.w ? fmtNum(l.best.w) : "BW"}${l.best.w ? "<small> lb</small>" : ""}</b></span>
          ${icon("chev")}</a></li>`; }).join("")}</ol></section>`;
  }

  function liftDetail(all, key) {
    const l = TP.liftStats(all).find(x => x.key === key);
    if (!l) return `<p><a href="#lifts">${icon("back")}All lifts</a></p><p class="dim">Nothing logged for this exercise.</p>`;
    const info = l.slug && TP.plan().ex[l.slug], start = TP.plan().startMax[l.slug];
    const allSets = l.hist.flatMap(h => h.sets.map(s => ({ ...s, date: h.date })));
    const repMax = [1, 2, 3, 5, 8, 10, 12, 15].map(n => { const xs = allSets.filter(s => s.r >= n); if (!xs.length) return null; const b = xs.reduce((a, s) => (s.w > a.w ? s : a)); return { n, w: b.w, r: b.r, date: b.date }; }).filter(Boolean);
    const h = l.hist;
    return `<p class="crumb"><a href="#lifts">${icon("back")}All lifts</a></p>
      <section class="panel lift-hero">${info ? `<img src="${info.img}" alt="">` : ""}<div><h2>${esc(l.name)}</h2>
        ${info ? `<p class="dim small">${esc(info.primary.map(cap).join(", "))}${info.secondary.length ? ` · also ${esc(info.secondary.join(", "))}` : ""} · <a href="exercises.html#${l.slug}">How to do it</a></p>` : ""}</div></section>
      <dl class="stats wide">
        <div><dt>Heaviest</dt><dd>${l.best.w ? fmtNum(l.best.w) + "<small> lb</small>" : "BW"}</dd><p class="sub">× ${l.best.r} on ${fmtDate(l.best.date)}</p></div>
        <div><dt>Best est. 1RM</dt><dd>${fmtNum(l.bestE.v)}<small> lb</small></dd><p class="sub">from ${fmtNum(l.bestE.w)} × ${l.bestE.r}</p></div>
        ${start ? `<div><dt>vs starting max</dt><dd>${l.bestE.v - start >= 0 ? "+" : ""}${fmtNum(l.bestE.v - start)}<small> lb</small></dd><p class="sub">started at ${start} lb (Nov 2026)</p></div>` : ""}
        <div><dt>Sessions</dt><dd>${l.sessions}</dd><p class="sub">${l.sets} set${l.sets === 1 ? "" : "s"} · last ${fmtDate(h[h.length - 1].date)}</p></div>
        <div><dt>Total volume</dt><dd>${fmtNum(l.vol)}<small> lb</small></dd><p class="sub">${fmtNum(l.vol / l.sessions)} lb per session</p></div>
      </dl>
      ${h.length > 1 ? `<div class="two"><section class="panel">${chart("e1", { type: "line", rows: h.map(x => ({ x: x.date, v: Math.round(x.e1rm), label: fmtDate(x.date), tip: `${fmtDate(x.date)}: est. 1RM ${fmtNum(x.e1rm)} lb` })), fmt: v => fmtNum(v) + " lb" }, "Estimated 1RM per session <span>lb</span>", ["Date", "Est. 1RM"])}</section>
        <section class="panel">${chart("top", { type: "line", rows: h.map(x => ({ x: x.date, v: x.top.w, label: fmtDate(x.date), tip: `${fmtDate(x.date)}: top set ${fmtNum(x.top.w)} × ${x.top.r}` })), fmt: v => fmtNum(v) + " lb" }, "Heaviest set per session <span>lb</span>", ["Date", "Top set"])}</section></div>
        <section class="panel">${chart("lv", { type: "bar", rows: h.slice(-24).map(x => ({ label: fmtDate(x.date), v: x.vol, tip: `${fmtDate(x.date)}: ${fmtNum(x.vol)} lb, ${x.sets.length} sets` })), fmt: v => fmtNum(v) + " lb", axis: v => (v >= 1000 ? fmtNum(v / 1000, 1) + "k" : fmtNum(v)) }, "Volume per session <span>lb, last 24 sessions</span>", ["Date", "Volume"])}</section>`
        : '<p class="dim">Log this lift in another session to see trend charts.</p>'}
      <section class="panel"><h2 class="h-sm">Rep maxes</h2><p class="dim small">Heaviest weight you've moved for at least that many reps.</p>
        <div class="tbl"><table class="rm plain"><thead><tr><th>Reps</th><th>Weight</th><th>Set</th><th>Date</th></tr></thead><tbody>
        ${repMax.map(r => `<tr><td>${r.n}+</td><td><b>${r.w ? fmtNum(r.w) + " lb" : "BW"}</b></td><td>${fmtNum(r.w)} × ${r.r}</td><td>${fmtDate(r.date)}</td></tr>`).join("")}</tbody></table></div></section>
      <section class="panel"><h2 class="h-sm">Every session</h2><ul class="list">${h.slice().reverse().map(x => `<li><a href="train.html#edit=${x.id}"><span><b>${fmtDate(x.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</b>
        <span class="dim small sets-line">${x.sets.map(s => `${s.w ? fmtNum(s.w) : "BW"}×${s.r}${s.rpe ? ` @${s.rpe}` : ""}`).join(" · ")}</span></span><span class="nums">${fmtNum(x.e1rm)}<span class="dim small">e1RM</span></span>${icon("chev")}</a></li>`).join("")}</ul></section>`;
  }

  function musclesView(all) {
    const from = rangeStart(all), ss = all.filter(s => s.start >= from);
    const nW = weeks(Math.max(from, ss.length ? TP.monday(ss[0].start).getTime() : from)).length;   // average over weeks actually trained in range
    const M = TP.muscleSets(ss).sort((a, b) => b.sets - a.sets), T = TP.plan().targets;
    const wk = TP.muscleSets(all.filter(s => s.start >= TP.monday(Date.now()).getTime()));
    if (!M.length) return `<section class="panel"><p class="dim">Log a workout and this shows the weekly sets each muscle got, against the plan's targets.</p></section>`;
    const top = Math.max(22, ...M.map(m => m.sets / nW), ...Object.values(T).map(t => t[1] + 2));
    const pct = v => ((v / top) * 100).toFixed(1) + "%";
    const regions = {}; let all_ = 0;
    M.forEach(m => { const r = TP.REGION[m.muscle] || "Other"; regions[r] = (regions[r] || 0) + m.sets; all_ += m.sets; });
    return `<section class="panel"><h2 class="h-sm">Weekly sets per muscle <span class="dim small">average of the last ${nW} week${nW === 1 ? "" : "s"}</span></h2>
      <p class="dim small">Fractional count: a set is 1 for the main muscle, ½ for helpers. Shaded band = the plan's target range.</p>
      <ul class="mbars">${M.map(m => {
        const avg = m.sets / nW, t = T[m.muscle], now = wk.find(x => x.muscle === m.muscle)?.sets || 0;
        const st = t ? (avg < t[0] ? "under" : avg > t[1] ? "over" : "in") : "";
        return `<li><a href="#muscle=${encodeURIComponent(m.muscle)}"><span class="m-name">${esc(cap(m.muscle))}</span>
          <span class="m-track">${t ? `<span class="band" style="left:${pct(t[0])};width:${pct(t[1] - t[0])}" title="Target ${t[0]}–${t[1]}"></span>` : ""}<span class="m-bar" style="width:${pct(avg)}"></span></span>
          <span class="m-val"><b>${fmtNum(avg, 1)}</b><span class="dim small">${t ? `target ${t[0]}–${t[1]}` : "no target"} · ${fmtNum(now, 1)} this wk</span>${st ? `<span class="st ${st}">${st === "in" ? "On target" : st === "under" ? "Below" : "Above"}</span>` : ""}</span></a></li>`;
      }).join("")}</ul></section>
      <section class="panel"><h2 class="h-sm">Split by region</h2><ul class="mbars regions">${Object.entries(regions).sort((a, b) => b[1] - a[1]).map(([r, v]) => `<li><span class="m-name">${r}</span><span class="m-track"><span class="m-bar" style="width:${((v / all_) * 100).toFixed(1)}%"></span></span><span class="m-val"><b>${fmtNum((v / all_) * 100)}%</b><span class="dim small">${fmtNum(v / nW, 1)} sets/wk</span></span></li>`).join("")}</ul></section>`;
  }

  function muscleDetail(all, mus) {
    const from = rangeStart(all), ss = all.filter(s => s.start >= from), ws = weeks(from);
    const m = TP.muscleSets(ss).find(x => x.muscle === mus), t = TP.plan().targets[mus];
    const per = ws.map(w => ({ w, v: 0 }));
    ss.forEach(s => { const i = weekIdx(ws, s.start); const x = TP.muscleSets([s]).find(y => y.muscle === mus); if (i >= 0 && x) per[i].v += x.sets; });
    return `<p class="crumb"><a href="#muscles">${icon("back")}All muscles</a></p>
      <section class="panel"><h2>${esc(cap(mus))}</h2><p class="dim small">${t ? `Plan target: ${t[0]}–${t[1]} fractional sets per week.` : "The plan sets no specific target for this muscle."} ${rangeLabel()}.</p>
      ${chart("mw", { type: "bar", rows: per.map(p => ({ label: fmtDate(p.w), v: p.v, tip: `Week of ${fmtDate(p.w)}: ${fmtNum(p.v, 1)} sets` })), fmt: v => fmtNum(v, 1) + " sets", axis: v => fmtNum(v, 1) }, "Sets per week", ["Week of", "Sets"])}</section>
      <section class="panel"><h2 class="h-sm">Where the sets came from</h2>${m ? `<ul class="list compact">${[...m.by.entries()].sort((a, b) => b[1] - a[1]).map(([n, v]) => `<li><span>${esc(n)}</span><span class="nums">${fmtNum(v, 1)} sets</span></li>`).join("")}</ul>` : '<p class="dim">No sets in this range.</p>'}</section>`;
  }

  function historyView(all) {
    if (!all.length) return `<section class="panel"><p class="dim">No workouts yet. Start one on the <a href="train.html">Train</a> page.</p></section>`;
    const byWeek = new Map();
    all.slice().reverse().forEach(s => { const k = TP.monday(s.start).getTime(); byWeek.set(k, [...(byWeek.get(k) || []), s]); });
    return [...byWeek.entries()].map(([w, ss]) => {
      const t = ss.reduce((a, s) => { const x = TP.sessionTotals(s); a.vol += x.vol; a.sets += x.sets; a.dur += x.dur; return a; }, { vol: 0, sets: 0, dur: 0 });
      return `<section class="panel"><div class="row between"><h2 class="h-sm">Week of ${fmtDate(w, { month: "short", day: "numeric", year: "numeric" })}</h2><span class="dim small">${ss.length} workout${ss.length === 1 ? "" : "s"} · ${t.sets} sets · ${fmtNum(t.vol)} lb · ${fmtDur(t.dur)}</span></div>
        <ul class="list">${ss.map(s => { const x = TP.sessionTotals(s); return `<li><a href="train.html#edit=${s.id}"><span><b>${esc(s.title)}</b><span class="dim small">${fmtDate(s.start, { weekday: "short", month: "short", day: "numeric" })} · ${TP.fmtTime(s.start)}–${s.end ? TP.fmtTime(s.end) : "?"}${s.week ? ` · plan wk ${s.week}` : ""}</span></span>
          <span class="nums">${fmtDur(x.dur)}<span class="dim small">${x.sets} sets · ${fmtNum(x.vol)} lb</span></span>${icon("chev")}</a></li>`; }).join("")}</ul></section>`;
    }).join("");
  }

  // ---------- routing ----------
  function render() {
    acct.paint(); charts.clear(); hideTip();
    if (!TP.current()) return TP.signupPanel(app, render);
    const d = TP.data(), all = TP.sessions(d), h = decodeURIComponent(location.hash.slice(1));
    const [view, arg] = h.includes("=") ? h.split(/=(.*)/s) : [h || "overview"];
    const tab = { lift: "lifts", muscle: "muscles" }[view] || view;
    const withRange = tab === "overview" || tab === "muscles";
    const body = { overview: () => overview(d, all), lifts: () => liftsView(all), lift: () => liftDetail(all, arg), muscles: () => musclesView(all), muscle: () => muscleDetail(all, arg), history: () => historyView(all) }[view] || (() => overview(d, all));
    app.innerHTML = `<div class="ptop">${tabs(tab)}${withRange || view === "muscle" ? rangeSeg() : ""}</div>${!all.length && tab === "overview" ? `<section class="panel"><p>No workouts yet. Log one on the <a href="train.html">Train</a> page; everything here fills in from your sets.</p></section>` : ""}${body()}`;
    drawCharts();
  }
  app.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.range !== undefined) { range = +b.dataset.range; TP.LS.set("tp.range", range); render(); }
    if (b.dataset.sort) { sort = b.dataset.sort; TP.LS.set("tp.liftSort", sort); render(); }
    if (b.dataset.bwDel) { const d = TP.data(); d.bodyweight = d.bodyweight.filter(x => x.date !== b.dataset.bwDel); TP.saveData(d); render(); }
  });
  app.addEventListener("submit", e => {
    if (e.target.id !== "bw-form") return;
    e.preventDefault();
    const v = parseFloat($("#bw-in").value.replace(",", "."));
    if (!(v > 50 && v < 700)) return TP.toast("Enter your weight in pounds, e.g. 201.4");
    const d = TP.data(), date = TP.ymd(new Date());
    d.bodyweight = d.bodyweight.filter(b => b.date !== date).concat({ date, lb: v }).sort((a, b) => a.date.localeCompare(b.date));
    TP.saveData(d); render(); TP.toast("Weight saved"); $("#bw")?.scrollIntoView({ block: "start" });
  });
  app.addEventListener("input", e => {
    if (e.target.id !== "lift-q") return;
    q = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; render();
    const el = $("#lift-q"); el.focus(); el.setSelectionRange(pos, pos);
  });
  const acct = TP.mountAccount(render);
  addEventListener("hashchange", () => { render(); scrollTo(0, 0); });
  TP.ready.then(render).catch(() => { app.innerHTML = '<p class="err">Couldn\'t load the plan data. Open the app once with a connection so it can save everything for offline use.</p>'; });
})();
