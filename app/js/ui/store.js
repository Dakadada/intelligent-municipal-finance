// App state that should survive a reload: reviewer decisions, the audit log,
// threshold settings, theme, and an uploaded ledger. Everything lives in this
// browser only (localStorage); nothing is sent anywhere.

const KEY = "redpen.v1";

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

let state = { decisions: {}, log: [], settings: null, ...read() };

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private windows can refuse storage; the app still works for this visit.
  }
}

// Alert ids (A001...) are re-numbered when settings change, so decisions are
// keyed by what the alert is about: its transactions, or its vendor.
export const alertKey = (a) =>
  a.txnIds?.length ? [...a.txnIds].sort().join("|") : `vendor:${a.vendor}:${a.type}`;

export const store = {
  get settings() {
    return state.settings;
  },
  setSettings(s) {
    state.settings = s;
    save();
  },

  decision(alert) {
    return state.decisions[alertKey(alert)] ?? null;
  },
  // kind: "reviewed" | "dismissed" | "escalated"
  decide(alert, kind, note = "") {
    state.decisions[alertKey(alert)] = { kind, note, at: Date.now() };
    state.log.unshift({ at: Date.now(), alertId: alert.id, kind, note, title: alert.title, vendor: alert.vendor, amount: alert.amount });
    save();
  },
  reopen(alert) {
    delete state.decisions[alertKey(alert)];
    state.log.unshift({ at: Date.now(), alertId: alert.id, kind: "reopened", note: "", title: alert.title, vendor: alert.vendor, amount: alert.amount });
    save();
  },
  get log() {
    return state.log;
  },
  clearReviews() {
    state.decisions = {};
    state.log = [];
    save();
  },

  // Uploaded CSV text is stored so a reload keeps the user's own books.
  get uploaded() {
    return state.uploaded ?? null;
  },
  setUploaded(payload) {
    state.uploaded = payload;
    state.decisions = {};
    state.log = [];
    save();
  },
};
