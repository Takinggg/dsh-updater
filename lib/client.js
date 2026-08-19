window.__ModuleLoader__.load({ id: "dsh-updater", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var react = require("react");
var React = react;

var CHANNEL = "/dsh-update";
var STYLE_ID = "dsh-updater-css-v6";
var rpcHandle = null;
var reloadTimer = null;

var CSS = [
  "@keyframes dsh-upd-rotate{to{transform:rotate(360deg)}}",
  "@keyframes dsh-upd-pulse{0%,100%{opacity:.55}50%{opacity:1}}",
  "@keyframes dsh-upd-shimmer{0%{background-position:0% 50%}100%{background-position:100% 50%}}",
  ".dsh-upd-layer{grid-column:2;grid-row:2;flex:none;align-items:center;width:auto;height:42px;margin:0;display:flex;position:relative}",
  ".hHd-Xa_footArea{display:grid!important;grid-template-columns:minmax(0,1fr) max-content;grid-template-rows:auto auto;align-items:center;column-gap:8px}",
  ".hHd-Xa_footerActions{display:contents!important}",
  ".Nqubda_layer{grid-column:1/-1;grid-row:1}",
  ".hHd-Xa_footArea>.hHd-Xa_settingsArea{grid-column:1;grid-row:2;width:auto;min-width:0;display:flex;align-items:center}",
  ".hHd-Xa_collapsed.hHd-Xa_root .hHd-Xa_footArea{display:flex!important;flex-direction:column;align-items:center}",
  ".hHd-Xa_collapsed.hHd-Xa_root .hHd-Xa_footerActions{display:flex!important;flex-direction:column;align-items:center;width:auto}",
  ".dsh-upd-btn{box-sizing:border-box;height:32px;color:var(--dsw-alias-label-primary);cursor:pointer;background:color-mix(in srgb, var(--dsw-alias-label-primary) 14%, var(--dsw-specific-sidebar-fill));border:none;border-radius:999px;align-items:center;justify-content:center;gap:6px;margin:0;padding:0 12px;font-family:inherit;font-size:13px;font-weight:600;line-height:18px;display:inline-flex;white-space:nowrap}",
  ".dsh-upd-btn:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 20%, var(--dsw-specific-sidebar-fill))}",
  ".dsh-upd-btn:disabled{opacity:.8;cursor:default}",
  ".dsh-upd-btn[data-tone=\"error\"]{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 16%, var(--dsw-specific-sidebar-fill))}",
  ".dsh-upd-btn[data-tone=\"done\"]{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, var(--dsw-specific-sidebar-fill))}",
  ".dsh-upd-layer.rail{width:36px;height:36px;margin:8px 0 0;grid-column:auto;grid-row:auto}",
  ".dsh-upd-layer.rail .dsh-upd-btn{border-radius:50%;width:36px;height:36px;padding:0;background:transparent}",
  ".dsh-upd-dot{position:absolute;top:4px;right:4px;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-brand-primary)}",
  ".dsh-upd-icon{flex:none;display:block}",
  ".dsh-upd-spin{animation:dsh-upd-rotate 1s linear infinite}",
  ".dsh-upd-lock,.dsh-upd-card,.dsh-upd-settings,.dsh-upd-btn,.dsh-upd-primary,.dsh-upd-ghost{font-family:var(--dsw-font-family,inherit)}",
  ".dsh-upd-lock{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1,color-mix(in srgb, var(--dsw-alias-bg-base) 78%, transparent));backdrop-filter:blur(12px);color:var(--dsw-alias-label-primary)}",
  ".dsh-upd-card{width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;border-radius:16px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-primary));color:var(--dsw-alias-label-primary);box-shadow:0 16px 48px color-mix(in srgb, var(--dsw-alias-bg-base) 55%, transparent);padding:32px;display:flex;flex-direction:column;gap:20px}",
  ".dsh-upd-brand{display:flex;flex-direction:column;align-items:center;gap:12px;margin:0}",
  ".dsh-upd-mark{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:var(--dsw-alias-fill-l2, color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent));border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}",
  ".dsh-upd-mark.busy{animation:dsh-upd-pulse 1.6s ease-in-out infinite}",
  ".dsh-upd-word{font-size:12px;letter-spacing:.16em;font-weight:600;color:var(--dsw-alias-label-primary)}",
  ".dsh-upd-tag{margin:0;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;font-weight:400}",
  ".dsh-upd-disc{margin:4px 0 0;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
  ".dsh-upd-versions{display:grid;grid-template-columns:1fr auto 1fr;gap:16px;align-items:center;margin:0}",
  ".dsh-upd-ver{padding:10px 12px;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-secondary))}",
  ".dsh-upd-ver span{display:block;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}",
  ".dsh-upd-ver strong{display:block;margin-top:2px;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}",
  ".dsh-upd-bars{display:flex;flex-direction:column;gap:16px;margin:0}",
  ".dsh-upd-bar-label{display:flex;justify-content:space-between;font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:8px}",
  ".dsh-upd-track{height:6px;border-radius:999px;background:var(--dsw-alias-fill-l2, color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent));overflow:hidden}",
  ".dsh-upd-fill{height:100%;border-radius:999px;background:var(--dsw-alias-button-primary-fill, var(--dsw-alias-label-primary));transition:width .35s ease}",
  ".dsh-upd-fill.live{background-image:linear-gradient(90deg,transparent,color-mix(in srgb, var(--dsw-alias-label-inverse, #fff) 28%, transparent),transparent);background-size:200% 100%;animation:dsh-upd-shimmer 1.2s linear infinite}",
  ".dsh-upd-log,.dsh-upd-notes,.dsh-upd-cmd{margin:0;overflow:auto;padding:10px 12px;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-secondary)));color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-family, inherit);font-size:12px;line-height:18px;white-space:pre-wrap;word-break:break-word}",
  ".dsh-upd-log{max-height:160px}",
  ".dsh-upd-notes{max-height:140px}",
  ".dsh-upd-cmd{color:var(--dsw-alias-label-tertiary)}",
  ".dsh-upd-actions{display:flex;gap:10px;justify-content:flex-end;margin:4px 0 0;flex-wrap:wrap}",
  ".dsh-upd-check{display:flex;gap:10px;align-items:flex-start;margin:0;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary)}",
  ".dsh-upd-check input{margin-top:2px;accent-color:var(--dsw-alias-button-primary-fill, var(--dsw-alias-label-primary))}",
  ".dsh-upd-primary,.dsh-upd-ghost{height:32px;padding:0 14px;border-radius:16px;font-family:var(--dsw-font-family, inherit);font-size:13px;font-weight:600;line-height:18px;cursor:pointer}",
  ".dsh-upd-primary{border:none;color:var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base));background:var(--dsw-alias-label-primary)}",
  ".dsh-upd-primary:hover{filter:brightness(1.08)}",
  ".dsh-upd-primary:disabled{opacity:.45;cursor:default}",
  ".dsh-upd-ghost{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}",
  ".dsh-upd-ghost:hover{background:var(--dsw-alias-interactive-bg-hover)}",
  ".dsh-upd-settings{display:flex;flex-direction:column;gap:14px;padding:16px;max-width:720px;color:var(--dsw-alias-label-primary)}",
  ".dsh-upd-settings h2{margin:0;font-size:16px}",
  ".dsh-upd-row{display:grid;grid-template-columns:140px 1fr;gap:8px;font-size:13px}",
  ".dsh-upd-row span{color:var(--dsw-alias-label-tertiary)}",
  ".dsh-upd-mode{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px}",
  ".dsh-upd-mode[data-on=\"true\"]{border-color:var(--dsw-alias-label-primary)}",
].join("");

function h(type, props) {
  var children = Array.prototype.slice.call(arguments, 2);
  return React.createElement.apply(React, [type, props || null].concat(children));
}

function ensureStyle() {
  if (typeof document === "undefined") return;
  var el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = CSS;
}

var listeners = [];
var ui = {
  overlay: false,
  agreed: false,
  reloading: false,
  reloadIn: 0,
};
var snapshot = {
  phase: "checking",
  current: null,
  latest: null,
  target: null,
  updateAvailable: false,
  pendingRestart: false,
  installed: null,
  error: null,
  detail: "",
  checkedAt: 0,
  download: 0,
  install: 0,
  logs: [],
  command: [],
  mode: null,
  modes: [],
  notes: null,
  persist: false,
  writable: false,
  locked: false,
  rollbackAvailable: false,
  restartKind: "exit",
  engineDir: null,
  successFrom: null,
  successTo: null,
  community: true,
  tagline: "One-click updates for DeepSeek Harness, like Codex.",
  disclaimer: "Community plugin — not official DeepSeek software.",
};

function busyPhase(phase) {
  return phase === "backing-up" || phase === "seeding" || phase === "planning" || phase === "downloading" || phase === "installing" || phase === "extracting" || phase === "rebuilding" || phase === "verifying" || phase === "restarting" || phase === "updating";
}

function publish(next) {
  if (!next || typeof next !== "object") return;
  snapshot = {
    phase: typeof next.phase === "string" ? next.phase : snapshot.phase,
    current: next.current != null ? next.current : snapshot.current,
    latest: next.latest != null ? next.latest : snapshot.latest,
    target: next.target != null ? next.target : snapshot.target,
    updateAvailable: next.updateAvailable === true,
    pendingRestart: next.pendingRestart === true,
    installed: next.installed != null ? next.installed : null,
    error: typeof next.error === "string" ? next.error : (next.error == null ? null : snapshot.error),
    detail: typeof next.detail === "string" ? next.detail : "",
    checkedAt: typeof next.checkedAt === "number" ? next.checkedAt : snapshot.checkedAt,
    download: typeof next.download === "number" ? next.download : snapshot.download,
    install: typeof next.install === "number" ? next.install : snapshot.install,
    logs: Array.isArray(next.logs) ? next.logs : snapshot.logs,
    command: Array.isArray(next.command) ? next.command : snapshot.command,
    mode: next.mode || snapshot.mode,
    modes: Array.isArray(next.modes) ? next.modes : snapshot.modes,
    notes: next.notes !== undefined ? next.notes : snapshot.notes,
    persist: next.persist === true,
    writable: next.writable === true,
    locked: next.locked === true,
    rollbackAvailable: next.rollbackAvailable === true,
    restartKind: next.restartKind === "manual" ? "manual" : "exit",
    engineDir: typeof next.engineDir === "string" ? next.engineDir : snapshot.engineDir,
    successFrom: next.successFrom != null ? next.successFrom : (next.phase === "success" ? snapshot.successFrom : null),
    successTo: next.successTo != null ? next.successTo : (next.phase === "success" ? snapshot.successTo : null),
    community: true,
    tagline: next.tagline || snapshot.tagline,
    disclaimer: next.disclaimer || snapshot.disclaimer,
  };
  if (busyPhase(snapshot.phase) || snapshot.pendingRestart || snapshot.phase === "confirm" || snapshot.phase === "done" || snapshot.phase === "success") {
    ui.overlay = true;
  }
  if (snapshot.restartKind !== "manual" && (snapshot.pendingRestart || snapshot.phase === "restarting")) {
    armReload();
  }
  for (var i = 0; i < listeners.length; i++) listeners[i]();
}

function setUi(partial) {
  Object.assign(ui, partial);
  for (var i = 0; i < listeners.length; i++) listeners[i]();
}

function subscribe(fn) {
  listeners.push(fn);
  return function () {
    var index = listeners.indexOf(fn);
    if (index !== -1) listeners.splice(index, 1);
  };
}

function fail(err) {
  publish({
    phase: "error",
    current: snapshot.current,
    latest: snapshot.latest,
    target: snapshot.target,
    updateAvailable: snapshot.updateAvailable,
    pendingRestart: false,
    error: err && err.message ? String(err.message) : "Update failed",
    detail: snapshot.detail,
    download: snapshot.download,
    install: snapshot.install,
    logs: snapshot.logs,
    command: snapshot.command,
    notes: snapshot.notes,
    mode: snapshot.mode,
    modes: snapshot.modes,
  });
}

function call(method, payload) {
  if (!rpcHandle) return Promise.reject(new Error("rpc unavailable"));
  return rpcHandle.call(CHANNEL, method, payload || {}).then(function (result) {
    if (!result || !result.ok) throw new Error(result && result.error && result.error.message || "rpc failed");
    publish(result.value);
    return result.value;
  });
}

function pull(method, payload) {
  call(method, payload).catch(function (err) {
    if (busyPhase(snapshot.phase)) return;
    fail(err);
  });
}

function armReload() {
  if (ui.reloading) return;
  ui.reloading = true;
  ui.reloadIn = 12;
  function tick() {
    if (ui.reloadIn <= 0) {
      window.location.reload();
      return;
    }
    ui.reloadIn -= 1;
    for (var i = 0; i < listeners.length; i++) listeners[i]();
    reloadTimer = window.setTimeout(tick, 1000);
  }
  if (reloadTimer) window.clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(tick, 1000);
}

function useStore() {
  var pair = React.useState(0);
  var bump = pair[1];
  React.useEffect(function () {
    return subscribe(function () { bump(function (n) { return n + 1; }); });
  }, []);
  return { snapshot: snapshot, ui: ui };
}

function Mark(props) {
  var busy = props.busy === true;
  return h(
    "div",
    { className: busy ? "dsh-upd-mark busy" : "dsh-upd-mark", "aria-hidden": "true" },
    h(
      "svg",
      { className: busy ? "dsh-upd-icon dsh-upd-spin" : "dsh-upd-icon", width: 36, height: 36, viewBox: "0 0 36 36", fill: "none" },
      h("circle", { cx: 18, cy: 18, r: 14, stroke: "currentColor", strokeWidth: 1.6, opacity: 0.35 }),
      h("path", { d: "M18 6.8a11.2 11.2 0 1 1-7.9 3.3", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" }),
      h("path", { d: "M8.6 7.2v6H14.8", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }),
    ),
  );
}

function Bar(props) {
  var live = props.live === true && props.value < 100;
  return h(
    "div",
    null,
    h("div", { className: "dsh-upd-bar-label" }, h("span", null, props.label), h("span", null, Math.round(props.value) + "%")),
    h("div", { className: "dsh-upd-track" }, h("div", { className: live ? "dsh-upd-fill live" : "dsh-upd-fill", style: { width: Math.max(0, Math.min(100, props.value)) + "%" } })),
  );
}

function phaseCopy(state) {
  if (state.phase === "checking") return "Checking npm for a newer DeepSeek Harness…";
  if (state.phase === "confirm") return "Review the release, then confirm. Only changed packages are downloaded.";
  if (state.phase === "backing-up") return "Saving the current engine so we can roll back.";
  if (state.phase === "seeding") return state.detail || "Copying the current engine. Unchanged packages stay on disk — not a full reinstall.";
  if (state.phase === "planning") return state.detail || "Comparing your install to the new release. This is not resolving the whole npm tree.";
  if (state.phase === "downloading") return state.detail || "Downloading only packages that changed.";
  if (state.phase === "installing") return state.detail || "Writing updated packages, then replacing the running engine.";
  if (state.phase === "rebuilding") return state.detail || "Rebuilding native addons that changed (koffi / node-pty).";
  if (state.phase === "verifying") return "Checking the installed version.";
  if (state.restartKind === "manual" && (state.phase === "done" || state.pendingRestart)) {
    return "Installed. Quit DSH and start it again — do not keep this tab open on the old process.";
  }
  if (state.phase === "restarting" || state.pendingRestart) return "Engine installed. Harness is restarting.";
  if (state.phase === "done") return "Update complete.";
  if (state.phase === "success") return "Update complete. DeepSeek Harness is running the new engine.";
  if (state.phase === "error") return state.error || "Update failed.";
  if (state.phase === "rolled-back") return "Previous engine restored.";
  if (state.updateAvailable) return "A newer DeepSeek Harness is available.";
  return state.detail || "Up to date.";
}

function Overlay() {
  var store = useStore();
  var state = store.snapshot;
  var open = store.ui.overlay;
  var busy = busyPhase(state.phase) || state.pendingRestart;
  React.useEffect(function () {
    var log = document.getElementById("dsh-upd-log");
    if (log) log.scrollTop = log.scrollHeight;
  }, [state.logs && state.logs.length, state.phase]);
  if (!open) return null;
  var notes = state.notes && (state.notes.body || state.notes.title);
  var canClose = !busy && state.phase !== "confirm";
  return h(
    "div",
    { className: "dsh-upd-lock", role: "dialog", "aria-modal": "true", "aria-label": "Harness update" },
    h(
      "div",
      { className: "dsh-upd-card" },
      h(
        "div",
        { className: "dsh-upd-brand" },
        h(Mark, { busy: busy || state.phase === "checking" }),
        h("div", { className: "dsh-upd-word" }, "HARNESS"),
        h("p", { className: "dsh-upd-tag" }, state.tagline),
        h("p", { className: "dsh-upd-disc" }, state.disclaimer),
      ),
      h("p", { className: "dsh-upd-tag" }, phaseCopy(state)),
      h(
        "div",
        { className: "dsh-upd-versions" },
        h("div", { className: "dsh-upd-ver" }, h("span", null, state.phase === "success" ? "From" : "Current"), h("strong", null, state.phase === "success" ? (state.successFrom || "—") : (state.current || "—"))),
        h("div", { style: { textAlign: "center", color: "var(--dsw-alias-label-tertiary)" } }, "→"),
        h("div", { className: "dsh-upd-ver" }, h("span", null, state.phase === "success" ? "Now" : "Available"), h("strong", null, state.phase === "success" ? (state.successTo || state.current || "—") : (state.updateAvailable ? (state.target || state.latest || "—") : (state.current || "—")))),
      ),
      (state.phase === "seeding" || state.phase === "planning" || state.phase === "downloading" || state.phase === "installing" || state.phase === "rebuilding" || state.phase === "verifying" || state.pendingRestart)
        ? h(
          "div",
          { className: "dsh-upd-bars" },
          h(Bar, { label: "Fetch", value: state.download || 0, live: state.phase === "seeding" || state.phase === "planning" || state.phase === "downloading" }),
          h(Bar, { label: "Apply", value: state.install || 0, live: state.phase === "installing" || state.phase === "rebuilding" || state.phase === "verifying" }),
        )
        : null,
      notes && state.phase === "confirm"
        ? h("pre", { className: "dsh-upd-notes" }, (state.notes.title ? state.notes.title + "\n\n" : "") + (state.notes.body || ""))
        : null,
      state.command && state.command.length && state.phase === "confirm"
        ? h("p", { className: "dsh-upd-cmd" }, state.command.join(" "))
        : null,
      state.logs && state.logs.length
        ? h("pre", { id: "dsh-upd-log", className: "dsh-upd-log" }, state.logs.join("\n"))
        : null,
      state.phase === "confirm"
        ? h(
          "label",
          { className: "dsh-upd-check" },
          h("input", {
            type: "checkbox",
            checked: store.ui.agreed,
            onChange: function (event) { setUi({ agreed: event.target.checked }); },
          }),
          "I confirm installing ",
          h("code", null, "@deepseek-ai/dsh@" + (state.target || state.latest)),
          ". Current engine is copied first; only packages that changed are downloaded — not a full npm install. No sudo. Previous engine is backed up for rollback.",
        )
        : null,
      (state.pendingRestart || state.phase === "restarting") && state.restartKind !== "manual"
        ? h("p", { className: "dsh-upd-tag" }, "Reloading in " + store.ui.reloadIn + "s — do not close this tab.")
        : null,
      h(
        "div",
        { className: "dsh-upd-actions" },
        canClose
          ? h("button", { type: "button", className: "dsh-upd-ghost", onClick: function () {
            if (state.phase === "success") {
              call("dismiss", {}).catch(function () {});
            }
            setUi({ overlay: false, agreed: false });
          } }, "Close")
          : null,
        state.phase === "success"
          ? h("button", { type: "button", className: "dsh-upd-primary", onClick: function () {
            call("dismiss", {}).catch(function () {});
            setUi({ overlay: false, agreed: false });
          } }, "OK")
          : null,
        state.phase === "error" && state.rollbackAvailable
          ? h("button", { type: "button", className: "dsh-upd-ghost", onClick: function () { pull("rollback"); } }, "Rollback")
          : null,
        state.phase === "confirm"
          ? h(
            "button",
            {
              type: "button",
              className: "dsh-upd-primary",
              disabled: !store.ui.agreed,
              onClick: function () {
                if (!store.ui.agreed) return;
                call("update", { confirm: true, version: state.target }).catch(fail);
              },
            },
            "Install " + (state.target || ""),
          )
          : null,
        state.updateAvailable && !busy && state.phase !== "confirm" && state.phase !== "error"
          ? h(
            "button",
            {
              type: "button",
              className: "dsh-upd-primary",
              onClick: function () { call("update", { version: state.target }).catch(fail); },
            },
            "Continue",
          )
          : null,
      ),
    ),
  );
}

function SettingsSection(props) {
  var rpc = (props && props.rpc) || rpcHandle;
  var store = useStore();
  var state = store.snapshot;
  React.useEffect(function () {
    if (rpc) rpcHandle = rpc;
  }, [rpc]);
  var modes = state.modes || [];
  return h(
    "div",
    { className: "dsh-upd-settings" },
    h("h2", null, "Updates"),
    h("p", { className: "dsh-upd-tag", style: { textAlign: "left" } }, state.tagline),
    h("p", { className: "dsh-upd-disc", style: { textAlign: "left" } }, state.disclaimer),
    h("div", { className: "dsh-upd-row" }, h("span", null, "Current"), h("strong", null, state.current || "—")),
    h("div", { className: "dsh-upd-row" }, h("span", null, "Available"), h("strong", null, (state.target || state.latest || "—") + (state.updateAvailable ? "" : " (up to date)"))),
    h("div", { className: "dsh-upd-row" }, h("span", null, "Mode"), h("strong", null, state.mode && state.mode.active ? state.mode.active : "—")),
    h("div", { className: "dsh-upd-row" }, h("span", null, "Engine"), h("strong", { style: { wordBreak: "break-all", fontWeight: 500 } }, state.engineDir || (state.mode && state.mode.engineDir) || "—")),
    h("div", { className: "dsh-upd-row" }, h("span", null, "Restart"), h("strong", null, state.restartKind === "manual" ? "Quit DSH, then start it again" : "Process exit (Docker / supervisor)")),
    h(
      "div",
      { className: "dsh-upd-actions", style: { justifyContent: "flex-start" } },
      h("button", { type: "button", className: "dsh-upd-ghost", onClick: function () { pull("check"); } }, "Check for updates"),
      state.updateAvailable
        ? h("button", {
          type: "button",
          className: "dsh-upd-primary",
          onClick: function () {
            setUi({ overlay: true, agreed: false });
            call("update", { version: state.target }).catch(fail);
          },
        }, "Update to " + (state.target || state.latest))
        : null,
    ),
    state.notes && state.notes.body
      ? h("pre", { className: "dsh-upd-notes" }, (state.notes.title || "Release notes") + "\n\n" + state.notes.body)
      : null,
    h("p", { className: "dsh-upd-disc", style: { textAlign: "left", marginTop: 8 } }, "Install methods"),
    modes.map(function (mode) {
      return h(
        "div",
        { key: mode.id, className: "dsh-upd-mode", "data-on": String(mode.active === true) },
        h("strong", null, (mode.active ? "● " : "○ ") + mode.label + (mode.recommended ? " · recommended for CLI" : "")),
        h("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)" } }, mode.reason),
      );
    }),
  );
}

function UpdateButton(props) {
  var wide = props && props.wide === true;
  var store = useStore();
  var state = store.snapshot;
  var busy = busyPhase(state.phase) || state.phase === "checking";
  var label = "Update";
  var tone = "ready";
  if (state.phase === "checking") { label = "Checking…"; }
  if (busyPhase(state.phase)) { label = "Updating…"; }
  if (state.pendingRestart || state.phase === "restarting") { label = "Restart"; tone = "done"; }
  if (state.phase === "success") { label = "Updated"; tone = "done"; }
  if (state.phase === "error") { label = "Retry"; tone = "error"; }
  if (!state.updateAvailable && !busy && state.phase !== "error" && state.phase !== "success") {
    label = "Updates";
    tone = "done";
  }
  return h(
    "div",
    { className: wide ? "dsh-upd-layer" : "dsh-upd-layer rail" },
    h(
      "button",
      {
        type: "button",
        className: "dsh-upd-btn",
        "data-tone": tone,
        title: phaseCopy(state),
        "aria-label": phaseCopy(state),
        onClick: function () {
          setUi({ overlay: true, agreed: false });
          if (state.phase === "error") {
            pull("check");
            return;
          }
          if (state.phase === "success") return;
          if (!state.updateAvailable) {
            pull("status");
            return;
          }
          if (!busyPhase(state.phase) && !state.pendingRestart) {
            call("update", { version: state.target }).catch(fail);
          }
        },
      },
      wide ? null : h(
        "svg",
        {
          className: busy ? "dsh-upd-icon dsh-upd-spin" : "dsh-upd-icon",
          width: 18,
          height: 18,
          viewBox: "0 0 16 16",
          fill: "none",
          "aria-hidden": "true",
        },
        h("path", { d: "M8 2.2a5.8 5.8 0 1 1-4.1 1.7", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }),
        h("path", { d: "M3.2 2.4v3.1H6.3", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }),
      ),
      wide ? h("span", { className: "dsh-upd-label" }, label) : null,
      !wide && state.updateAvailable && !busy ? h("span", { className: "dsh-upd-dot" }) : null,
    ),
  );
}

function apply(ctx) {
  var slots = ctx.get("slots");
  var connection = ctx.get("connection");
  if (!slots || !connection) return;
  rpcHandle = connection.rpc;
  ensureStyle();
  pull("status");
  ctx.timeout(function () { pull("check"); }, 250);
  ctx.interval(function () {
    if (ui.overlay && snapshot.phase === "confirm" && !busyPhase(snapshot.phase)) return;
    pull("status");
  }, 700);

  slots.inject("sidebar.footer.action", function () {
    return slots.register(
      { name: "sidebar.footer.action", id: "dsh-update", order: 80, label: "Update" },
      UpdateButton,
    );
  });
  slots.inject("settings.section", function () {
    return slots.register({
      name: "settings.section",
      id: "updates",
      order: 40,
      label: function () { return "Updates"; },
      inject: function () { return { rpc: connection.rpc }; },
    }, SettingsSection);
  });
  slots.inject("shell.overlay", function () {
    return slots.register(
      { name: "shell.overlay", id: "dsh-update-lock", order: 20, label: "Harness update" },
      Overlay,
    );
  });
}

exports.apply = apply;
exports.inject = ["slots", "connection", "locale", "timer"];
return module.exports;
} });
