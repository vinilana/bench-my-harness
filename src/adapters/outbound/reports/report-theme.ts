// Shared visual theme for generated HTML reports.
//
// Both the modern suite report (`renderSuiteReportHtml`) and the legacy
// normalized report renderer embed this stylesheet so the two outputs share a
// single, cohesive design language. Keep this file free of report-specific
// markup: it only owns the look-and-feel (CSS) and a few presentational
// helpers (status pills, meta chips) that both renderers reuse.

export function reportStyles(): string {
  return `
:root {
  --bg: #f4f6f9;
  --surface: #ffffff;
  --surface-2: #f7f9fc;
  --surface-3: #eef2f7;
  --border: #e2e8f0;
  --border-strong: #cbd5e1;
  --text: #0f172a;
  --text-muted: #64748b;
  --text-subtle: #94a3b8;
  --accent: #4f46e5;
  --accent-soft: #eef2ff;
  --ok: #16a34a;
  --ok-soft: #dcfce7;
  --warn: #d97706;
  --warn-soft: #fef3c7;
  --bad: #dc2626;
  --bad-soft: #fee2e2;
  --info: #0ea5e9;
  --info-soft: #e0f2fe;
  --shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 6px 18px rgba(15, 23, 42, 0.06);
  --radius: 14px;
  --radius-sm: 9px;
  --font: "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b1120;
    --surface: #131c2e;
    --surface-2: #182236;
    --surface-3: #1f2b42;
    --border: #283449;
    --border-strong: #38465f;
    --text: #e8edf6;
    --text-muted: #9aa7bd;
    --text-subtle: #6b7a93;
    --accent: #818cf8;
    --accent-soft: #1e2547;
    --ok: #4ade80;
    --ok-soft: #14321f;
    --warn: #fbbf24;
    --warn-soft: #3a2c0c;
    --bad: #f87171;
    --bad-soft: #3a1717;
    --info: #38bdf8;
    --info-soft: #0c2c3f;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.35);
  }
}

* { box-sizing: border-box; }

html {
  max-width: 100%;
  overflow-x: hidden;
}

body {
  margin: 0;
  font-family: var(--font);
  color: var(--text);
  background: var(--bg);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "tnum" 1;
  max-width: 100%;
  overflow-x: hidden;
}

a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: saturate(140%) blur(8px);
  border-bottom: 1px solid var(--border);
}
.app-header__inner {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 20px 24px;
  min-width: 0;
}
.app-header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 11px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 999px;
}
.chip b { color: var(--text); font-weight: 600; }

main {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 28px 24px 64px;
  display: grid;
  gap: 22px;
  min-width: 0;
}

section {
  margin: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 22px 24px;
  min-width: 0;
  overflow: hidden;
}
section > h2 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 9px;
}
section > h2::before {
  content: "";
  width: 4px;
  height: 18px;
  border-radius: 999px;
  background: var(--accent);
}
section > h3 {
  margin: 18px 0 8px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.section-note { margin: 2px 0 16px; color: var(--text-muted); font-size: 13px; }

.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}
.metric {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.metric strong, .metric .metric__label {
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.metric__value { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; color: var(--text); }

table {
  width: 100%;
  min-width: 900px;
  border-collapse: separate;
  border-spacing: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  font-size: 13.5px;
}
thead th {
  position: sticky;
  top: 0;
  background: var(--surface-3);
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  text-align: left;
  padding: 11px 14px;
  overflow-wrap: anywhere;
}
tbody td {
  padding: 11px 14px;
  border-top: 1px solid var(--border);
  vertical-align: top;
  overflow-wrap: anywhere;
}
tbody tr:nth-child(even) td { background: var(--surface-2); }
tbody tr:hover td { background: var(--accent-soft); }
tbody tr[hidden] { display: none; }
table caption { caption-side: top; text-align: left; padding: 0 0 10px; color: var(--text-muted); font-size: 13px; }

.table-frame {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  -webkit-overflow-scrolling: touch;
}
.table-frame table {
  border: 0;
  border-radius: 0;
}
.table-frame table + table { margin-top: 0; }

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0 0 16px;
  padding: 14px 16px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
label {
  display: grid;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
input, select {
  font: inherit;
  font-size: 13.5px;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
  color: var(--text);
  padding: 8px 10px;
  min-width: 180px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
}
input:focus, select:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }

.badge, .pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.7;
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
  background: var(--surface-2);
}
.pill::before { content: ""; width: 6px; height: 6px; border-radius: 999px; background: currentColor; }
.pill--ok { color: var(--ok); background: var(--ok-soft); border-color: transparent; }
.pill--bad { color: var(--bad); background: var(--bad-soft); border-color: transparent; }
.pill--warn { color: var(--warn); background: var(--warn-soft); border-color: transparent; }
.pill--info { color: var(--info); background: var(--info-soft); border-color: transparent; }
.pill--muted { color: var(--text-subtle); }

.source-badge {
  display: inline-flex;
  align-items: center;
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1px 6px;
  margin: 1px;
}

code { font-family: var(--mono); font-size: 12px; background: var(--surface-3); border: 1px solid var(--border); border-radius: 5px; padding: 1px 5px; }

.charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
.chart {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
}
.chart h3 { margin: 0 0 10px; font-size: 13px; font-weight: 600; color: var(--text); text-transform: none; letter-spacing: 0; }
.chart svg { width: 100%; height: auto; display: block; }
.chart svg text { fill: var(--text-muted); }
.chart svg rect { fill: var(--accent); rx: 3; }

.usage-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.usage-list li {
  padding: 9px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.views { display: inline-flex; gap: 4px; margin: 0 0 16px; padding: 4px; background: var(--surface-3); border-radius: 10px; }
.views button {
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 7px 14px;
  border: none;
  border-radius: 7px;
  color: var(--text-muted);
  background: transparent;
}
.views button:hover { color: var(--text); }
.views button[aria-pressed="true"] { color: var(--text); background: var(--surface); box-shadow: var(--shadow); }

.trials { display: grid; gap: 12px; }
.trial {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
}
.trial[hidden] { display: none; }
.trial h3 { margin: 0 0 8px; font-size: 14px; font-weight: 600; text-transform: none; letter-spacing: 0; color: var(--text); }
.trial p { margin: 4px 0; font-size: 13px; color: var(--text-muted); }
.trial p b { color: var(--text); }
.muted, .meta { color: var(--text-muted); font-size: 13px; }

@media (max-width: 720px) {
  .app-header__inner { padding: 16px; }
  main { padding: 18px 12px 40px; }
  section { padding: 16px; }
  .filters { display: grid; grid-template-columns: minmax(0, 1fr); }
  input, select { min-width: 0; width: 100%; }
  .charts { grid-template-columns: minmax(0, 1fr); }
  .views { display: grid; grid-template-columns: minmax(0, 1fr); }
  .table-frame {
    overflow-x: visible;
    border: 0;
    background: transparent;
  }
  .table-frame table {
    min-width: 0;
    border: 0;
    background: transparent;
  }
  .table-frame thead { display: none; }
  .table-frame tbody {
    display: grid;
    gap: 10px;
  }
  .table-frame tbody tr {
    display: block;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    overflow: hidden;
  }
  .table-frame tbody tr:nth-child(even) td,
  .table-frame tbody tr:hover td {
    background: transparent;
  }
  .table-frame tbody td {
    display: grid;
    grid-template-columns: minmax(104px, 36%) minmax(0, 1fr);
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border-top: 1px solid var(--border);
  }
  .table-frame tbody td:first-child { border-top: 0; }
  .table-frame tbody td::before {
    content: attr(data-label);
    min-width: 0;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    overflow-wrap: anywhere;
  }
}
`;
}

export type PillTone = "ok" | "bad" | "warn" | "info" | "muted" | "neutral";

const TONE_CLASS: Readonly<Record<PillTone, string>> = {
  ok: "pill pill--ok",
  bad: "pill pill--bad",
  warn: "pill pill--warn",
  info: "pill pill--info",
  muted: "pill pill--muted",
  neutral: "pill"
};

export function statusTone(status: string): PillTone {
  switch (status) {
    case "completed":
    case "comparable":
    case "available":
    case "present":
      return "ok";
    case "failed":
    case "not_comparable":
      return "bad";
    case "inconclusive":
    case "limited":
    case "partial":
      return "warn";
    case "unavailable":
      return "muted";
    default:
      return "info";
  }
}

export function renderStatusPill(label: string, tone: PillTone = statusTone(label)): string {
  return `<span class="${TONE_CLASS[tone]}">${escapeThemeHtml(label)}</span>`;
}

function escapeThemeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
