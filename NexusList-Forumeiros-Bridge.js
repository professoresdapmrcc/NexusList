/* Install in the forum's JavaScript manager, on all pages.
 * Only add origins that actually host your NexusList. Never use a wildcard.
 */
(() => {
  "use strict";
  if (window.location.origin !== "https://www.policiarcc.com") return;
  const ALLOWED_ORIGINS = new Set([
    "https://professoresdapmrcc.github.io",
    "https://nexusprof.netlify.app"
  ]);
  const ORIGIN = window.location.origin;
  const KEY = "NEXUSLIST_FORUM_OPERATIONS_V2";
  const operations = new Map();
  try {
    for (const [id, entry] of JSON.parse(sessionStorage.getItem(KEY) || "[]")) {
      if (Date.now() - entry.at < 24 * 60 * 60 * 1000) operations.set(id, { ...entry, running: false });
    }
  } catch { /* In-memory deduplication remains active. */ }

  function persist() {
    try { sessionStorage.setItem(KEY, JSON.stringify([...operations])); } catch { /* Optional storage. */ }
  }
  async function request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal, credentials: "include", cache: "no-store" });
      const html = await response.text();
      if (!response.ok) throw new Error("O fórum respondeu com status " + response.status + ".");
      const doc = new DOMParser().parseFromString(html, "text/html");
      if (/\/login(?:\?|$)/i.test(response.url) || doc.querySelector('form[action*="/login"] input[name="username"]')) {
        throw new Error("Sua sessão do fórum expirou. Entre novamente.");
      }
      return { response, doc };
    } finally { clearTimeout(timeout); }
  }
  function confirmedPost(doc, responseUrl, topicId) {
    const error = doc.querySelector(".message-die, .error, .panel .error, .block-error");
    if (error?.textContent.trim()) throw new Error(error.textContent.trim());
    const urls = [responseUrl];
    doc.querySelectorAll('meta[http-equiv="refresh" i]').forEach(meta => {
      const match = (meta.getAttribute("content") || "").match(/url\s*=\s*['"]?([^'";]+)/i);
      if (match) urls.push(new URL(match[1], ORIGIN).href);
    });
    if (/mensagem.{0,40}(?:enviada|publicada|registrada)|(?:enviad|publicad)[ao].{0,30}sucesso|message.{0,40}(?:posted|sent)/i.test(doc.body?.textContent || "")) {
      doc.querySelectorAll('a[href]').forEach(link => {
        if (/ver|visualizar|mensagem|postagem|message|post|view/i.test(link.textContent || "")) urls.push(new URL(link.getAttribute("href"), ORIGIN).href);
      });
    }
    return urls.find(value => {
      const url = new URL(value, ORIGIN);
      const topic = /^\/t(\d+)(?:p\d+)?(?:-|$)/.exec(url.pathname);
      return url.origin === ORIGIN && topic?.[1] === String(topicId) &&
        (/^#(?:p|msg)?\d+$/.test(url.hash) || /^\d+$/.test(url.searchParams.get("p") || ""));
    });
  }
  async function reply(message, markSubmitted) {
    const url = new URL("/post", ORIGIN);
    url.searchParams.set("mode", "reply"); url.searchParams.set("t", message.topicId);
    const page = await request(url);
    const form = Array.from(page.doc.forms).find(form => form.querySelector('textarea[name="message"]'));
    if (!form) throw new Error("O formulário de resposta não foi encontrado. Verifique sua permissão.");
    const action = new URL(form.getAttribute("action") || "/post", ORIGIN);
    if (action.origin !== ORIGIN || action.pathname !== "/post") throw new Error("Destino de postagem inválido.");
    const body = new FormData(form);
    body.set("message", message.bbcode); body.set("post", "Enviar");
    body.delete("preview"); body.delete("disable_html");
    markSubmitted();
    const posted = await request(action, { method: "POST", body });
    const postUrl = confirmedPost(posted.doc, posted.response.url, message.topicId);
    if (!postUrl) throw new Error("A publicação não foi confirmada. Confira o tópico antes de repetir.");
    return postUrl;
  }
  window.addEventListener("message", async event => {
    const message = event.data;
    if (!ALLOWED_ORIGINS.has(event.origin) || !window.opener || event.source !== window.opener ||
        !message || !/^[A-Za-z0-9-]{8,160}$/.test(message.requestId || "")) return;
    const send = result => event.source.postMessage({ ...result, requestId: message.requestId }, event.origin);
    if (message.type === "NEXUSLIST_FORUM_HELLO") {
      send({ type: "NEXUSLIST_FORUM_READY", version: 2 }); return;
    }
    if (message.type !== "NEXUSLIST_FORUM_ACTION" || message.action !== "reply" ||
        !/^\d+$/.test(String(message.topicId)) || typeof message.bbcode !== "string" ||
        !message.bbcode.trim() || message.bbcode.length > 100000) return;
    const existing = operations.get(message.requestId);
    if (existing) {
      if (existing.result) send(existing.result);
      else if (!existing.running) send({ type: "NEXUSLIST_FORUM_RESULT", ok: false, uncertain: true,
        error: "Uma operação anterior ficou sem confirmação. Confira o tópico antes de repetir." });
      return;
    }
    // Record before any await: retransmissions cannot start another POST.
    const entry = { at: Date.now(), running: true, submitted: false };
    operations.set(message.requestId, entry); persist();
    try {
      const postUrl = await reply(message, () => { entry.submitted = true; persist(); });
      entry.result = { type: "NEXUSLIST_FORUM_RESULT", ok: true, postUrl };
    } catch (error) {
      entry.result = { type: "NEXUSLIST_FORUM_RESULT", ok: false, uncertain: entry.submitted, error: error.message };
    } finally {
      entry.running = false; persist(); send(entry.result);
    }
  });
})();
