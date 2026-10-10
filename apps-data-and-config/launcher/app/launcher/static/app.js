// Launcher: estado de los servicios (cada 2 s), acciones y logs en vivo.

const STATUS_LABEL = {
  stopped: "Parado",
  starting: "Arrancando…",
  running: "En marcha",
  external: "En marcha (externo)",
  stopping: "Parando…",
  unhealthy: "Sin respuesta",
  error: "Error",
};
const UP = new Set(["running", "external", "unhealthy"]);
const BUSY = new Set(["starting", "stopping"]);

let services = [];
let pendingOpen = null; // opencode que se está arrancando para abrirlo al terminar

const $ = (sel) => document.querySelector(sel);
const byId = (id) => services.find((s) => s.id === id);
const esc = (text) =>
  String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    // X-Launcher: sin ella el servidor rechaza las acciones (protección CSRF).
    headers: { "X-Launcher": "1", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || res.statusText);
  return data;
}

// ------------------------------------------------------------------------------- render

function card(s) {
  const running = UP.has(s.status);
  const tags = [];
  if (s.options && s.id === "opencode") tags.push(s.options.hindsight ? "con Hindsight" : "sin Hindsight");
  if (s.status === "external") tags.push("arrancado fuera del launcher");

  const links = s.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`);
  if (s.id === "opencode" && (s.status === "running" || s.status === "external")) {
    links.push(`<button class="btn btn-small" data-action="pair">Abrir (enlace nuevo) ↗</button>`);
  }

  let action = "";
  if (BUSY.has(s.status)) action = `<button class="btn btn-small" disabled>${STATUS_LABEL[s.status]}</button>`;
  else if (running)
    action = `<button class="btn btn-small" data-action="stop" ${s.can_stop ? "" : 'disabled title="Arrancado fuera del launcher"'}>Parar</button>`;
  else if (s.id !== "opencode") action = `<button class="btn btn-small" data-action="start">Arrancar</button>`;

  const reset =
    s.reset_confirm && !BUSY.has(s.status)
      ? `<button class="btn btn-small btn-danger" data-action="reset">Borrar datos</button>`
      : "";

  return `
    <article class="card" data-id="${s.id}">
      <div class="card-head">
        <strong>${esc(s.name)}</strong>
        <span class="badge" data-status="${s.status}">${STATUS_LABEL[s.status] ?? s.status}</span>
      </div>
      <p class="desc">${esc(s.description)}</p>
      ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
      ${s.detail ? `<p class="detail">${esc(s.detail)}…</p>` : ""}
      ${s.error ? `<p class="error">${esc(s.error)}</p>` : ""}
      ${s.notice ? `<p class="notice">${esc(s.notice)}</p>` : ""}
      ${links.length ? `<div class="links">${links.join("")}</div>` : ""}
      <div class="actions">${action}<button class="btn btn-small" data-action="logs">Logs</button>${reset}</div>
    </article>`;
}

function render() {
  for (const grid of document.querySelectorAll(".grid[data-group]")) {
    grid.innerHTML = services.filter((s) => s.group === grid.dataset.group).map(card).join("");
  }
  const anyBusy = services.some((s) => BUSY.has(s.status));
  $("#open-opencode").disabled = Boolean(pendingOpen);
  $("#start-core").disabled = ["postgres", "otel-lgtm", "litellm"].every((id) => {
    const s = byId(id);
    return s && (s.status === "running" || s.status === "external" || s.status === "starting");
  });
  document.title = anyBusy ? "⏳ genai-local-stack · Launcher" : "genai-local-stack · Launcher";
}

async function refresh() {
  try {
    services = await api("/api/services");
    render();
    await checkPendingOpen();
  } catch (e) {
    $("#launch-msg").textContent = `Sin conexión con el launcher: ${e.message}`;
  }
}

// ---------------------------------------------------------------------------- opencode

function message(text) {
  $("#launch-msg").textContent = text;
}

function loadingTab(text) {
  // Se abre ya, durante el clic, para que el navegador no la bloquee al abrirla más tarde.
  const win = window.open("about:blank", "_blank");
  if (win) win.document.write(`<title>opencode</title><p style="font:16px system-ui;padding:2rem">${esc(text)}</p>`);
  return win;
}

async function goToOpencode(win) {
  const { url } = await api("/api/opencode/pair", { method: "POST" });
  if (win) win.location = url;
  else window.open(url, "_blank");
}

async function openOpencode() {
  const hindsight = $("#with-hindsight").checked;
  const svc = byId("opencode");
  // Listo: arrancado por el launcher con las mismas opciones, o en marcha fuera (se usa tal cual).
  const external = svc?.status === "external";
  const ready = svc && ((svc.status === "running" && svc.options?.hindsight === hindsight) || external);

  const win = loadingTab("Arrancando opencode…");
  try {
    if (ready) {
      await goToOpencode(win);
      message(
        external
          ? "opencode ya estaba en marcha fuera del launcher: se abre tal cual (la opción de memoria no se aplica)."
          : "opencode ya estaba en marcha.",
      );
      return;
    }
    await api("/api/opencode/start", { method: "POST", body: { hindsight } });
    pendingOpen = { hindsight, win };
    message(`Arrancando opencode ${hindsight ? "con" : "sin"} Hindsight y lo que necesite…`);
    render();
  } catch (e) {
    win?.close();
    message(`No se pudo abrir opencode: ${e.message}`);
  }
}

async function checkPendingOpen() {
  if (!pendingOpen) return;
  const p = pendingOpen;
  const s = byId("opencode");
  if (!s || BUSY.has(s.status)) return;
  if ((s.status === "running" && s.options?.hindsight === p.hindsight) || s.status === "external") {
    pendingOpen = null;
    try {
      await goToOpencode(p.win);
      message(s.notice ?? "opencode listo: se ha abierto en la pestaña nueva.");
    } catch (e) {
      p.win?.close();
      message(`opencode está en marcha, pero no se pudo abrir: ${e.message}`);
    }
    render();
  } else if (s.error) {
    pendingOpen = null;
    p.win?.close();
    message(`No se pudo arrancar opencode: ${s.error}`);
    render();
  }
}

// -------------------------------------------------------------------------------- logs

let logSource = null;

function openLogs(sid) {
  logSource?.close();
  const pre = $("#logs-text");
  pre.textContent = "";
  $("#logs-title").textContent = `Logs · ${byId(sid)?.name ?? sid}`;
  $("#logs").hidden = false;
  logSource = new EventSource(`/api/services/${sid}/logs/stream`);
  logSource.onmessage = (event) => {
    // Sin códigos de color ANSI; como mucho ~300 KB en pantalla.
    pre.textContent = (pre.textContent + JSON.parse(event.data).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")).slice(-300_000);
    if ($("#logs-follow").checked) pre.scrollTop = pre.scrollHeight;
  };
}

function closeLogs() {
  logSource?.close();
  logSource = null;
  $("#logs").hidden = true;
}

// ----------------------------------------------------------------------------- eventos

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const sid = button.closest("[data-id]")?.dataset.id;
  try {
    switch (button.dataset.action) {
      case "start":
        await api(`/api/services/${sid}/start`, { method: "POST" });
        break;
      case "stop":
        await api(`/api/services/${sid}/stop`, { method: "POST" });
        break;
      case "reset":
        if (!confirm(byId(sid).reset_confirm)) return;
        await api(`/api/services/${sid}/reset`, { method: "POST" });
        break;
      case "logs":
        openLogs(sid);
        return;
      case "pair":
        await goToOpencode(loadingTab("Abriendo opencode…"));
        return;
    }
    refresh();
  } catch (e) {
    message(e.message);
  }
});

$("#start-core").addEventListener("click", async () => {
  await api("/api/core/start", { method: "POST" });
  refresh();
});

$("#stop-all").addEventListener("click", async () => {
  if (!confirm("¿Parar todos los servicios que ha arrancado el launcher?")) return;
  await api("/api/stop-all", { method: "POST" });
  refresh();
});

$("#open-opencode").addEventListener("click", openOpencode);
$("#logs-close").addEventListener("click", closeLogs);

refresh();
setInterval(refresh, 2000);
