export const CSS = /* css */ `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  --bg: #f7f5f0; --panel: #efebe3; --card: #ffffff; --text: #1f1e1c; --muted: #6b6760;
  --border: #ddd8cc; --accent: #c96442; --accent-text: #fff; --drop: rgba(201,100,66,.14);
  --attention-bg: #fff6f1;
  font: 14px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--text);
}
@media (prefers-color-scheme: dark) {
  .root {
    --bg: #1f1e1c; --panel: #2a2926; --card: #34332f; --text: #ecebe6; --muted: #a39e94;
    --border: #45433e; --drop: rgba(217,119,87,.22); --attention-bg: #3b302a;
  }
}
.launcher {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483646;
  display: flex; align-items: center; gap: 6px;
  background: var(--accent); color: var(--accent-text); border: 0; border-radius: 999px;
  padding: 9px 14px; font: 600 13px/1 inherit; cursor: pointer;
  box-shadow: 0 4px 14px rgba(0,0,0,.25);
}
.launcher[hidden] { display: none; }
.launcher-badge {
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
  background: var(--accent-text); color: var(--accent); font: 700 11px/18px inherit; text-align: center;
}
.launcher-badge[hidden] { display: none; }
.overlay {
  position: fixed; inset: 0; z-index: 2147483647; background: var(--bg);
  display: flex; flex-direction: column;
}
.overlay[hidden] { display: none; }
header {
  display: flex; align-items: center; gap: 12px; padding: 12px 20px;
  border-bottom: 1px solid var(--border);
}
header h1 { font-size: 16px; margin: 0; font-weight: 600; }
header .status { color: var(--muted); font-size: 12px; flex: 1; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.search {
  width: 220px; min-width: 120px; background: var(--card); color: var(--text);
  border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; font: inherit; font-size: 13px;
}
.search:focus { outline: none; border-color: var(--accent); }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  background: transparent; border: 1px solid var(--border); color: var(--muted);
  border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12px; cursor: pointer;
}
.chip:hover { border-color: var(--accent); }
.chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
button.ghost {
  background: transparent; border: 1px solid var(--border); color: var(--text);
  border-radius: 8px; padding: 6px 10px; font: inherit; font-size: 13px; cursor: pointer;
}
button.ghost:hover { background: var(--panel); }
.columns {
  flex: 1; display: grid; grid-template-columns: repeat(3, minmax(240px, 1fr));
  gap: 14px; padding: 16px 20px; overflow: auto;
}
.column {
  background: var(--panel); border-radius: 12px; display: flex; flex-direction: column;
  min-height: 0; border: 2px solid transparent;
}
.column.drop-target { border-color: var(--accent); background: var(--drop); }
.column h2 {
  font-size: 13px; margin: 0; padding: 12px 14px 8px; font-weight: 600;
  display: flex; justify-content: space-between; color: var(--muted);
  text-transform: uppercase; letter-spacing: .03em;
}
.list { flex: 1; overflow-y: auto; padding: 4px 10px 12px; display: flex; flex-direction: column; gap: 8px; min-height: 60px; }
.card {
  background: var(--card); border: 1px solid var(--border); border-radius: 10px;
  padding: 10px 12px; cursor: grab; user-select: none;
}
.card:hover { border-color: var(--accent); }
.card.needs-input { border-left: 4px solid var(--accent); padding-left: 9px; background: var(--attention-bg); }
.card.dragging { opacity: .4; }
.card.pending { opacity: .6; }
.card .title { font-weight: 600; margin-bottom: 4px; word-break: break-word; }
.card .meta { color: var(--muted); font-size: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.card .snippet { color: var(--muted); font-size: 12.5px; margin-top: 6px;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.badge { border: 1px solid var(--border); border-radius: 999px; padding: 0 6px; }
.badge-attention { border-color: var(--accent); background: var(--accent); color: var(--accent-text); font-weight: 600; }
.placeholder { height: 4px; border-radius: 2px; background: var(--accent); }
.empty { color: var(--muted); font-size: 12.5px; text-align: center; padding: 18px 6px; }
.peek {
  position: absolute; inset: 0; z-index: 10; background: rgba(0,0,0,.45);
  display: flex; align-items: center; justify-content: center; padding: 3vh 3vw;
}
.peek[hidden] { display: none; }
.peek-panel {
  width: min(1000px, 100%); height: 100%; background: var(--bg); border: 1px solid var(--border);
  border-radius: 14px; overflow: hidden; display: flex; flex-direction: column;
  box-shadow: 0 12px 40px rgba(0,0,0,.35);
}
.peek-panel header { padding: 10px 14px; }
.peek-title { flex: 1; min-width: 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.peek-body { position: relative; flex: 1; min-height: 0; }
.peek-body iframe { width: 100%; height: 100%; border: 0; display: block; background: var(--bg); }
.peek-body iframe.loading { visibility: hidden; }
.peek-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--muted); }
.peek-loading[hidden] { display: none; }
.toast {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
  background: var(--text); color: var(--bg); padding: 8px 14px; border-radius: 8px; font-size: 13px;
  max-width: 80vw;
}
.toast[hidden] { display: none; }
`;
