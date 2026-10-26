// Red Pen app entry point: loads the books, runs the engine, and routes
// between views. Routes are hash based (#/review, #/case/A004) so the app
// works as plain static files with no server code.

import { loadSampleLedger, runAnalysis, parseLedgerCSV, DEFAULT_SETTINGS } from "./engine.js";
import { store } from "./ui/store.js";
import { esc, count, date } from "./ui/format.js";
import { playReader } from "./ui/reader.js";
import { reviewView } from "./ui/views/review.js";
import { caseView } from "./ui/views/case.js";
import { patternsView } from "./ui/views/patterns.js";
import { runwayView } from "./ui/views/runway.js";
import { vendorsView } from "./ui/views/vendors.js";
import { contractsView } from "./ui/views/contracts.js";
import { dataView } from "./ui/views/data.js";
import { methodView } from "./ui/views/method.js";
import { startView } from "./ui/views/start.js";

const ROUTES = {
  start: startView,
  review: reviewView,
  case: caseView,
  patterns: patternsView,
  runway: runwayView,
  vendors: vendorsView,
  contracts: contractsView,
  data: dataView,
  method: methodView,
};

const app = {
  ledger: null,
  analysis: null,
  settings: { ...DEFAULT_SETTINGS, ...(store.settings ?? {}) },
  source: "sample", // or "upload"

  load() {
    const up = store.uploaded;
    if (up) {
      try {
        const { ledger } = parseLedgerCSV(up.text);
        if (ledger.txns.length) {
          this.ledger = ledger;
          this.source = "upload";
          this.uploadName = up.name;
          return;
        }
      } catch (e) {
        console.warn("Stored upload could not be read; using the sample town.", e);
      }
    }
    this.ledger = loadSampleLedger();
    this.source = "sample";
  },

  analyze() {
    const t0 = performance.now();
    this.analysis = runAnalysis(this.ledger, this.settings);
    this.runtimeMs = performance.now() - t0;
  },

  setSettings(next) {
    this.settings = { ...this.settings, ...next };
    store.setSettings(this.settings);
    this.analyze();
    this.chrome();
  },

  useUpload(name, text) {
    const { ledger, warnings, columns } = parseLedgerCSV(text);
    if (!ledger.txns.length) return { ok: false, warnings };
    store.setUploaded({ name, text });
    this.ledger = ledger;
    this.source = "upload";
    this.uploadName = name;
    // Shown once at the top of the review queue, so the clerk can check the
    // import read their file the way they expected.
    this.lastImport = { name, rows: ledger.txns.length, warnings, columns };
    this.analyze();
    this.chrome();
    return { ok: true, warnings, rows: ledger.txns.length };
  },

  useSample() {
    store.setUploaded(null);
    this.ledger = loadSampleLedger();
    this.source = "sample";
    this.analyze();
    this.chrome();
  },

  // Alerts not yet decided by a person.
  get openAlerts() {
    return this.analysis.alerts.filter((a) => !store.decision(a));
  },

  go(path) {
    location.hash = `#/${path}`;
  },

  // Leave the start screen for the review queue, watching it read the books.
  enter() {
    try { localStorage.setItem("redpen.welcomed", "1"); } catch {}
    location.hash = "#/review";
    playReader(this, () => {
      try { sessionStorage.setItem("redpen.read", "1"); } catch {}
      render();
    });
  },

  // Sidebar count + top bar text.
  chrome() {
    const a = this.analysis;
    const open = this.openAlerts.length;
    const nav = document.getElementById("nav-count");
    nav.textContent = count(open);
    nav.classList.toggle("zero", open === 0);
    const t = a.town;
    const pop = t.population ? ` · pop. ${count(t.population)}` : "";
    document.getElementById("where").innerHTML =
      `<b>${esc(t.name)}${t.state ? `, ${esc(t.state)}` : ""}</b>${pop} · FY${a.summary.currentFy} · books through ${date(a.asOf)}`;
    document.getElementById("topbar-actions").innerHTML =
      this.source === "sample"
        ? `<span class="pill sample" title="Willow Creek is a fictional town. Ten real-world problems were planted in its books to test the system.">Sample town</span>`
        : `<span class="pill">Your file: ${esc(this.uploadName ?? "upload.csv")}</span><a class="btn sm ghost" href="#/start">Change file</a>`;
    document.getElementById("sample-bar").innerHTML = this.source === "sample"
      ? `<p><b>You're viewing sample data.</b> Willow Creek, Iowa is a made-up town with 10 problems planted in its books to test Red Pen.</p><a class="btn sm primary" href="#/start">Check your own city's spending →</a>`
      : "";
  },
};

// First-time visitors who arrive at the bare address start on the welcome
// screen. Links to a specific view (#/review, #/case/A004) always go there.
function welcomed() {
  try { return localStorage.getItem("redpen.welcomed") === "1"; } catch { return true; }
}

function render() {
  const [name = "review", ...rest] = location.hash.replace(/^#\/?/, "").split("/");
  const view = ROUTES[name] ?? reviewView;
  // A fresh element per render, so listeners from the last view never pile up.
  const old = document.getElementById("view");
  const el = old.cloneNode(false);
  old.replaceWith(el);
  const navName = name === "case" ? "review" : name;
  document.getElementById("sample-bar").hidden = name === "start" || app.source !== "sample";
  document.querySelector(".topbar").hidden = name === "start";
  document.querySelectorAll(".nav a, .rail-cta").forEach((a) => {
    if (a.dataset.route === navName) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  view(el, app, rest.map(decodeURIComponent));
  el.classList.add("fade-up");
}

function setupTheme() {
  const btn = document.getElementById("theme-toggle");
  const current = () =>
    document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const label = () => { btn.textContent = current() === "dark" ? "Light mode" : "Dark mode"; };
  btn.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("redpen.theme", next); } catch {}
    label();
  });
  label();
}

function boot() {
  setupTheme();
  app.load();
  app.analyze();
  app.chrome();
  const first = !location.hash && app.source === "sample" && !welcomed();
  if (first) history.replaceState(null, "", "#/start");
  window.addEventListener("hashchange", () => {
    render();
    document.getElementById("view").focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  });
  render();

  // First visit this session: watch it read the books.
  let seen = false;
  try { seen = sessionStorage.getItem("redpen.read") === "1"; } catch {}
  if (!seen && !location.hash.startsWith("#/case") && !location.hash.startsWith("#/start")) {
    playReader(app, () => {
      try { sessionStorage.setItem("redpen.read", "1"); } catch {}
      render();
    });
  }
  window.redpen = app; // handy for the demo video and debugging in the console
}

app.replayReader = () => playReader(app, () => render());

boot();
