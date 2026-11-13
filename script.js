(() => {
      "use strict";

      const THEME_STORAGE_KEY = "NEXUSLIST_THEME";
      const VISION_STORAGE_KEY = "NEXUSLIST_VISION_SETTINGS";
      const VISION_SCALES = Object.freeze(["normal", "large", "larger"]);

      function setTheme(theme, options = {}) {
        const nextTheme = theme === "light" ? "light" : "dark";
        const isDark = nextTheme === "dark";
        const toggle = document.getElementById("theme-toggle");

        document.documentElement.dataset.theme = nextTheme;
        document
          .querySelector('meta[name="theme-color"]')
          .setAttribute("content", isDark ? "#0F0512" : "#821F88");

        if (toggle) {
          const nextModeLabel = isDark ? "claro" : "escuro";
          toggle.setAttribute("aria-label", `Ativar modo ${nextModeLabel}`);
          toggle.setAttribute("aria-pressed", String(isDark));
          toggle.setAttribute("title", `Ativar modo ${nextModeLabel}`);
        }

        if (options.persist) {
          try {
            localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
          } catch {
            // O tema continua ativo mesmo quando o navegador bloqueia o armazenamento.
          }
        }
      }

      function initializeTheme() {
        setTheme(document.documentElement.dataset.theme);
        document.getElementById("theme-toggle").addEventListener("click", () => {
          const currentTheme = document.documentElement.dataset.theme;
          setTheme(currentTheme === "dark" ? "light" : "dark", {
            persist: true
          });
        });
      }

      function setVisionPanelOpen(isOpen) {
        const panel = document.getElementById("vision-panel");
        const toggle = document.getElementById("vision-toggle");

        panel.hidden = !isOpen;
        toggle.setAttribute("aria-expanded", String(isOpen));
        toggle.setAttribute(
          "aria-label",
          isOpen
            ? "Fechar ajustes para baixa visão"
            : "Abrir ajustes para baixa visão"
        );
      }

      function applyVisionSettings(settings, options = {}) {
        const scale = VISION_SCALES.includes(settings.scale)
          ? settings.scale
          : "normal";
        const highContrast = settings.highContrast === true;

        document.documentElement.dataset.visionScale = scale;
        document.documentElement.dataset.visionContrast = highContrast
          ? "high"
          : "standard";

        document
          .querySelectorAll("[data-vision-scale-option]")
          .forEach((button) => {
            button.setAttribute(
              "aria-pressed",
              String(button.dataset.visionScaleOption === scale)
            );
          });

        const contrastButton = document.getElementById("vision-contrast");
        contrastButton.setAttribute("aria-pressed", String(highContrast));
        document.getElementById("vision-contrast-state").textContent =
          highContrast ? "Ativado" : "Desativado";

        if (options.persist) {
          try {
            localStorage.setItem(
              VISION_STORAGE_KEY,
              JSON.stringify({ scale, highContrast })
            );
          } catch {
            // As preferências continuam ativas durante a sessão atual.
          }
        }
      }

      function currentVisionSettings() {
        return {
          scale: document.documentElement.dataset.visionScale || "normal",
          highContrast:
            document.documentElement.dataset.visionContrast === "high"
        };
      }

      function initializeVisionTools() {
        const toggle = document.getElementById("vision-toggle");
        const panel = document.getElementById("vision-panel");
        const contrastButton = document.getElementById("vision-contrast");

        applyVisionSettings(currentVisionSettings());

        toggle.addEventListener("click", () => {
          setVisionPanelOpen(panel.hidden);
        });

        document
          .querySelectorAll("[data-vision-scale-option]")
          .forEach((button) => {
            button.addEventListener("click", () => {
              const settings = currentVisionSettings();
              applyVisionSettings(
                {
                  ...settings,
                  scale: button.dataset.visionScaleOption
                },
                { persist: true }
              );
            });
          });

        contrastButton.addEventListener("click", () => {
          const settings = currentVisionSettings();
          applyVisionSettings(
            {
              ...settings,
              highContrast: !settings.highContrast
            },
            { persist: true }
          );
        });

        document.getElementById("vision-reset").addEventListener("click", () => {
          applyVisionSettings(
            { scale: "normal", highContrast: false },
            { persist: true }
          );
        });

        document.addEventListener("click", (event) => {
          if (
            !panel.hidden &&
            !panel.contains(event.target) &&
            !toggle.contains(event.target)
          ) {
            setVisionPanelOpen(false);
          }
        });
      }

      const CONFIG = Object.freeze({
        workerProxy: "https://nexus.nexusdevrcc.workers.dev/",
        cacheDurationMs: 5 * 60 * 1000,
        auth: Object.freeze({
          revalidateIntervalMs: 60 * 1000
        }),
        network: Object.freeze({
          readAttempts: 3,
          retryDelayMs: 450,
          readTimeoutMs: 20000
        }),
        sheets: Object.freeze({
          nexusListApi: "https://script.google.com/macros/s/AKfycbxwJPauO1fizPCgI5zfkpZSP58KSNJEVbFdX0-w8J4ZtOisV6cleL4J3Ep_gW432JyhmQ/exec"
        }),
        forum: Object.freeze({
          origin: "https://www.policiarcc.com",
          bridgeTimeoutMs: 25000
        })
      });

      const CACHE_PREFIX = "NEXUSLIST_CACHE_V3_";
      const ROLE_OPTIONS = Object.freeze([
        "Líder",
        "Vice-Líder",
        "Consultor(a)",
        "Conselheiro(a) da Administração",
        "Conselheiro(a) da Atualização",
        "Conselheiro(a) da Contabilidade",
        "Conselheiro(a) da Documentação",
        "Conselheiro(a) das Finanças",
        "Conselheiro(a) da Segurança",
        "Conselheiro(a) da Assistência",
        "Estagiário(a)",
        "Graduador(a)",
        "Coordenador(a)",
        "Professor(a)"
      ]);
      const NEXUS_MONTHS = Object.freeze([
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez"
      ]);
      const DATE_HEADER_KEYS = Object.freeze([
        "ENTRADA",
        "DATAPROMOREB",
        "PROMOREBAIX",
        "INICIO",
        "RETORNO",
        "TERMINO"
      ]);
      let currentUser = null;
      let authRevalidationTimer = null;

      function currentUserRoles(user = currentUser) {
        if (!user) return [];
        return [user.role, ...(Array.isArray(user.roles) ? user.roles : [])]
          .map((role) => String(role || "").trim())
          .filter(Boolean);
      }

      function canCurrentUserEdit(user = currentUser) {
        if (user && typeof user.canEdit === "boolean") {
          return user.canEdit;
        }
        return currentUserRoles(user).some((role) =>
          /^(?:DESENVOLVEDOR(?:\(A\))?|LIDER|VICE-LIDER)$/.test(
            normalizeLookup(role)
          )
        );
      }

      function canCurrentUserManageAccess(user = currentUser) {
        if (user && typeof user.canManageAccess === "boolean") {
          return user.canManageAccess;
        }
        return currentUserRoles(user).some((role) =>
          /^(?:DESENVOLVEDOR(?:\(A\))?|LIDER|VICE-LIDER)$/.test(
            normalizeLookup(role)
          )
        );
      }

      function requireEditAccess(options = {}) {
        if (canCurrentUserEdit()) return true;
        if (options.notify !== false) {
          showToast(
            "Seu usuário não possui acesso total para editar.",
            "warning"
          );
        }
        return false;
      }

      function requireManageAccess(options = {}) {
        if (canCurrentUserManageAccess()) return true;
        if (options.notify !== false) {
          showToast(
            "Somente a Liderança e Desenvolvedores podem gerenciar acessos adicionais.",
            "warning"
          );
        }
        return false;
      }

      function applyAccessMode() {
        const canEdit = canCurrentUserEdit();
        const canManageAccess = canCurrentUserManageAccess();
        document.documentElement.dataset.accessMode = canEdit
          ? "full"
          : "read-only";

        if (!canEdit) {
          appState.editingMembers = false;
          appState.removingMembers = false;
          appState.addingMember = false;
          appState.memberDrafts.clear();
          appState.selectedMemberRows.clear();
          [
            "add-member-editor",
            "requirements-dialog",
            "settings-editor",
            "layout-editor"
          ].forEach(
            (id) => {
              const dialog = document.getElementById(id);
              if (dialog && dialog.open) dialog.close();
            }
          );
        }

        const editLayoutButton = document.getElementById("edit-layout");
        editLayoutButton.hidden = !canEdit;
        editLayoutButton.disabled = !canEdit || !appState.settings.length;
        document.getElementById("nav-settings").hidden = !canEdit;
        document.getElementById("additional-access-section").hidden =
          !canManageAccess;

        if (!canManageAccess) {
          appState.additionalAccess = [];
          appState.additionalAccessRoles = [];
          appState.availableAccessRoles = [];
          renderAdditionalAccess();
          updateAdditionalAccessRoleOptions();
        }

        if (!canEdit && appState.currentView === "settings") {
          navigateToView("members", { force: true });
        }

        updateMemberEditControls();
        if (appState.settings.length) renderSettings();
      }

      const appState = {
        headers: [],
        rows: [],
        settings: [],
        additionalAccess: [],
        additionalAccessRoles: [],
        availableAccessRoles: [],
        publishing: null,
        maxDataRow: 1,
        currentView: "members",
        search: "",
        editingMembers: false,
        removingMembers: false,
        addingMember: false,
        selectedMemberRows: new Set(),
        memberDrafts: new Map(),
        booleanColumns: new Set(),
        loading: false,
        savingMembers: false,
        organizingMembers: false,
        requirementsBusy: false,
        licenseWorkflow: null,
        markingLicenseReturns: false,
        editingSettingsRow: null,
        editingLayoutOwnerRow: null,
        loaded: false
      };

      // Never identify a person solely by a spreadsheet position.
      // The server must enforce expectedRevision and idempotencyKey atomically.
      Object.assign(appState, {
        loadSequence: 0,
        baseline: null,
        revision: null,
        formulaColumns: new Set(),
        requiresRefresh: true,
        writeUncertain: false,
        settingsSaving: false,
        publishingUncertain: false
      });

      function isDashPlaceholder(value) {
        return /^[-–—]+$/.test(String(value ?? "").trim());
      }

      function nicknameText(value) {
        // Never run role/header normalization or numeric parsing on identities.
        return String(value ?? "").normalize("NFC").trim();
      }

      function nicknameIdentity(value) {
        return nicknameText(value).toLocaleLowerCase("pt-BR");
      }

      function memberKey(values, headers = appState.headers) {
        const index = headers.findIndex(header => headerKey(header) === "NICKNAME");
        return nicknameIdentity(values[index]);
      }

      function decodeBootstrap(response) {
        if (!response || !response.data || !Array.isArray(response.data.headers) ||
            !Array.isArray(response.data.rows) || !response.settings || !Array.isArray(response.settings.rows)) {
          throw new Error("A API retornou uma estrutura incompleta. Nenhum dado foi substituído.");
        }
        const headers = response.data.headers.slice();
        const keys = headers.map(headerKey);
        if (!keys.includes("CARGO") || !keys.includes("NICKNAME") || new Set(keys).size !== keys.length || keys.some(key => !key)) {
          throw new Error("Cabeçalhos inválidos ou repetidos na planilha. Corrija a estrutura antes de editar.");
        }
        const seenRows = new Set();
        const seenMembers = new Set();
        const rows = [];
        for (const row of response.data.rows) {
          if (!row || !Number.isInteger(Number(row.row)) || Number(row.row) < 2 || seenRows.has(Number(row.row))) {
            throw new Error("A API retornou linhas inválidas ou repetidas.");
          }
          seenRows.add(Number(row.row));
          // values is the API's canonical result. Do not overwrite it with source/saved.
          const rawValues = Array.isArray(row.values) ? row.values.slice()
            : row.hasSaved && Array.isArray(row.saved) ? row.saved.slice()
            : Array.isArray(row.source) ? row.source.slice() : null;
          if (!rawValues || rawValues.length !== headers.length) throw new Error("Uma linha não corresponde aos cabeçalhos da planilha.");

          const hasMeaningfulData = rawValues.some((value, idx) => {
            const text = String(value ?? "").trim();
            if (!text || isDashPlaceholder(text)) return false;
            if (["G", "GP", "RL", "REB", "PA"].includes(keys[idx]) && text.toLowerCase() === "false") {
              return false;
            }
            return true;
          });
          if (!hasMeaningfulData) continue;

          const values = rawValues.map((value, idx) => {
            if (keys[idx] === "NICKNAME") return nicknameText(value);
            const text = String(value ?? "").trim();
            if (DATE_HEADER_KEYS.includes(keys[idx]) && isDashPlaceholder(text)) {
              return "";
            }
            if (keys[idx] === "DIAS" && (isDashPlaceholder(text) || text === "0")) {
              return "";
            }
            return value;
          });

          const key = memberKey(values, headers);
          if (!key || seenMembers.has(key)) throw new Error("Nickname ausente ou duplicado na base. Corrija a planilha antes de editar.");
          seenMembers.add(key);
          rows.push({ ...row, row: Number(row.row), values, saved: values.slice(), hasSaved: true,
            nicknameReceivedAsNumber: typeof rawValues[keys.indexOf("NICKNAME")] === "number" });
        }
        const formulaColumns = new Set();
        for (const field of response.data.formulaColumns || []) {
          const index = typeof field === "number" ? field : keys.indexOf(headerKey(field));
          if (!Number.isInteger(index) || index < 0 || index >= headers.length) throw new Error("Configuração de colunas calculadas inválida.");
          formulaColumns.add(index);
        }
        return { headers, rows, formulaColumns, revision: response.meta?.revision ?? response.data.revision ?? null };
      }

      function cellFingerprint(value, header) {
        const key = headerKey(header);
        const text = String(value ?? "").trim();
        if (["G", "GP", "RL", "REB", "PA"].includes(key)) return text.toLowerCase();
        if (DATE_HEADER_KEYS.includes(key)) {
          if (!text || isDashPlaceholder(text)) return "";
          if (parseNexusDate(text)) return nexusDateToIso(text);
        }
        if (key === "DIAS" && (!text || isDashPlaceholder(text) || text === "0")) return "";
        return text;
      }

      function memberSnapshot(headers, rows, includePositions = true) {
        return JSON.stringify({ headers: headers.map(headerKey), rows: rows.map(row => ({
          key: memberKey(row.values, headers),
          ...(includePositions ? { row: Number(row.row) } : {}),
          values: row.values.map((value, index) => cellFingerprint(value, headers[index]))
        })).sort((left, right) => left.key.localeCompare(right.key)) });
      }

      function editableSnapshot(rows) {
        return JSON.stringify(rows.map(row => ({ key: memberKey(row.values), values: row.values
          .map((value, index) => isFormulaMemberColumn(index) ? null : cellFingerprint(value, appState.headers[index]))
        })).sort((left, right) => left.key.localeCompare(right.key)));
      }

      function requireFreshMembers() {
        if (!appState.loaded || appState.loading || appState.requiresRefresh || appState.writeUncertain) {
          throw new Error(appState.writeUncertain
            ? "Uma gravação ficou sem confirmação. Aguarde sua conclusão e atualize a lista antes de outra alteração."
            : "Atualize a lista com sucesso antes de alterar os membros.");
        }
      }

      async function validateMemberBaseline() {
        requireFreshMembers();
        const response = await requestNexusList("bootstrap", null, { forceRefresh: true });
        const latest = decodeBootstrap(response);
        if (appState.baseline !== memberSnapshot(latest.headers, latest.rows) ||
            (appState.revision !== null && latest.revision !== appState.revision)) {
          appState.requiresRefresh = true;
          throw new Error("A lista foi alterada desde a sua consulta. Preserve suas alterações e atualize a página antes de salvar.");
        }
        return { ...latest, response };
      }

      function acceptBootstrap(response, decoded = decodeBootstrap(response)) {
        appState.headers = decoded.headers;
        appState.rows = decoded.rows;
        appState.formulaColumns = decoded.formulaColumns;
        appState.revision = decoded.revision;
        appState.baseline = memberSnapshot(decoded.headers, decoded.rows);
        appState.maxDataRow = Math.max(1, ...decoded.rows.map(row => row.row));
        appState.settings = response.settings.rows.map(item => ({ ...item, role: canonicalRoleName(item.role) }));
        appState.additionalAccess = Array.isArray(response.additionalAccess?.nicknames) ? response.additionalAccess.nicknames.slice() : [];
        appState.additionalAccessRoles = Array.isArray(response.additionalAccess?.roles) ? response.additionalAccess.roles.slice() : [];
        appState.availableAccessRoles = Array.isArray(response.additionalAccess?.availableRoles)
          ? response.additionalAccess.availableRoles.map(entry => ({ role: String(entry.role || "") })) : [];
        appState.publishing = response.publishing || null;
        appState.licenseWorkflow = response.licenses || null;
        appState.booleanColumns = detectBooleanColumns();
        sortMembers();
        appState.selectedMemberRows.clear();
        appState.memberDrafts.clear();
        appState.requiresRefresh = false;
        appState.writeUncertain = false;
        appState.loaded = true;
      }

      function renderBootstrap(response) {
        renderMembers(); renderLicenseWorkflow(); renderSettings(); renderAdditionalAccess();
        updateAdditionalAccessRoleOptions();
        document.getElementById("data-origin").textContent = "Dados sincronizados";
        updateDataTimestamp(response.meta?.generatedAt);
        setWorkspaceState("ready", "Sincronizado");
      }

      async function confirmMemberWrite(expectedRows) {
        const response = await requestNexusList("bootstrap", null, { forceRefresh: true });
        const decoded = decodeBootstrap(response);
        if (memberSnapshot(appState.headers, []) !== memberSnapshot(decoded.headers, []) ||
            editableSnapshot(decoded.rows) !== editableSnapshot(expectedRows)) {
          appState.requiresRefresh = true;
          const nicknameIndex = memberFieldIndexes().nickname;
          const changed = expectedRows.find(expected => {
            if (decoded.rows.some(actual => memberKey(actual.values) === memberKey(expected.values))) return false;
            const actual = decoded.rows.find(actual => actual.row === expected.row);
            return actual && nicknameText(actual.values[nicknameIndex]) !== nicknameText(expected.values[nicknameIndex]);
          });
          if (changed) {
            const actual = decoded.rows.find(actual => actual.row === changed.row);
            throw new Error(`A planilha/API devolveu o nickname "${actual.values[nicknameIndex]}" em vez de "${changed.values[nicknameIndex]}". Configure NICKNAME como texto simples no Apps Script e corrija a célula. O ponto não será removido nem inventado pela interface.`);
          }
          throw new Error("A leitura após o envio não confirmou todos os valores. Atualize e confira a lista; não repita o envio automaticamente.");
        }
        acceptBootstrap(response, decoded);
        renderBootstrap(response);
        return decoded.rows;
      }

      function createOperationId() {
        return window.crypto?.randomUUID ? window.crypto.randomUUID()
          : "nexuslist-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      }

      function buildWorkerUrl(targetUrl) {
        const url = new URL(CONFIG.workerProxy);
        url.searchParams.set("url", targetUrl);
        return url.toString();
      }

      async function fetchViaWorker(targetUrl, options = {}) {
        const {
          forceRefresh = false,
          cacheDurationMs = CONFIG.cacheDurationMs,
          timeoutMs = 15000
        } = options;

        const cacheKey = `${CACHE_PREFIX}${targetUrl}`;

        if (!forceRefresh) {
          try {
            const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
            if (cached && Date.now() - cached.timestamp < cacheDurationMs) {
              return cached.data;
            }
          } catch {
            localStorage.removeItem(cacheKey);
          }
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(buildWorkerUrl(targetUrl), {
            signal: controller.signal
          });

          if (!response.ok) {
            throw new Error(`Worker respondeu com status ${response.status}.`);
          }

          const text = await response.text();
          if (!text.trim()) {
            throw new Error("O Worker retornou uma resposta vazia.");
          }

          try {
            localStorage.setItem(
              cacheKey,
              JSON.stringify({ timestamp: Date.now(), data: text })
            );
          } catch {
            // O cache é opcional e não deve impedir a consulta.
          }

          return text;
        } catch (error) {
          if (error.name === "AbortError") {
            throw new Error("A consulta excedeu o tempo limite.");
          }
          throw error;
        } finally {
          clearTimeout(timeout);
        }
      }

      async function requestNexusList(
        action,
        payload = null,
        options = {}
      ) {
        const { forceRefresh = false } = options;
        const target = new URL(CONFIG.sheets.nexusListApi);
        const requestedUsername = cleanCell(action === "access"
          ? payload?.username || currentUser?.nick || ""
          : currentUser?.nick || payload?.username || "");
        const isWrite =
          action.startsWith("save") ||
          action === "addAdditionalAccess" ||
          action.startsWith("remove") ||
          action === "organizeData" ||
          action === "markLicenseReturnsAsRL";
        if (isWrite && !requireEditAccess({ notify: false })) {
          throw new Error(
            "Seu usuário não possui acesso total para editar."
          );
        }
        if ((action === "addAdditionalAccess" || action === "removeAdditionalAccess") && !requireManageAccess({ notify: false })) {
          throw new Error("Somente a Liderança e Desenvolvedores podem gerenciar acessos.");
        }
        if (isWrite) {
          requireFreshMembers();
          if (appState.writeUncertain) throw new Error("Atualize e confira a gravação anterior antes de enviar outra alteração.");
          const verified = await validateForumAccess();
          if (!currentUser || nicknameIdentity(verified.nick) !== nicknameIdentity(requestedUsername)) {
            throw new Error("O usuário do fórum mudou. Atualize a página antes de editar.");
          }
          allowAccess(verified);
          if (!canCurrentUserEdit(verified) ||
              (["addAdditionalAccess", "removeAdditionalAccess"].includes(action) && !canCurrentUserManageAccess(verified))) {
            throw new Error("Sua permissão de edição não está mais ativa.");
          }
        }
        const request = {
          method: isWrite ? "POST" : "GET",
          cache: "no-store"
        };

        if (isWrite) {
          request.headers = { "Content-Type": "text/plain;charset=utf-8" };
          request.body = JSON.stringify({
            ...(payload || {}),
            action,
            idempotencyKey: payload?.idempotencyKey || createOperationId(),
            username: requestedUsername
          });
        } else {
          target.searchParams.set("action", action);
          if (requestedUsername) {
            target.searchParams.set("username", requestedUsername);
          }
          if (forceRefresh) {
            target.searchParams.set("force", "1");
            target.searchParams.set("_", String(Date.now()));
          }
        }

        const attempts = isWrite ? 1 : CONFIG.network.readAttempts;
        let lastError;

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          const controller = new AbortController();
          const timeout = window.setTimeout(
            () => controller.abort(),
            CONFIG.network.readTimeoutMs
          );

          try {
            const response = await fetch(buildWorkerUrl(target.toString()), {
              ...request,
              signal: controller.signal
            });
            const text = await response.text();
            let result;

            try {
              result = JSON.parse(text);
            } catch {
              const error = new Error(
                "A API da NexusList retornou uma resposta inválida."
              );
              error.retryable = response.status >= 500;
              throw error;
            }

            if (!result || typeof result !== "object" || !response.ok || result.ok !== true) {
              const message = result && result.error ? result.error : "Falha na API.";
              if (/não autorizado|sem permiss|acesso negado/i.test(message)) {
                const denied = new Error(message); denied.code = "AUTH_DENIED"; throw denied;
              }
              const error = new Error(message);
              error.retryable =
                response.status === 408 ||
                response.status === 429 ||
                response.status >= 500;
              throw error;
            }

            return result;
          } catch (error) {
            lastError = error;
            if (isWrite && (error.name === "AbortError" || error instanceof TypeError || error.retryable === true || /resposta inválida/.test(error.message))) {
              appState.writeUncertain = true; appState.requiresRefresh = true;
            }
            const retryable =
              !isWrite &&
              (error.name === "AbortError" ||
                error.retryable === true ||
                error instanceof TypeError);

            if (retryable && attempt < attempts) {
              const delay =
                CONFIG.network.retryDelayMs * attempt + Math.round(Math.random() * 180);
              await new Promise((resolve) => window.setTimeout(resolve, delay));
              continue;
            }
          } finally {
            window.clearTimeout(timeout);
          }
        }

        if (lastError && lastError.name === "AbortError") {
          throw new Error(
            isWrite ? "A gravação ficou sem confirmação por tempo limite. Ela pode ter sido aplicada. Aguarde e atualize antes de tentar outra alteração." : "O serviço demorou demais para responder após as tentativas de consulta."
          );
        }
        if (lastError instanceof TypeError) {
          throw new Error(
            isWrite
              ? "Não foi possível confirmar a gravação. Atualize a lista antes de tentar novamente para evitar duplicidade."
              : "Não foi possível conectar ao serviço de sincronização. Tentamos novamente automaticamente; verifique sua conexão e tente de novo."
          );
        }
        throw lastError || new Error("Não foi possível consultar a NexusList.");
      }

      function setWorkspaceState(state, label) {
        const element = document.getElementById("workspace-state");
        element.classList.remove("is-ready", "is-error");
        if (state) element.classList.add(`is-${state}`);
        element.textContent = label;
      }

      function setDataLoading(isLoading) {
        appState.loading = isLoading;
        document.getElementById("refresh-members").disabled =
          isLoading ||
          appState.savingMembers ||
          appState.settingsSaving ||
          appState.editingMembers ||
          appState.removingMembers ||
          appState.addingMember ||
          appState.requirementsBusy;
        document.getElementById("refresh-settings").disabled = isLoading;
        document.getElementById("edit-layout").hidden =
          !canCurrentUserEdit();
        document.getElementById("edit-layout").disabled =
          !canCurrentUserEdit() || isLoading || !appState.settings.length;
        updateMemberEditControls();
      }

      function expiredLicensesPendingRl() {
        const workflow = appState.licenseWorkflow;
        if (!workflow || !Array.isArray(workflow.expired)) return [];
        return workflow.expired.filter((member) => !member.rl);
      }

      function licenseReturnActionBusy() {
        return !appState.loaded || appState.loading || appState.savingMembers ||
          appState.editingMembers || appState.removingMembers ||
          appState.addingMember || appState.organizingMembers || appState.requiresRefresh || appState.writeUncertain || appState.requirementsBusy ||
          appState.markingLicenseReturns;
      }

      function licenseMemberNames(members) {
        return members
          .map((member) => String(member.nickname || "").trim())
          .filter(Boolean)
          .slice(0, 3)
          .join(", ");
      }

      function renderLicenseWorkflow() {
        const panel = document.getElementById("license-workflow");
        const title = document.getElementById("license-workflow-title");
        const message = document.getElementById("license-workflow-message");
        const action = document.getElementById("mark-license-returns");
        const workflow = appState.licenseWorkflow;

        panel.hidden = true;
        action.hidden = true;
        if (!workflow || !workflow.configured) return;

        const pending = expiredLicensesPendingRl();
        const endingToday = Array.isArray(workflow.endingToday)
          ? workflow.endingToday.filter((member) => !member.rl)
          : [];

        if (pending.length) {
          const names = licenseMemberNames(pending);
          const releaseMessage = workflow.automationActive
            ? `O RL deste fluxo será desmarcado automaticamente na segunda-feira (${workflow.nextMonday}).`
            : "A automação de segunda-feira ainda precisa ser autorizada pelo proprietário no Apps Script.";
          title.innerHTML =
            '<i class="ti ti-calendar-exclamation" aria-hidden="true"></i>' +
            `${formatCount(pending.length)} licença${pending.length === 1 ? " encerrada" : "s encerradas"}`;
          message.textContent =
            `${names}${pending.length > 3 ? " e mais membros" : ""} ${
              pending.length === 1 ? "pode" : "podem"
            } ser marcado${pending.length === 1 ? "" : "s"} em RL. INÍCIO e DIAS serão limpos e salvos. ` +
            releaseMessage;
          action.hidden = false;
          action.disabled =
            licenseReturnActionBusy() || !canCurrentUserEdit();
          action.textContent = appState.markingLicenseReturns
            ? "Marcando em RL…"
            : `Marcar ${formatCount(pending.length)} em RL`;
          panel.hidden = false;
          return;
        }

        if (endingToday.length) {
          const names = licenseMemberNames(endingToday);
          title.innerHTML =
            '<i class="ti ti-clock-hour-4" aria-hidden="true"></i>' +
            `${formatCount(endingToday.length)} licença${endingToday.length === 1 ? " termina" : "s terminam"} hoje`;
          message.textContent =
            `${names}${endingToday.length > 3 ? " e mais membros" : ""} ${
              endingToday.length === 1 ? "poderá" : "poderão"
            } ser marcado${endingToday.length === 1 ? "" : "s"} em RL a partir de 00:00 de amanhã, após 23:59 de hoje.`;
          panel.hidden = false;
          return;
        }

        if (!workflow.automationActive) {
          title.innerHTML =
            '<i class="ti ti-alert-triangle" aria-hidden="true"></i>Automação de RL pendente';
          message.textContent =
            "O proprietário da planilha deve executar configurarAutomacaoDeLicencas uma vez no editor do Apps Script para liberar os RLs automaticamente às segundas-feiras.";
          panel.hidden = false;
        }
      }

      async function markLicenseReturnsAsRl() {
        if (!requireEditAccess() || licenseReturnActionBusy()) return;
        appState.markingLicenseReturns = true; appState.savingMembers = true;
        updateMemberEditControls();
        try {
          const latest = await validateMemberBaseline();
          const pending = Array.isArray(latest.response.licenses?.expired)
            ? latest.response.licenses.expired.filter(member => !member.rl) : [];
          if (!pending.length) throw new Error("Não há retornos de licença confirmados pela consulta atual.");
          const nicknameIndex = memberFieldIndexes().nickname;
          const identities = pending.map(member => {
            const row = latest.rows.find(row => row.row === Number(member.row));
            const nickname = nicknameIdentity(member.nickname);
            if (!row || !nickname || memberKey(row.values) !== nickname) {
              throw new Error("O retorno de licença não corresponde ao membro da linha. Atualize a lista; nenhum envio foi feito.");
            }
            return { row: row.row, nickname: row.values[nicknameIndex], memberId: row.id ?? row.uid ?? null };
          });
          const result = await requestNexusList("markLicenseReturnsAsRL", {
            rows: identities.map(member => member.row), members: identities,
            expectedRevision: latest.revision, expectedSnapshot: appState.baseline,
            idempotencyKey: createOperationId()
          });
          const confirmed = result.data?.rows;
          if (!Array.isArray(confirmed) || identities.some(member => !confirmed.map(Number).includes(member.row))) {
            throw new Error("A API não confirmou quais retornos foram alterados. Atualize a lista e confira o resultado.");
          }
          const response = await requestNexusList("bootstrap", null, { forceRefresh: true });
          const decoded = decodeBootstrap(response);
          const rlIndex = decoded.headers.findIndex(header => headerKey(header) === "RL");
          const startIndex = decoded.headers.findIndex(header => headerKey(header) === "INICIO");
          const daysIndex = decoded.headers.findIndex(header => headerKey(header) === "DIAS");
          if (rlIndex < 0 || startIndex < 0 || daysIndex < 0 || identities.some(member => {
            const row = decoded.rows.find(row => memberKey(row.values, decoded.headers) === nicknameIdentity(member.nickname));
            return !row || booleanState(row.values[rlIndex]) !== "true" ||
              String(row.values[startIndex] ?? "").trim() || String(row.values[daysIndex] ?? "").trim();
          })) throw new Error("O RL e a limpeza da licença não foram confirmados. Confira a planilha antes de prosseguir.");
          acceptBootstrap(response, decoded); renderBootstrap(response);
          showToast(formatCount(identities.length) + " retornos confirmados na planilha.", "success");
        } catch (error) { appState.requiresRefresh = true; showToast(error.message, "error"); }
        finally { appState.markingLicenseReturns = false; appState.savingMembers = false; updateMemberEditControls(); }
      }

      function formatCount(value) {
        return Number(value || 0).toLocaleString("pt-BR");
      }

      function normalizeLookup(value) {
        return String(value || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\./g, "")
          .trim()
          .toUpperCase();
      }

      function headerIndex(label) {
        const normalized = normalizeLookup(label);
        return appState.headers.findIndex(
          (header) => normalizeLookup(header) === normalized
        );
      }

      function headerKey(value) {
        return normalizeLookup(value).replace(/[^A-Z0-9]+/g, "");
      }

      function headerIndexAny(...labels) {
        const keys = labels.map(headerKey);
        return appState.headers.findIndex((header) =>
          keys.includes(headerKey(header))
        );
      }

      function memberFieldIndexes() {
        return {
          role: headerIndex("CARGO"),
          nickname: headerIndex("NICKNAME"),
          entry: headerIndex("ENTRADA"),
          promotion: headerIndexAny(
            "DATA (PROMO/REB)",
            "PROMO. / REBAIX."
          ),
          licenseStart: headerIndexAny("INÍCIO", "INICIO"),
          licenseDays: headerIndex("DIAS"),
          licenseReturn: headerIndexAny("RETORNO", "TÉRMINO", "TERMINO")
        };
      }

      function isDateColumn(index) {
        return DATE_HEADER_KEYS.includes(headerKey(appState.headers[index]));
      }

      function isFormulaMemberColumn(index) {
        return appState.formulaColumns.has(index) || ["RETORNO", "TERMINO", "TEMPO", "TEMPODECARGO", "TEMPONOCARGO", "TEMPODECOMPANHIA", "DIASNOCARGO", "DIASDECOMPANHIA"]
          .includes(headerKey(appState.headers[index]));
      }

      function canonicalRoleName(role) {
        const value = String(role || "").trim();
        const normalized = normalizeLookup(value);

        if (normalized.startsWith("CONSELHEIRO(A)")) {
          return value.replace(/^Conselheiro\(a\)/i, "Conselheiro(a)");
        }
        if (normalized === "COORDENADOR(A)") return "Coordenador(a)";
        return value;
      }

      function roleRank(role) {
        const normalized = normalizeLookup(canonicalRoleName(role));
        if (normalized === "LIDER") return 0;
        if (normalized === "VICE-LIDER") return 1;
        if (normalized === "CONSULTOR(A)") return 2;
        if (normalized.startsWith("CONSELHEIRO(A)")) return 3;
        if (normalized === "ESTAGIARIO(A)") return 4;
        if (normalized === "GRADUADOR(A)") return 5;
        if (normalized === "COORDENADOR(A)") return 6;
        if (normalized === "PROFESSOR(A)") return 7;
        return 8;
      }

      function roleOptionIndex(role) {
        const normalized = normalizeLookup(canonicalRoleName(role));
        const index = ROLE_OPTIONS.findIndex(
          (option) => normalizeLookup(option) === normalized
        );
        return index === -1 ? ROLE_OPTIONS.length : index;
      }

      function isConsultantRole(role) {
        return normalizeLookup(role) === "CONSULTOR(A)";
      }

      function parseNexusDate(value) {
        const raw = String(value || "").replace(/\s+/g, " ").trim();
        if (!raw || isDashPlaceholder(raw)) return null;

        let year;
        let month;
        let day;
        let match = raw.match(
          /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
        );

        if (match) {
          year = Number(match[1]);
          month = Number(match[2]) - 1;
          day = Number(match[3]);
        } else {
          match = raw.match(
            /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/
          );
          if (match) {
            day = Number(match[1]);
            month = Number(match[2]) - 1;
            year = Number(match[3]);
          } else {
            match = raw.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ.]+)\s+(\d{4})$/);
            if (!match) return null;

            const aliases = {
              JAN: 0,
              FEV: 1,
              FEB: 1,
              MAR: 2,
              ABR: 3,
              APR: 3,
              MAI: 4,
              MAY: 4,
              JUN: 5,
              JUL: 6,
              AGO: 7,
              AUG: 7,
              SET: 8,
              SEP: 8,
              OUT: 9,
              OCT: 9,
              NOV: 10,
              DEZ: 11,
              DEC: 11
            };
            day = Number(match[1]);
            month = aliases[normalizeLookup(match[2]).slice(0, 3)];
            year = Number(match[3]);
          }
        }

        if (
          !Number.isInteger(year) ||
          !Number.isInteger(month) ||
          !Number.isInteger(day) ||
          month < 0 ||
          month > 11 ||
          day < 1 ||
          day > 31
        ) {
          return null;
        }

        const date = new Date(Date.UTC(year, month, day));
        if (
          date.getUTCFullYear() !== year ||
          date.getUTCMonth() !== month ||
          date.getUTCDate() !== day
        ) {
          return null;
        }

        return { year, month, day };
      }

      function formatNexusDate(value) {
        const raw = String(value || "").trim();
        if (!raw || isDashPlaceholder(raw)) return "";
        const parsed = parseNexusDate(raw);
        if (!parsed) return raw;
        return `${String(parsed.day).padStart(2, "0")} ${
          NEXUS_MONTHS[parsed.month]
        } ${parsed.year}`;
      }

      function nexusDateToIso(value) {
        const parsed = parseNexusDate(value);
        if (!parsed) return "";
        return `${parsed.year}-${String(parsed.month + 1).padStart(
          2,
          "0"
        )}-${String(parsed.day).padStart(2, "0")}`;
      }

      function dateSortValue(value) {
        const parsed = parseNexusDate(value);
        return parsed
          ? Date.UTC(parsed.year, parsed.month, parsed.day)
          : Number.POSITIVE_INFINITY;
      }

      function calculateMemberReturnDate(startValue, daysValue) {
        const start = parseNexusDate(startValue);
        const text = String(daysValue ?? "").trim();
        if (!start || !/^\d+$/.test(text)) return "";
        const days = Number(text);
        if (!Number.isSafeInteger(days) || days <= 0) return "";
        const date = new Date(Date.UTC(start.year, start.month, start.day) + days * 86400000);
        if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999) return "";
        return formatNexusDate(date.toISOString().slice(0, 10));
      }

      function applyCalculatedReturnDate(values) {
        const next = values.slice();
        const indexes = memberFieldIndexes();
        if (indexes.licenseStart >= 0 && isDashPlaceholder(next[indexes.licenseStart])) {
          next[indexes.licenseStart] = "";
        }
        if (indexes.licenseDays >= 0) {
          const daysText = String(next[indexes.licenseDays] ?? "").trim();
          if (isDashPlaceholder(daysText) || daysText === "0") {
            next[indexes.licenseDays] = "";
          }
        }
        if (indexes.licenseReturn >= 0 && indexes.licenseStart >= 0 && indexes.licenseDays >= 0) {
          next[indexes.licenseReturn] = calculateMemberReturnDate(next[indexes.licenseStart], next[indexes.licenseDays]);
        }
        return next;
      }

      function normalizeConsultantValues(values) {
        const normalized = values.slice();
        const indexes = memberFieldIndexes();
        if (!isConsultantRole(normalized[indexes.role])) return normalized;

        normalized.forEach((_, index) => {
          if (index !== indexes.role && index !== indexes.nickname) {
            normalized[index] = "";
          }
        });
        return normalized;
      }

      function prepareMemberValues(values) {
        const currentValues = applyCalculatedReturnDate(values);
        validateLicenseValues(currentValues);
        const roleIndex = memberFieldIndexes().role;
        if (roleIndex >= 0) {
          currentValues[roleIndex] = canonicalRoleName(
            currentValues[roleIndex]
          );
        }

        const normalized = normalizeConsultantValues(currentValues);
        if (isConsultantRole(normalized[memberFieldIndexes().role])) {
          return normalized;
        }

        return normalized.map((value, index) => {
          if (!isDateColumn(index)) return value;
          const raw = String(value ?? "").trim();
          if (!raw || isDashPlaceholder(raw)) return "";
          return parseNexusDate(raw) ? formatNexusDate(raw) : raw;
        });
      }

      function validateLicenseValues(values) {
        if (isConsultantRole(values[memberFieldIndexes().role])) return;
        const { licenseStart, licenseDays } = memberFieldIndexes();
        const rawStart = String(values[licenseStart] ?? "").trim();
        const rawDays = String(values[licenseDays] ?? "").trim();
        const start = isDashPlaceholder(rawStart) ? "" : rawStart;
        const days = isDashPlaceholder(rawDays) || rawDays === "0" ? "" : rawDays;
        if (licenseStart >= 0) values[licenseStart] = start;
        if (licenseDays >= 0) values[licenseDays] = days;
        if (!start && !days) return;
        if (licenseStart < 0 || licenseDays < 0 || !calculateMemberReturnDate(start, days)) {
          throw new Error("Licença inválida: informe início válido e um número inteiro positivo de dias.");
        }
      }

      function assertRequiredMemberFields(values, rowNumber = null) {
        validateLicenseValues(values);
        const indexes = memberFieldIndexes();
        const nicknameLabel =
          String(values[indexes.nickname] || "").trim() ||
          (Number.isInteger(rowNumber) ? `linha ${rowNumber}` : "membro sem nickname");

        for (const index of [indexes.entry, indexes.promotion]) {
          if (index < 0) continue;
          const raw = String(values[index] ?? "").trim();
          if (!raw || isDashPlaceholder(raw)) {
            values[index] = "";
            continue;
          }
          if (!parseNexusDate(raw)) {
            const columnName = appState.headers[index] || "Data";
            throw new Error(
              `Data inválida em ${columnName} ("${raw}") no cadastro de ${nicknameLabel}.`
            );
          }
        }
        const missing = [
          { index: indexes.role, label: "CARGO" },
          { index: indexes.nickname, label: "NICKNAME" }
        ]
          .filter(
            (field) =>
              field.index < 0 ||
              !String(values[field.index] || "").trim()
          )
          .map((field) => field.label);

        if (!missing.length) return;

        const rowLabel = Number.isInteger(rowNumber)
          ? ` na linha ${rowNumber}`
          : "";
        throw new Error(
          `${missing.join(" e ")} ${
            missing.length === 1 ? "é obrigatório" : "são obrigatórios"
          }${rowLabel}.`
        );
      }

      function compareMemberRows(left, right) {
        const indexes = memberFieldIndexes();
        const leftRole = left.values[indexes.role];
        const rightRole = right.values[indexes.role];
        const rankDifference = roleRank(leftRole) - roleRank(rightRole);
        if (rankDifference) return rankDifference;

        const isProfessor = roleRank(leftRole) === 7;
        const dateIndex = isProfessor ? indexes.entry : indexes.promotion;
        const dateDifference =
          dateSortValue(left.values[dateIndex]) -
          dateSortValue(right.values[dateIndex]);
        if (dateDifference) return dateDifference;

        const roleDifference =
          roleOptionIndex(leftRole) - roleOptionIndex(rightRole);
        if (roleDifference) return roleDifference;

        return String(left.values[indexes.nickname] || "").localeCompare(
          String(right.values[indexes.nickname] || ""),
          "pt-BR",
          { sensitivity: "base" }
        );
      }

      function sortMembers() {
        appState.rows.sort(compareMemberRows);
      }

      function buildCompactMemberRows(members) {
        const nicknameIndex = memberFieldIndexes().nickname;
        const seenNicknames = new Map();
        const repeatedNicknames = new Set();
        const rows = members
          .slice()
          .sort(compareMemberRows)
          .map((member, index) => {
            const values = prepareMemberValues(member.values).map((value) =>
              String(value ?? "").trim()
            );
            assertRequiredMemberFields(values, member.row);
            const nickname = String(values[nicknameIndex] || "").trim();
            const nicknameKey = nicknameIdentity(nickname);

            if (nicknameKey) {
              if (seenNicknames.has(nicknameKey)) {
                repeatedNicknames.add(nickname);
              } else {
                seenNicknames.set(nicknameKey, true);
              }
            }

            return {
              row: index + 2,
              values
            };
          });

        if (repeatedNicknames.size) {
          throw new Error(
            `Nickname duplicado: ${Array.from(repeatedNicknames).join(
              ", "
            )}. Corrija ou remova a repetição antes de salvar.`
          );
        }

        return rows;
      }

      function applyPersistedMemberRows() {
        throw new Error("Use a leitura confirmada da API para atualizar a lista.");
      }

      async function persistCompactMemberList(members) {
        const rows = buildCompactMemberRows(members);
        const latest = await validateMemberBaseline();
        const indexes = memberFieldIndexes();
        const originals = new Map(latest.rows.map(row => [memberKey(row.values), row]));
        const operationId = createOperationId();
        try {
          await requestNexusList("organizeData", {
            rows: rows.map(row => ({ ...row, memberKey: memberKey(row.values),
              expectedNickname: originals.get(memberKey(row.values))?.values[indexes.nickname] ?? null })),
            expectedRevision: latest.revision,
            expectedSnapshot: appState.baseline,
            originalMembers: latest.rows.map(row => ({ row: row.row, nickname: row.values[indexes.nickname] })),
            textColumns: ["NICKNAME"],
            idempotencyKey: operationId
          });
          return await confirmMemberWrite(rows);
        } catch (error) {
          appState.requiresRefresh = true;
          throw error;
        }
      }

      function filteredMembers() {
        const term = appState.search.trim().toLocaleLowerCase("pt-BR");
        if (!term) return appState.rows;

        return appState.rows.filter((row) =>
          memberDraft(row).some((value) =>
            String(value || "").toLocaleLowerCase("pt-BR").includes(term)
          )
        );
      }

      function booleanState(value) {
        const normalized = String(value ?? "").trim().toLowerCase();
        if (normalized === "true") return "true";
        if (normalized === "false") return "false";
        return "empty";
      }

      function detectBooleanColumns() {
        return new Set(appState.headers.map((header, index) =>
          ["G", "GP", "RL", "REB", "PA"].includes(headerKey(header)) ? index : -1).filter(index => index >= 0));
      }

      function memberDraft(row) {
        return appState.memberDrafts.get(row.row) || row.values;
      }

      function memberEditableValues(row) {
        return row.values;
      }

      function isMemberRowDirty(row) {
        const draft = appState.memberDrafts.get(row.row);
        if (!draft) return false;
        const baseline = memberEditableValues(row);

        return draft.some(
          (value, index) =>
            cellFingerprint(value, appState.headers[index]) !==
            cellFingerprint(baseline[index], appState.headers[index])
        );
      }

      function updateBooleanToggle(button, state, columnIndex) {
        const labels = {
          true: "Selecionado",
          false: "Desmarcado",
          empty: "Sem valor"
        };
        const header = appState.headers[columnIndex] || `Campo ${columnIndex + 1}`;

        button.dataset.state = state;
        button.textContent = "";
        button.setAttribute("aria-pressed", String(state === "true"));
        button.setAttribute("aria-label", `${header}: ${labels[state]}`);
        button.title =
          state === "empty"
            ? "Sem valor definido"
            : state === "true"
              ? "Selecionado"
              : "Desmarcado";
      }

      function createRoleSelect(value, options = {}) {
        const select = document.createElement("select");
        const selectedValue = canonicalRoleName(value);
        select.className = options.className || "table-select";
        if (options.id) select.id = options.id;
        if (options.index !== undefined) select.dataset.index = options.index;
        if (options.disabled) select.disabled = true;
        select.setAttribute(
          "aria-label",
          options.label || "Selecionar cargo"
        );

        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "Selecione";
        select.appendChild(blank);

        if (selectedValue && !ROLE_OPTIONS.includes(selectedValue)) {
          const current = document.createElement("option");
          current.value = selectedValue;
          current.textContent = selectedValue;
          select.appendChild(current);
        }

        [...new Set([...ROLE_OPTIONS, ...appState.settings.map(item => canonicalRoleName(item.role)).filter(Boolean)])].forEach((role) => {
          const option = document.createElement("option");
          option.value = role;
          option.textContent = role;
          select.appendChild(option);
        });

        select.value = selectedValue;
        if (options.onChange) {
          select.addEventListener("change", () =>
            options.onChange(select.value, select)
          );
        }
        return select;
      }

      function createDateControl(value, options = {}) {
        const control = document.createElement("div");
        const formatted = formatNexusDate(value);
        control.className = `date-control${formatted ? "" : " is-empty"}`;
        if (options.calculated) control.classList.add("is-calculated");
        control.dataset.value = formatted;

        const display = document.createElement("span");
        display.className = "date-control__value";
        display.textContent = formatted || "—";

        const calendar = document.createElement("span");
        calendar.className = "date-control__calendar";
        calendar.setAttribute("aria-hidden", "true");

        const input = document.createElement("input");
        input.className = "date-control__native";
        input.type = "date";
        input.value = nexusDateToIso(value);
        input.disabled = Boolean(options.disabled);
        input.setAttribute("aria-label", options.label || "Selecionar data");
        if (options.id) input.id = options.id;
        if (options.index !== undefined) input.dataset.index = options.index;

        input.addEventListener("change", () => {
          const nextValue = formatNexusDate(input.value);
          control.dataset.value = nextValue;
          display.textContent = nextValue || "—";
          control.classList.toggle("is-empty", !nextValue);
          if (options.onChange) options.onChange(nextValue, input);
        });

        control.append(display, calendar, input);
        return control;
      }

      function setDateControlValue(control, value) {
        if (!control) return;
        const formatted = formatNexusDate(value);
        const display = control.querySelector(".date-control__value");
        const input = control.querySelector(".date-control__native");
        control.dataset.value = formatted;
        control.classList.toggle("is-empty", !formatted);
        if (display) display.textContent = formatted || "—";
        if (input) input.value = nexusDateToIso(formatted);
      }

      function createMemberRoleSelect(value, row, columnIndex) {
        const select = createRoleSelect(value, {
          index: columnIndex,
          disabled: appState.savingMembers,
          label: `Cargo de ${row.values[1] || "membro"}`,
          onChange: (nextRole) => {
            const draft = memberDraft(row).slice();
            const wasConsultant = isConsultantRole(draft[columnIndex]);
            draft[columnIndex] = nextRole;
            if (wasConsultant && !isConsultantRole(nextRole)) {
              appState.booleanColumns.forEach((boolIndex) => {
                if (!String(draft[boolIndex] ?? "").trim()) {
                  draft[boolIndex] = "FALSE";
                }
              });
            }
            appState.memberDrafts.set(
              row.row,
              draft
            );
            renderMembers();
          }
        });
        select.required = true;
        select.setAttribute("aria-required", "true");
        return select;
      }

      function updateMemberCalculatedReturn(row, draft) {
        const indexes = memberFieldIndexes();
        const calculatedDraft = applyCalculatedReturnDate(draft);
        appState.memberDrafts.set(row.row, calculatedDraft);

        if (indexes.licenseReturn >= 0) {
          const tableRow = document.querySelector(
            `[data-member-row="${row.row}"]`
          );
          const returnValue = calculatedDraft[indexes.licenseReturn] || "";
          const returnInput = tableRow?.querySelector(
            `.date-control__native[data-index="${indexes.licenseReturn}"]`
          );
          if (returnInput) {
            setDateControlValue(
              returnInput.closest(".date-control"),
              returnValue
            );
          } else {
            const returnCellSpan = tableRow?.querySelector(
              `td[data-column-index="${indexes.licenseReturn}"] .table-cell`
            );
            if (returnCellSpan) {
              returnCellSpan.textContent = returnValue || "—";
              returnCellSpan.title = returnValue;
              returnCellSpan.classList.toggle("is-empty", !returnValue);
            }
          }
          tableRow?.classList.toggle("is-dirty", isMemberRowDirty(row));
        }
        return calculatedDraft;
      }

      function createMemberDateControl(value, row, columnIndex) {
        const indexes = memberFieldIndexes();
        const calculated = columnIndex === indexes.licenseReturn;
        return createDateControl(value, {
          disabled: appState.savingMembers || calculated,
          calculated,
          index: columnIndex,
          label: `${
            appState.headers[columnIndex] || `Campo ${columnIndex + 1}`
          } de ${row.values[1] || "membro"}`,
          onChange: (nextValue) => {
            const draft = memberDraft(row).slice();
            draft[columnIndex] = nextValue;
            if (columnIndex === indexes.licenseStart) {
              updateMemberCalculatedReturn(row, draft);
            } else {
              appState.memberDrafts.set(row.row, draft);
            }
            const tableRow = document
              .querySelector(`[data-member-row="${row.row}"]`);
            if (tableRow) {
              tableRow.classList.toggle("is-dirty", isMemberRowDirty(row));
            }
          }
        });
      }

      function createBooleanToggle(value, row, columnIndex, editable) {
        const button = document.createElement("button");
        button.className = "boolean-toggle";
        button.type = "button";
        button.disabled = !editable || appState.savingMembers;
        updateBooleanToggle(button, booleanState(value), columnIndex);

        if (editable && !appState.savingMembers) {
          button.addEventListener("click", () => {
            const nextState =
              button.dataset.state === "true" ? "false" : "true";
            const draft = memberDraft(row).slice();
            draft[columnIndex] = nextState.toUpperCase();
            appState.memberDrafts.set(row.row, draft);
            updateBooleanToggle(button, nextState, columnIndex);
            button.closest("tr").classList.toggle(
              "is-dirty",
              isMemberRowDirty(row)
            );
          });
        }

        return button;
      }

      function createMemberInput(value, row, columnIndex) {
        const indexes = memberFieldIndexes();
        const input = document.createElement("input");
        input.className = "table-input";
        input.type = columnIndex === indexes.licenseDays ? "number" : "text";
        if (columnIndex === indexes.licenseDays) {
          input.min = "1";
          input.step = "1";
          input.inputMode = "numeric";
        }
        input.value = value ?? "";
        input.disabled = appState.savingMembers;
        if (columnIndex === indexes.nickname) {
          input.inputMode = "text";
          input.autocapitalize = "off";
          input.spellcheck = false;
          if (row.nicknameReceivedAsNumber) input.title = "A API enviou este nickname como número. Confira o nome original e mantenha NICKNAME como texto simples na planilha.";
          input.required = true;
          input.setAttribute("aria-required", "true");
        }
        input.setAttribute(
          "aria-label",
          appState.headers[columnIndex] || `Campo ${columnIndex + 1}`
        );

        input.addEventListener("input", () => {
          const draft = memberDraft(row).slice();
          draft[columnIndex] = input.value;
          if (columnIndex === indexes.licenseDays) {
            updateMemberCalculatedReturn(row, draft);
          } else {
            appState.memberDrafts.set(row.row, draft);
          }
          input.closest("tr").classList.toggle(
            "is-dirty",
            isMemberRowDirty(row)
          );
        });

        return input;
      }

      function createMemberSelection(row) {
        const checkbox = document.createElement("input");
        const label = row.values[1] || row.values[0] || "registro selecionado";
        checkbox.className = "member-select";
        checkbox.type = "checkbox";
        checkbox.checked = appState.selectedMemberRows.has(row.row);
        checkbox.disabled = appState.savingMembers;
        checkbox.setAttribute("aria-label", `Selecionar ${label}`);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            appState.selectedMemberRows.add(row.row);
          } else {
            appState.selectedMemberRows.delete(row.row);
          }
          updateMemberEditControls();
          renderMembers();
        });
        return checkbox;
      }

      function renderMembers() {
        const table = document.getElementById("members-table");
        const head = document.getElementById("members-table-head");
        const body = document.getElementById("members-table-body");
        const tableState = document.getElementById("table-state");
        const resultLabel = document.getElementById("table-result");
        const rows = filteredMembers();

        head.replaceChildren();
        body.replaceChildren();

        if (appState.removingMembers) {
          const selectionHeader = document.createElement("th");
          selectionHeader.scope = "col";
          selectionHeader.className = "member-selection-cell";

          const selectAll = document.createElement("input");
          const selectedVisible = rows.filter((row) =>
            appState.selectedMemberRows.has(row.row)
          ).length;
          selectAll.className = "member-select";
          selectAll.type = "checkbox";
          selectAll.checked = Boolean(rows.length) && selectedVisible === rows.length;
          selectAll.indeterminate =
            selectedVisible > 0 && selectedVisible < rows.length;
          selectAll.disabled = appState.savingMembers || !rows.length;
          selectAll.setAttribute("aria-label", "Selecionar registros visíveis");
          selectAll.addEventListener("change", () => {
            rows.forEach((row) => {
              if (selectAll.checked) {
                appState.selectedMemberRows.add(row.row);
              } else {
                appState.selectedMemberRows.delete(row.row);
              }
            });
            updateMemberEditControls();
            renderMembers();
          });

          selectionHeader.appendChild(selectAll);
          head.appendChild(selectionHeader);
        }

        appState.headers.forEach((header, index) => {
          const cell = document.createElement("th");
          cell.scope = "col";
          cell.textContent = header || `Campo ${index + 1}`;
          cell.title = cell.textContent;
          if (appState.booleanColumns.has(index)) {
            cell.classList.add("is-boolean-column");
          }
          head.appendChild(cell);
        });

        const indexes = memberFieldIndexes();
        rows.forEach((row) => {
          const tableRow = document.createElement("tr");
          tableRow.dataset.memberRow = row.row;
          if (row.hasSaved) tableRow.classList.add("is-saved");
          if (isMemberRowDirty(row)) tableRow.classList.add("is-dirty");
          if (appState.selectedMemberRows.has(row.row)) {
            tableRow.classList.add("is-selected");
          }

          if (appState.removingMembers) {
            const selectionCell = document.createElement("td");
            selectionCell.className = "member-selection-cell";
            selectionCell.appendChild(createMemberSelection(row));
            tableRow.appendChild(selectionCell);
          }

          appState.headers.forEach((_, index) => {
            const cell = document.createElement("td");
            cell.dataset.columnIndex = String(index);
            const value = memberDraft(row)[index] ?? "";
            const consultant = isConsultantRole(
              memberDraft(row)[indexes.role]
            );
            const consultantField =
              consultant &&
              index !== indexes.role &&
              index !== indexes.nickname;

            if (appState.booleanColumns.has(index)) {
              cell.classList.add("is-boolean-column");
            }

            if (consultantField) {
              const content = document.createElement("span");
              content.className = "table-cell is-empty";
              content.textContent = "—";
              content.title = "Não se aplica a Consultor(a)";
              cell.appendChild(content);
            } else if (
              appState.editingMembers &&
              !isFormulaMemberColumn(index)
            ) {
              cell.appendChild(
                appState.booleanColumns.has(index)
                  ? createBooleanToggle(value, row, index, true)
                  : index === indexes.role
                    ? createMemberRoleSelect(value, row, index)
                    : isDateColumn(index)
                      ? createMemberDateControl(value, row, index)
                      : createMemberInput(value, row, index)
              );
            } else if (booleanState(value) !== "empty") {
              cell.appendChild(createBooleanToggle(value, row, index, false));
            } else {
              const content = document.createElement("span");
              const displayValue =
                index === indexes.role
                  ? canonicalRoleName(value)
                  : isDateColumn(index)
                    ? formatNexusDate(value)
                    : value;
              content.className = "table-cell";
              content.textContent = displayValue || "—";
              content.title = displayValue;
              if (!displayValue) content.classList.add("is-empty");
              cell.appendChild(content);
            }

            tableRow.appendChild(cell);
          });

          body.appendChild(tableRow);
        });

        const resultText = appState.search
          ? `${formatCount(rows.length)} de ${formatCount(appState.rows.length)} registros`
          : `${formatCount(rows.length)} registros`;
        if (appState.editingMembers) {
          resultLabel.textContent = `${resultText} · edição ativa`;
        } else if (appState.removingMembers) {
          resultLabel.textContent = `${resultText} · ${formatCount(
            appState.selectedMemberRows.size
          )} selecionado${
            appState.selectedMemberRows.size === 1 ? "" : "s"
          }`;
        } else {
          resultLabel.textContent = resultText;
        }

        if (!rows.length) {
          table.hidden = true;
          tableState.hidden = false;
          tableState.textContent = appState.search
            ? "Nenhum membro corresponde à busca."
            : "Nenhum registro foi encontrado.";
        } else {
          tableState.hidden = true;
          table.hidden = false;
        }
      }

      function updateMemberEditControls() {
        const editButton = document.getElementById("edit-members");
        const saveButton = document.getElementById("save-members-edit");
        const cancelEditButton = document.getElementById("cancel-members-edit");
        const addButton = document.getElementById("add-member");
        const requirementsButton = document.getElementById("open-requirements");
        const organizeButton = document.getElementById("organize-members");
        const removeButton = document.getElementById("remove-members");
        const confirmRemoveButton = document.getElementById(
          "confirm-members-remove"
        );
        const cancelRemoveButton = document.getElementById(
          "cancel-members-remove"
        );
        const isEditing = appState.editingMembers;
        const isRemoving = appState.removingMembers;
        const canEdit = canCurrentUserEdit();
        const isBusy =
          appState.loading ||
          appState.savingMembers ||
          appState.addingMember ||
          appState.requirementsBusy || appState.requiresRefresh || appState.writeUncertain || appState.settingsSaving;

        editButton.hidden = !canEdit || isEditing || isRemoving;
        addButton.hidden = !canEdit || isEditing || isRemoving;
        requirementsButton.hidden = !canEdit || isEditing || isRemoving;
        organizeButton.hidden = !canEdit || isEditing || isRemoving;
        removeButton.hidden = !canEdit || isEditing || isRemoving;
        saveButton.hidden = !canEdit || !isEditing;
        cancelEditButton.hidden = !canEdit || !isEditing;
        confirmRemoveButton.hidden = !canEdit || !isRemoving;
        cancelRemoveButton.hidden = !canEdit || !isRemoving;

        editButton.disabled = !canEdit || isBusy || !appState.loaded;
        addButton.disabled = !canEdit || isBusy || !appState.loaded;
        requirementsButton.disabled =
          !canEdit ||
          isBusy ||
          !appState.loaded ||
          !hasRequirementConfiguration();
        organizeButton.disabled =
          !canEdit || isBusy || !appState.loaded || !appState.rows.length;
        removeButton.disabled =
          !canEdit || isBusy || !appState.loaded || !appState.rows.length;
        saveButton.disabled = !canEdit || isBusy;
        cancelEditButton.disabled = appState.savingMembers;
        confirmRemoveButton.disabled =
          appState.savingMembers || !appState.selectedMemberRows.size;
        cancelRemoveButton.disabled = appState.savingMembers;
        const organizeLabel = appState.organizingMembers
          ? "Organizando lista"
          : "Organizar lista";
        organizeButton.setAttribute("aria-label", organizeLabel);
        organizeButton.title = organizeLabel;
        organizeButton.classList.toggle(
          "is-loading",
          appState.organizingMembers
        );

        const saveLabel = appState.savingMembers
          ? "Salvando alterações"
          : "Salvar alterações";
        saveButton.setAttribute("aria-label", saveLabel);
        saveButton.title = saveLabel;
        saveButton.classList.toggle(
          "is-loading",
          appState.savingMembers && isEditing
        );

        const removeCount = appState.selectedMemberRows.size;
        const confirmRemoveLabel = appState.savingMembers
          ? "Removendo membros"
          : removeCount
            ? `Remover ${formatCount(removeCount)} selecionado${
                removeCount === 1 ? "" : "s"
              }`
            : "Remover selecionados";
        confirmRemoveButton.setAttribute("aria-label", confirmRemoveLabel);
        confirmRemoveButton.title = confirmRemoveLabel;
        confirmRemoveButton.classList.toggle(
          "is-loading",
          appState.savingMembers && isRemoving
        );

        document.getElementById("refresh-members").disabled =
          appState.loading ||
          appState.savingMembers ||
          appState.settingsSaving ||
          appState.requirementsBusy ||
          isEditing ||
          isRemoving ||
          appState.addingMember;
        renderLicenseWorkflow();
      }

      function beginMemberEditing() {
        if (!requireEditAccess()) return;
        try { requireFreshMembers(); } catch (error) { showToast(error.message, "warning"); return; }
        if (
          !appState.loaded ||
          appState.editingMembers ||
          appState.removingMembers ||
          appState.addingMember
        ) {
          return;
        }

        appState.memberDrafts = new Map(
          appState.rows.map((row) => [
            row.row,
            memberEditableValues(row).slice()
          ])
        );
        appState.booleanColumns = detectBooleanColumns();
        appState.editingMembers = true;
        setWorkspaceState("", "Editando");
        updateMemberEditControls();
        renderMembers();
      }

      function cancelMemberEditing() {
        if (appState.savingMembers) return;

        appState.editingMembers = false;
        appState.memberDrafts.clear();
        setWorkspaceState(appState.requiresRefresh ? "error" : "ready", appState.requiresRefresh ? "Atualização necessária" : "Sincronizado");
        updateMemberEditControls();
        renderMembers();
      }

      async function organizeMemberList() {
        if (!requireEditAccess()) return;
        if (
          !appState.loaded ||
          !appState.rows.length ||
          appState.loading ||
          appState.savingMembers ||
          appState.editingMembers ||
          appState.removingMembers ||
          appState.addingMember
        ) {
          return;
        }

        appState.savingMembers = true;
        appState.organizingMembers = true;
        setWorkspaceState("", "Organizando");
        updateMemberEditControls();
        renderMembers();

        try {
          const rows = await persistCompactMemberList(
            appState.rows.map((row) => ({
              ...row,
              values: memberEditableValues(row).slice()
            }))
          );
          appState.selectedMemberRows.clear();
          updateDataTimestamp();
          setWorkspaceState("ready", "Sincronizado");
          showToast(
            `${formatCount(rows.length)} registro${
              rows.length === 1 ? "" : "s"
            } organizado${rows.length === 1 ? "" : "s"} e atualizado${
              rows.length === 1 ? "" : "s"
            }.`,
            "success"
          );
        } catch (error) {
          setWorkspaceState("error", "Falha ao organizar");
          showToast(error.message, "error");
        } finally {
          appState.savingMembers = false;
          appState.organizingMembers = false;
          updateMemberEditControls();
          renderMembers();
        }
      }

      async function saveMemberList() {
        if (!requireEditAccess() || !appState.editingMembers || appState.savingMembers) return;
        let changedRows;
        let members;
        try {
          requireFreshMembers();
          changedRows = appState.rows.filter(isMemberRowDirty);
          if (!changedRows.length) { cancelMemberEditing(); showToast("Nenhuma alteração para salvar.", "info"); return; }
          const destructive = changedRows.some(row => !isConsultantRole(row.values[memberFieldIndexes().role]) &&
            isConsultantRole(memberDraft(row)[memberFieldIndexes().role]));
          if (destructive && !window.confirm("Ao salvar como Consultor(a), datas e marcações não aplicáveis serão removidas. Confirmar?")) return;
          members = appState.rows.map(row => ({ ...row, values: prepareMemberValues(memberDraft(row)).map(value => String(value ?? "").trim()) }));
          members.forEach(row => assertRequiredMemberFields(row.values, row.row));
        } catch (error) { showToast(error.message, "warning"); return; }
        appState.savingMembers = true;
        updateMemberEditControls(); renderMembers(); setWorkspaceState("", "Salvando");
        try {
          await persistCompactMemberList(members);
          appState.editingMembers = false;
          appState.memberDrafts.clear();
          showToast(formatCount(changedRows.length) + " registros confirmados na planilha.", "success");
        } catch (error) { setWorkspaceState("error", "Confira a gravação"); showToast(error.message, "error"); }
        finally { appState.savingMembers = false; updateMemberEditControls(); renderMembers(); }
      }

      function createAddBooleanField(label, index) {
        const wrapper = document.createElement("div");
        wrapper.className = "form-field";
        wrapper.dataset.addMemberIndex = String(index);

        const buttonId = `add-member-boolean-${index}`;
        const fieldLabel = document.createElement("label");
        fieldLabel.htmlFor = buttonId;
        fieldLabel.textContent = label;

        const button = document.createElement("button");
        button.id = buttonId;
        button.className = "boolean-toggle add-member-boolean-toggle";
        button.type = "button";
        button.dataset.addBooleanIndex = String(index);
        updateBooleanToggle(button, "false", index);
        button.addEventListener("click", () => {
          const nextState =
            button.dataset.state === "true" ? "false" : "true";
          updateBooleanToggle(button, nextState, index);
        });

        wrapper.append(fieldLabel, button);
        return wrapper;
      }

      function createAddRoleField(label, index) {
        const wrapper = document.createElement("div");
        wrapper.className = "form-field";
        wrapper.dataset.addMemberIndex = String(index);

        const fieldLabel = document.createElement("label");
        fieldLabel.htmlFor = "add-member-role";
        fieldLabel.textContent = `${label} *`;

        const select = createRoleSelect("", {
          id: "add-member-role",
          index,
          className: "form-select",
          label,
          onChange: updateAddMemberFieldVisibility
        });
        select.required = true;
        wrapper.append(fieldLabel, select);
        return wrapper;
      }

      function createAddDateField(label, index) {
        const wrapper = document.createElement("div");
        wrapper.className = "form-field";
        wrapper.dataset.addMemberIndex = String(index);
        const indexes = memberFieldIndexes();
        const calculated = index === indexes.licenseReturn;

        const inputId = `add-member-date-${index}`;
        const fieldLabel = document.createElement("label");
        fieldLabel.htmlFor = inputId;
        fieldLabel.textContent = label;

        wrapper.append(
          fieldLabel,
          createDateControl("", {
            id: inputId,
            index,
            label,
            disabled: calculated,
            calculated,
            onChange:
              index === indexes.licenseStart
                ? updateAddMemberReturnDate
                : undefined
          })
        );
        return wrapper;
      }

      function updateAddMemberReturnDate() {
        const indexes = memberFieldIndexes();
        if (
          indexes.licenseStart < 0 ||
          indexes.licenseDays < 0 ||
          indexes.licenseReturn < 0
        ) {
          return;
        }

        const startControl = document
          .getElementById(`add-member-date-${indexes.licenseStart}`)
          ?.closest(".date-control");
        const daysInput = document.getElementById(
          `add-member-field-${indexes.licenseDays}`
        );
        const returnControl = document
          .getElementById(`add-member-date-${indexes.licenseReturn}`)
          ?.closest(".date-control");
        setDateControlValue(
          returnControl,
          calculateMemberReturnDate(
            startControl?.dataset.value || "",
            daysInput?.value || ""
          )
        );
      }

      function updateAddMemberFieldVisibility() {
        const role = document.getElementById("add-member-role");
        if (!role) return;
        const indexes = memberFieldIndexes();
        const consultant = isConsultantRole(role.value);

        document
          .querySelectorAll("[data-add-member-index]")
          .forEach((field) => {
            const index = Number(field.dataset.addMemberIndex);
            field.hidden =
              consultant &&
              index !== indexes.role &&
              index !== indexes.nickname;
          });

        const booleanGroup = document.getElementById(
          "add-member-boolean-group"
        );
        if (booleanGroup) booleanGroup.hidden = consultant;
      }

      function openAddMemberEditor() {
        if (!requireEditAccess()) return;
        try { requireFreshMembers(); } catch (error) { showToast(error.message, "warning"); return; }
        if (
          !appState.loaded ||
          appState.editingMembers ||
          appState.removingMembers ||
          appState.addingMember
        ) {
          return;
        }

        appState.addingMember = true;
        appState.booleanColumns = detectBooleanColumns();
        const fields = document.getElementById("add-member-fields");
        fields.replaceChildren();
        const indexes = memberFieldIndexes();
        const booleanGroup = document.createElement("div");
        booleanGroup.id = "add-member-boolean-group";
        booleanGroup.className = "add-member-boolean-group";

        appState.headers.forEach((header, index) => {
          if (isFormulaMemberColumn(index) && index !== indexes.licenseReturn) return;

          const label = header || `Campo ${index + 1}`;
          let field;

          if (index === indexes.role) {
            field = createAddRoleField(label, index);
          } else if (appState.booleanColumns.has(index)) {
            field = createAddBooleanField(label, index);
          } else if (isDateColumn(index)) {
            field = createAddDateField(label, index);
          } else {
            const isDaysField = index === indexes.licenseDays;
            const isNicknameField = index === indexes.nickname;
            field = createFormField(
              isNicknameField ? `${label} *` : label,
              "",
              index,
              {
                id: `add-member-field-${index}`,
                placeholder: isDaysField
                  ? "Informe a quantidade de dias"
                  : isNicknameField
                    ? ".Brendon / Lintre ou .Brendon, Lintre"
                    : "Preencha este campo",
                type: isDaysField ? "number" : "text",
                min: isDaysField ? 1 : undefined
              }
            );
            if (isNicknameField) {
              field.querySelector("input").required = true;
            }
            field.dataset.addMemberIndex = String(index);
          }

          if (appState.booleanColumns.has(index)) {
            booleanGroup.appendChild(field);
          } else {
            fields.appendChild(field);
          }
        });

        if (booleanGroup.childElementCount) {
          fields.appendChild(booleanGroup);
        }

        const daysInput = document.getElementById(
          `add-member-field-${indexes.licenseDays}`
        );
        if (daysInput) {
          daysInput.step = "1";
          daysInput.inputMode = "numeric";
          daysInput.addEventListener("input", updateAddMemberReturnDate);
        }

        updateAddMemberFieldVisibility();
        updateMemberEditControls();
        document.getElementById("add-member-editor").showModal();
      }

      function closeAddMemberEditor() {
        if (appState.savingMembers) return;
        appState.addingMember = false;
        document.getElementById("add-member-editor").close();
        updateMemberEditControls();
      }

      function splitMemberNicknames(value) {
        const seen = new Set();

        return String(value || "")
          .split(/[\/,]/)
          .map((nickname) => nickname.trim())
          .filter((nickname) => {
            const key = nicknameIdentity(nickname);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          });
      }

      function buildNewMemberRows(values, firstRow) {
        const nicknameIndex = memberFieldIndexes().nickname;
        if (nicknameIndex < 0) {
          return [{ row: firstRow, values: values.slice() }];
        }

        return splitMemberNicknames(values[nicknameIndex]).map(
          (nickname, index) => {
            const rowValues = values.slice();
            rowValues[nicknameIndex] = nickname;
            return { row: firstRow + index, values: rowValues };
          }
        );
      }

      async function saveNewMember(event) {
        event.preventDefault();
        if (!requireEditAccess()) return;
        if (!appState.addingMember || appState.savingMembers) return;

        const indexes = memberFieldIndexes();
        let values;
        try {
          requireFreshMembers();
          values = prepareMemberValues(
          appState.headers.map((_, index) => {
            if (isFormulaMemberColumn(index)) return "";

            if (index === indexes.role) {
              return document.getElementById("add-member-role").value;
            }
            if (appState.booleanColumns.has(index)) {
              const button = document.getElementById(
                `add-member-boolean-${index}`
              );
              return button.dataset.state === "true" ? "TRUE" : "FALSE";
            }
            if (isDateColumn(index)) {
              return document
                .getElementById(`add-member-date-${index}`)
                .closest(".date-control").dataset.value;
            }

            return document
              .getElementById(`add-member-field-${index}`)
              .value.trim();
          })
        );

        } catch (error) { showToast(error.message, "warning"); return; }

        const newRowNumber = Math.max(appState.maxDataRow, 1) + 1;
        const newMemberRows = buildNewMemberRows(values, newRowNumber);
        if (!newMemberRows.length) {
          showToast(
            "Informe ao menos um nickname. Separe vários por / ou ,.",
            "warning"
          );
          return;
        }

        try {
          newMemberRows.forEach((item) =>
            assertRequiredMemberFields(item.values, item.row)
          );
        } catch (error) {
          showToast(error.message, "warning");
          return;
        }

        const button = document.getElementById("save-new-member");
        appState.savingMembers = true;
        button.disabled = true;
        button.textContent = "Adicionando…";
        updateMemberEditControls();

        try {
          await persistCompactMemberList(
            appState.rows
              .map((row) => ({
                ...row,
                values: memberEditableValues(row).slice()
              }))
              .concat(
                newMemberRows.map((item) => ({
                  row: item.row,
                  values: item.values.slice()
                }))
              )
          );
          appState.addingMember = false;
          document.getElementById("add-member-editor").close();
          renderMembers();
          updateDataTimestamp();
          setWorkspaceState("ready", "Sincronizado");
          showToast(
            newMemberRows.length === 1
              ? "Novo membro adicionado e lista organizada."
              : `${formatCount(
                  newMemberRows.length
                )} novos membros adicionados e lista organizada.`,
            "success"
          );
        } catch (error) {
          showToast(error.message, "error");
        } finally {
          appState.savingMembers = false;
          button.disabled = false;
          button.textContent = "Adicionar membro";
          updateMemberEditControls();
        }
      }

      function beginMemberRemoval() {
        if (!requireEditAccess()) return;
        try { requireFreshMembers(); } catch (error) { showToast(error.message, "warning"); return; }
        if (
          !appState.loaded ||
          !appState.rows.length ||
          appState.editingMembers ||
          appState.removingMembers ||
          appState.addingMember
        ) {
          return;
        }

        appState.removingMembers = true;
        appState.selectedMemberRows.clear();
        setWorkspaceState("", "Selecionando");
        updateMemberEditControls();
        renderMembers();
      }

      function cancelMemberRemoval() {
        if (appState.savingMembers) return;
        appState.removingMembers = false;
        appState.selectedMemberRows.clear();
        setWorkspaceState(
          appState.requiresRefresh ? "error" : "ready",
          appState.requiresRefresh ? "Atualização necessária" : "Sincronizado"
        );
        updateMemberEditControls();
        renderMembers();
      }

      async function confirmMemberRemoval() {
        if (!requireEditAccess()) return;
        if (
          !appState.removingMembers ||
          appState.savingMembers ||
          !appState.selectedMemberRows.size
        ) {
          return;
        }

        const selected = new Set(appState.selectedMemberRows);
        const rows = Array.from(selected);
        appState.savingMembers = true;
        setWorkspaceState("", "Removendo");
        updateMemberEditControls();
        renderMembers();

        try {
          await persistCompactMemberList(
            appState.rows
              .filter((row) => !selected.has(row.row))
              .map((row) => ({
                ...row,
                values: memberEditableValues(row).slice()
              }))
          );
          appState.removingMembers = false;
          appState.selectedMemberRows.clear();
          updateDataTimestamp();
          setWorkspaceState("ready", "Sincronizado");
          showToast(
            `${formatCount(rows.length)} membro${
              rows.length === 1 ? "" : "s"
            } removido${
              rows.length === 1 ? "" : "s"
            } da NexusList. Lista organizada.`,
            "success"
          );
        } catch (error) {
          setWorkspaceState("error", "Falha ao remover");
          showToast(error.message, "error");
        } finally {
          appState.savingMembers = false;
          updateMemberEditControls();
          renderMembers();
        }
      }

      function renderSettings() {
        const list = document.getElementById("role-list");
        list.replaceChildren();
        const roles = appState.settings.filter(
          (item) =>
            String(item.role || "").trim() ||
            String(item.vacancies ?? "").trim()
        );
        roles.sort((left, right) => {
          const rankDifference = roleRank(left.role) - roleRank(right.role);
          if (rankDifference) return rankDifference;
          return roleOptionIndex(left.role) - roleOptionIndex(right.role);
        });

        if (!roles.length) {
          const empty = document.createElement("p");
          empty.className = "role-list__empty";
          empty.textContent = "Nenhum cargo configurado.";
          list.appendChild(empty);
        } else {
          roles.forEach((item) => {
            const card = document.createElement("article");
            card.className = "role-card";

            const top = document.createElement("div");
            top.className = "role-card__top";

            const name = document.createElement("strong");
            name.className = "role-card__name";
            name.textContent =
              canonicalRoleName(item.role) || "Cargo sem nome";
            name.title = name.textContent;

            const meta = document.createElement("div");
            meta.className = "role-card__meta";

            const vacancies = document.createElement("span");
            vacancies.className = "role-card__vacancies";
            vacancies.textContent =
              item.vacancies === "" || item.vacancies === null
                ? "Vagas não definidas"
                : `${formatCount(item.vacancies)} vaga${
                    Number(item.vacancies) === 1 ? "" : "s"
                  }`;

            const editButton = document.createElement("button");
            editButton.className = "text-button";
            editButton.type = "button";
            editButton.textContent = "Editar";
            editButton.addEventListener("click", () =>
              openSettingsEditor(item.row)
            );

            top.append(name);
            meta.append(vacancies);
            if (canCurrentUserEdit()) meta.append(editButton);
            card.append(top, meta);
            list.appendChild(card);
          });
        }

        renderLayoutResources();
      }

      function renderAdditionalAccess() {
        const container = document.getElementById("additional-access-list");
        container.replaceChildren();

        if (
          !appState.additionalAccess.length &&
          !appState.additionalAccessRoles.length
        ) {
          const empty = document.createElement("p");
          empty.className = "layout-resources__empty";
          empty.textContent = "Nenhum acesso adicional.";
          container.appendChild(empty);
          return;
        }

        appState.additionalAccess
          .slice()
          .sort((left, right) =>
            left.localeCompare(right, "pt-BR", { sensitivity: "base" })
          )
          .forEach((nickname) => {
            container.appendChild(
              createAdditionalAccessChip(
                `Nickname: ${nickname}`,
                "nickname",
                nickname,
                `Acesso explícito de ${nickname}`
              )
            );
          });

        appState.additionalAccessRoles
          .slice()
          .sort((left, right) =>
            left.localeCompare(right, "pt-BR", { sensitivity: "base" })
          )
          .forEach((role) => {
            container.appendChild(
              createAdditionalAccessChip(
                `Cargo: ${role}`,
                "cargo",
                role,
                `Acesso dinâmico para o cargo ${role}`
              )
            );
          });
      }

      function createAdditionalAccessChip(label, accessType, value, title) {
        const chip = document.createElement("span");
        chip.className = "additional-access-chip";
        chip.title = title;

        const text = document.createElement("span");
        text.className = "additional-access-chip__text";
        text.textContent = label;

        const removeButton = document.createElement("button");
        removeButton.className = "additional-access-chip__remove";
        removeButton.type = "button";
        removeButton.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
        removeButton.setAttribute("aria-label", `Remover ${label}`);
        removeButton.title = `Remover ${label}`;
        removeButton.addEventListener("click", () =>
          removeAdditionalAccess(accessType, value, removeButton)
        );

        chip.append(text, removeButton);
        return chip;
      }

      function applyAdditionalAccessState(result) {
        appState.additionalAccess = Array.isArray(result.nicknames)
          ? result.nicknames.slice()
          : appState.additionalAccess;
        appState.additionalAccessRoles = Array.isArray(result.roles)
          ? result.roles.slice()
          : appState.additionalAccessRoles;
        appState.availableAccessRoles = Array.isArray(result.availableRoles)
          ? result.availableRoles.map((entry) => ({
              role: String(entry.role || "")
            }))
          : appState.availableAccessRoles;
        renderAdditionalAccess();
        updateAdditionalAccessRoleOptions();
      }

      function accessValues(response, accessType) {
        const access = response.additionalAccess;
        if (!access || !Array.isArray(access.nicknames) || !Array.isArray(access.roles)) throw new Error("A API não confirmou a lista de acessos.");
        return (accessType === "cargo" ? access.roles : access.nicknames)
          .map(value => accessType === "cargo" ? normalizeLookup(value) : nicknameIdentity(value)).sort();
      }

      async function persistAdditionalAccess(action, accessType, value) {
        requireFreshMembers();
        const before = await requestNexusList("bootstrap", null, { forceRefresh: true });
        decodeBootstrap(before);
        const serverValues = accessValues(before, accessType);
        const localValues = (accessType === "cargo" ? appState.additionalAccessRoles : appState.additionalAccess)
          .map(value => accessType === "cargo" ? normalizeLookup(value) : nicknameIdentity(value)).sort();
        if (JSON.stringify(serverValues) !== JSON.stringify(localValues)) throw new Error("Os acessos mudaram. Atualize antes de alterar.");
        const result = await requestNexusList(action, { accessType, value, expectedRevision: before.meta?.revision ?? null });
        accessValues(result, accessType);
        const response = await requestNexusList("bootstrap", null, { forceRefresh: true });
        const decoded = decodeBootstrap(response);
        const values = accessValues(response, accessType);
        const targets = (accessType === "cargo" ? [value] : splitMemberNicknames(value))
          .map(value => accessType === "cargo" ? normalizeLookup(value) : nicknameIdentity(value));
        if (!targets.length || targets.some(target => values.includes(target) !== (action === "addAdditionalAccess"))) throw new Error("A leitura não confirmou a alteração de acesso. Confira antes de tentar novamente.");
        acceptBootstrap(response, decoded); renderBootstrap(response);
        return result;
      }

      async function removeAdditionalAccess(accessType, value, button) {
        if (!requireManageAccess() || appState.settingsSaving) return;
        appState.settingsSaving = true; button.disabled = true; updateMemberEditControls();
        try {
          await persistAdditionalAccess("removeAdditionalAccess", accessType, value);
          showToast("Acesso removido e confirmado na planilha.", "success");
          revalidateAuthentication().catch(() => {});
        } catch (error) { appState.requiresRefresh = true; showToast(error.message, "error"); }
        finally { appState.settingsSaving = false; button.disabled = false; updateMemberEditControls(); }
      }

      function updateAdditionalAccessRoleOptions() {
        const select = document.getElementById("additional-access-role");
        const previous = select.value;
        select.replaceChildren();

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = appState.availableAccessRoles.length
          ? "Selecione um cargo"
          : "Nenhum cargo disponível";
        select.appendChild(placeholder);

        appState.availableAccessRoles.forEach((entry) => {
          const option = document.createElement("option");
          option.value = entry.role;
          option.textContent = entry.role;
          select.appendChild(option);
        });

        if (
          Array.from(select.options).some((option) => option.value === previous)
        ) {
          select.value = previous;
        }
      }

      function updateAdditionalAccessField() {
        const type = document.getElementById("additional-access-type").value;
        const nicknameField = document.getElementById(
          "additional-access-nickname-field"
        );
        const roleField = document.getElementById(
          "additional-access-role-field"
        );
        const input = document.getElementById("additional-access-value");
        const roleSelect = document.getElementById("additional-access-role");
        const byRole = type === "cargo";
        nicknameField.hidden = byRole;
        roleField.hidden = !byRole;
        input.placeholder = "Informe o nickname";
        input.disabled = byRole;
        input.required = !byRole;
        roleSelect.disabled = !byRole;
        roleSelect.required = byRole;
        if (byRole) {
          roleSelect.focus();
        } else {
          input.focus();
        }
      }

      async function saveAdditionalAccess(event) {
        event.preventDefault();
        if (!requireManageAccess() || appState.settingsSaving) return;
        const accessType = document.getElementById("additional-access-type").value;
        const input = document.getElementById("additional-access-value");
        const roleSelect = document.getElementById("additional-access-role");
        const value = (accessType === "cargo" ? roleSelect.value : input.value).trim();
        if (!value) return;
        const button = document.getElementById("save-additional-access");
        appState.settingsSaving = true; button.disabled = true; button.textContent = "Adicionando…";
        updateMemberEditControls();
        try {
          await persistAdditionalAccess("addAdditionalAccess", accessType, value);
          input.value = ""; roleSelect.value = "";
          showToast("Acesso confirmado na planilha.", "success");
        } catch (error) { appState.requiresRefresh = true; showToast(error.message, "error"); }
        finally { appState.settingsSaving = false; button.disabled = false; button.textContent = "Adicionar acesso"; updateMemberEditControls(); }
      }

      function getLayoutOwner() {
        return (
          appState.settings.find(
            (item) =>
              String(item.banner || "").trim() ||
              (item.links || []).some((link) => String(link || "").trim())
          ) ||
          appState.settings[0] ||
          null
        );
      }

      function displayHostname(value) {
        if (!value) return "Ainda não configurado";
        try {
          return new URL(value).hostname;
        } catch {
          return value;
        }
      }

      function createLayoutResource(label, value, meta) {
        const card = document.createElement("article");
        card.className = "layout-resource";

        const labelElement = document.createElement("span");
        labelElement.className = "layout-resource__label";
        labelElement.textContent = label;

        const valueElement = document.createElement("strong");
        valueElement.className = "layout-resource__value";
        valueElement.textContent = value;
        valueElement.title = value;

        const metaElement = document.createElement("span");
        metaElement.className = "layout-resource__meta";
        metaElement.textContent = meta;
        metaElement.title = meta;

        card.append(labelElement, valueElement, metaElement);
        return card;
      }

      function renderLayoutResources() {
        const container = document.getElementById("layout-resources");
        const editButton = document.getElementById("edit-layout");
        const owner = getLayoutOwner();
        container.replaceChildren();
        editButton.disabled = appState.loading || !owner;

        if (!owner) {
          const empty = document.createElement("p");
          empty.className = "layout-resources__empty";
          empty.textContent = "Nenhuma configuração disponível.";
          container.appendChild(empty);
          return;
        }

        const bannerCard = createLayoutResource(
          "Banner",
          owner.banner ? "Banner configurado" : "Sem banner",
          displayHostname(owner.banner)
        );

        const colors = appState.settings
          .map((item, index) => ({
            row: item.row,
            title:
              String(item.colorTitle || "").trim() || `Cor ${index + 1}`,
            value: String(item.color || "").trim()
          }))
          .filter((item) => item.value);
        const paletteCard = document.createElement("article");
        paletteCard.className = "layout-resource";
        const paletteLabel = document.createElement("span");
        paletteLabel.className = "layout-resource__label";
        paletteLabel.textContent = "Paleta";
        const palette = document.createElement("div");
        palette.className = "layout-palette";

        if (colors.length) {
          colors.forEach((color) => {
            const swatch = document.createElement("span");
            swatch.className = "layout-palette__swatch";
            swatch.title = `${color.title} — ${color.value}`;
            swatch.setAttribute(
              "aria-label",
              `${color.title}: ${color.value}`
            );
            if (
              window.CSS &&
              CSS.supports("color", color.value)
            ) {
              swatch.style.setProperty("--layout-color", color.value);
            } else if (
              color.row === 18 &&
              window.CSS &&
              CSS.supports("box-shadow", color.value)
            ) {
              swatch.style.setProperty("--layout-color", "var(--surface-muted)");
              swatch.style.boxShadow = color.value;
            }
            palette.appendChild(swatch);
          });
        } else {
          const value = document.createElement("strong");
          value.className = "layout-resource__value";
          value.textContent = "Sem cores";
          palette.appendChild(value);
        }

        const paletteMeta = document.createElement("span");
        paletteMeta.className = "layout-resource__meta";
        paletteMeta.textContent = colors.length
          ? `${formatCount(colors.length)} recurso${colors.length === 1 ? "" : "s"} ${colors.length === 1 ? "visual configurado" : "visuais configurados"}`
          : "Os recursos serão usados na composição visual";
        paletteCard.append(paletteLabel, palette, paletteMeta);

        const links = (owner.links || []).filter((link) =>
          String(link || "").trim()
        );
        const linksCard = createLayoutResource(
          "Discord e WhatsApp",
          links.length
            ? `${formatCount(links.length)} link${links.length === 1 ? "" : "s"}`
            : "Sem links",
          links.length
            ? links.map(displayHostname).join(" · ")
            : "Nenhum link configurado"
        );

        container.append(bannerCard, paletteCard, linksCard);
      }

      function updateDataTimestamp(isoDate) {
        const target = document.getElementById("data-updated");
        const date = isoDate ? new Date(isoDate) : new Date();
        target.textContent = `Sincronizado às ${date.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit"
        })}`;
      }

      function hasRequirementConfiguration() {
        const publishing = appState.publishing;
        return Boolean(
          publishing &&
            /^\d+$/.test(String(publishing.requirementsTopicId || "").trim()) &&
            /\{TAG\}/i.test(String(publishing.requirementsStampBbcode || ""))
        );
      }

      async function publishRequirementStamp(topicId, bbcode, transport) {
        if (transport.sameForumOrigin) {
          return replyForumTopic(topicId, bbcode);
        }
        return publishThroughForumBridge(transport.popup, {
          type: "NEXUSLIST_FORUM_ACTION",
          requestId: createPublishingRequestId(),
          action: "reply",
          topicId,
          bbcode
        });
      }

      function requirementTagInputs() {
        return [1, 2, 3].map((index) =>
          document.getElementById(`requirements-tag-${index}`)
        );
      }

      function requirementTagValue() {
        return requirementTagInputs()
          .map((input) => input.value)
          .join("");
      }

      function updateRequirementStampControls() {
        const button = document.getElementById("post-requirements-stamp");
        const complete = Array.from(requirementTagValue()).length === 3;
        button.disabled =
          appState.requirementsBusy || appState.publishingUncertain ||
          !complete ||
          !hasRequirementConfiguration();
        button.textContent = appState.requirementsBusy
          ? "Publicando…"
          : "Publicar carimbo";
      }

      function handleRequirementTagInput(event) {
        const inputs = requirementTagInputs();
        const index = inputs.indexOf(event.currentTarget);
        const character =
          Array.from(
            String(event.currentTarget.value || "")
              .replace(/\s/g, "")
          )[0] || "";
        event.currentTarget.value = character;
        if (character && inputs[index + 1]) inputs[index + 1].focus();
        updateRequirementStampControls();
      }

      function handleRequirementTagPaste(event) {
        const characters = Array.from(
          String(event.clipboardData?.getData("text") || "")
            .replace(/\s/g, "")
        ).slice(0, 3);
        if (!characters.length) return;
        event.preventDefault();
        const inputs = requirementTagInputs();
        inputs.forEach((input, index) => {
          input.value = characters[index] || "";
        });
        inputs[Math.min(characters.length, 3) - 1].focus();
        updateRequirementStampControls();
      }

      function handleRequirementTagKeydown(event) {
        if (event.key !== "Backspace" || event.currentTarget.value) return;
        const inputs = requirementTagInputs();
        const index = inputs.indexOf(event.currentTarget);
        if (inputs[index - 1]) inputs[index - 1].focus();
      }

      function openStampDialog() {
        if (!requireEditAccess()) return;
        if (!hasRequirementConfiguration()) {
          showToast(
            "Configure o tópico e o modelo do carimbo antes de continuar.",
            "warning"
          );
          return;
        }
        requirementTagInputs().forEach((input) => {
          input.value = "";
        });
        document.getElementById("requirements-status").textContent =
          "Informe a TAG de três caracteres para publicar o carimbo.";
        document.getElementById("requirements-dialog").showModal();
        requirementTagInputs()[0].focus();
        updateRequirementStampControls();
      }

      function closeRequirementsDialog() {
        if (appState.requirementsBusy) return;
        document.getElementById("requirements-dialog").close();
      }

      function requireTopicId(value, label) {
        const topicId = String(value || "").trim();
        if (!/^\d+$/.test(topicId)) {
          throw new Error(`${label} precisa ter um ID numérico válido.`);
        }
        return topicId;
      }

      async function postRequirementsStamp() {
        if (!requireEditAccess() || appState.requirementsBusy) return;
        if (appState.publishingUncertain) { showToast("Confira o tópico para saber se a postagem anterior foi publicada. Recarregue somente após conferir.", "warning"); return; }
        const tag = requirementTagValue();
        if (Array.from(tag).length !== 3) {
          showToast("A TAG deve ter exatamente três caracteres.", "warning");
          return;
        }

        const topicId = requireTopicId(
          appState.publishing?.requirementsTopicId,
          "O tópico de requerimentos"
        );
        const bbcode = String(
          appState.publishing?.requirementsStampBbcode || ""
        ).replace(/\{TAG\}/gi, tag);
        const transport = createPublishingTransport(
          { topicId },
          `nexuslist-requirements-${topicId}`
        );
        if (!transport) return;

        appState.requirementsBusy = true;
        document.getElementById("requirements-status").textContent =
          "Publicando carimbo…";
        updateRequirementStampControls();
        updateMemberEditControls();

        try {
          await publishRequirementStamp(topicId, bbcode, transport);
          document.getElementById("requirements-status").textContent =
            "Carimbo publicado com sucesso.";
          showToast("Carimbo publicado com sucesso.", "success");
        } catch (error) {
          document.getElementById("requirements-status").textContent =
            error.message;
          showToast(error.message, "error");
        } finally {
          appState.requirementsBusy = false;
          updateRequirementStampControls();
          updateMemberEditControls();
        }
      }

      function forumTopicUrl(topicId) {
        return `${CONFIG.forum.origin}/t${topicId}-`;
      }

      function parseForumDocument(html) {
        return new DOMParser().parseFromString(html, "text/html");
      }

      function forumLoginRequired(documentNode, responseUrl) {
        return (
          /\/login(?:\?|$)/i.test(responseUrl || "") ||
          Boolean(
            documentNode.querySelector(
              'form[action*="/login"] input[name="username"]'
            )
          )
        );
      }

      async function fetchForumWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), CONFIG.forum.bridgeTimeoutMs);
        try {
          const response = await fetch(url, { ...options, signal: controller.signal });
          const html = await response.text();
          return { response, html };
        } catch (error) {
          if (error.name === "AbortError") {
            const uncertain = options.method === "POST";
            if (uncertain) appState.publishingUncertain = true;
            throw new Error(uncertain ? "O fórum não confirmou a postagem a tempo. Confira o tópico antes de tentar novamente." : "O fórum demorou demais para responder.");
          }
          if (options.method === "POST") appState.publishingUncertain = true;
          throw error;
        } finally { window.clearTimeout(timeout); }
      }

      function confirmedForumPost(documentNode, responseUrl, topicId) {
        const error = documentNode.querySelector(".message-die, .error, .panel .error, .block-error");
        if (error?.textContent.trim()) throw new Error(error.textContent.trim());
        const candidates = [responseUrl];
        documentNode.querySelectorAll('meta[http-equiv="refresh" i]').forEach(meta => {
          const match = (meta.getAttribute("content") || "").match(/url\s*=\s*['"]?([^'";]+)/i);
          if (match) candidates.push(new URL(match[1], CONFIG.forum.origin).href);
        });
        const success = /mensagem.{0,40}(?:enviada|publicada|registrada)|(?:enviad|publicad)[ao].{0,30}sucesso|message.{0,40}(?:posted|sent)/i
          .test(documentNode.body?.textContent || "");
        if (success) documentNode.querySelectorAll('a[href]').forEach(link => {
          if (/ver|visualizar|mensagem|postagem|message|post|view/i.test(link.textContent || "")) candidates.push(new URL(link.getAttribute("href"), CONFIG.forum.origin).href);
        });
        return candidates.find(value => {
          const url = new URL(value, CONFIG.forum.origin);
          const topic = /^\/t(\d+)(?:p\d+)?(?:-|$)/.exec(url.pathname);
          return url.origin === CONFIG.forum.origin && topic && topic[1] === String(topicId) &&
            (/^#(?:p|msg)?\d+$/.test(url.hash) || /^\d+$/.test(url.searchParams.get("p") || ""));
        }) || null;
      }

      async function fetchForumDocument(url) {
        const { response, html } = await fetchForumWithTimeout(url, { credentials: "include", redirect: "follow", cache: "no-store" });
        const documentNode = parseForumDocument(html);

        if (!response.ok) {
          throw new Error(`O fórum respondeu com status ${response.status}.`);
        }
        if (forumLoginRequired(documentNode, response.url)) {
          throw new Error("Entre no fórum antes de usar a postagem automática.");
        }

        return {
          document: documentNode,
          url: response.url || url
        };
      }

      function findForumPostingForm(documentNode) {
        return Array.from(documentNode.forms).find((form) =>
          form.querySelector(
            'textarea[name="message"], textarea#text_editor_textarea, textarea'
          )
        );
      }

      function createForumSubmissionBody(form, textarea, bbcode, options = {}) {
        if (options.clearEditReason) {
          form
            .querySelectorAll('[name="edit_reason"]')
            .forEach((control) => control.remove());
        }

        const body = new FormData(form);
        body.set(textarea.name || "message", bbcode);
        body.delete("preview");
        body.set("post", "Enviar");

        if (options.clearEditReason) {
          body.delete("edit_reason");
        }

        if (options.enableHtml) {
          body.delete("disable_html");
        } else if (options.disableHtml) {
          const disableHtmlControl = form.querySelector(
            'input[name="disable_html"]'
          );
          body.set(
            disableHtmlControl?.name || "disable_html",
            disableHtmlControl?.value || "1"
          );
        }

        return body;
      }

      async function submitForumPostingForm(formUrl, bbcode, options = {}) {
        const page = await fetchForumDocument(formUrl);
        const form = findForumPostingForm(page.document);
        if (!form) {
          throw new Error(
            "O formulário de postagem não foi encontrado. Verifique sua permissão."
          );
        }

        const textarea = form.querySelector(
          'textarea[name="message"], textarea#text_editor_textarea, textarea'
        );
        const body = createForumSubmissionBody(form, textarea, bbcode, options);

        const action = new URL(
          form.getAttribute("action") || "/post",
          CONFIG.forum.origin
        );
        if (action.origin !== CONFIG.forum.origin) {
          throw new Error("O formulário do fórum apontou para uma origem inesperada.");
        }
        const { response, html } = await fetchForumWithTimeout(action, { method: "POST", credentials: "include", redirect: "follow", body });
        const resultDocument = parseForumDocument(html);

        if (!response.ok) {
          throw new Error(`O fórum recusou o envio com status ${response.status}.`);
        }
        if (forumLoginRequired(resultDocument, response.url)) {
          throw new Error("Sua sessão do fórum expirou. Entre novamente.");
        }
        if (
          /\/post(?:\?|$)/i.test(response.url || "") &&
          findForumPostingForm(resultDocument)
        ) {
          const error =
            resultDocument.querySelector(
              ".message-die, .error, .panel .error, .block-error"
            )?.textContent || "O fórum não confirmou a publicação.";
          throw new Error(error.trim());
        }

        const topicId = new URL(formUrl, CONFIG.forum.origin).searchParams.get("t");
        const confirmed = confirmedForumPost(resultDocument, response.url, topicId);
        if (!confirmed) {
          appState.publishingUncertain = true;
          throw new Error("Não foi possível confirmar a publicação. Confira o tópico antes de tentar novamente.");
        }
        return confirmed;
      }

      async function replyForumTopic(topicId, bbcode) {
        const replyUrl = new URL("/post", CONFIG.forum.origin);
        replyUrl.searchParams.set("t", topicId);
        replyUrl.searchParams.set("mode", "reply");
        return submitForumPostingForm(replyUrl, bbcode, {
          enableHtml: true
        });
      }

      function createPublishingRequestId() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
          return window.crypto.randomUUID();
        }
        return `nexuslist-${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}`;
      }

      function publishThroughForumBridge(popup, request) {
        return new Promise((resolve, reject) => {
          let sent = false;
          const timeout = window.setTimeout(() => {
            cleanup();
            if (sent) appState.publishingUncertain = true;
            reject(new Error(sent
              ? "O fórum não confirmou o resultado. Confira o tópico antes de tentar novamente."
              : "Atualize o NexusList-Forumeiros-Bridge.js no fórum para habilitar a ponte com confirmação."));
          }, CONFIG.forum.bridgeTimeoutMs);
          const interval = window.setInterval(() => {
            if (popup.closed) {
              cleanup(); if (sent) appState.publishingUncertain = true;
              reject(new Error("A janela foi fechada. Confira o tópico antes de repetir a postagem.")); return;
            }
            // Only repeat a harmless readiness probe. Never replay the write.
            if (!sent) popup.postMessage({ type: "NEXUSLIST_FORUM_HELLO", requestId: request.requestId }, CONFIG.forum.origin);
          }, 900);
          function cleanup() {
            window.clearTimeout(timeout); window.clearInterval(interval);
            window.removeEventListener("message", onMessage);
          }
          function onMessage(event) {
            if (event.origin !== CONFIG.forum.origin || event.source !== popup || event.data?.requestId !== request.requestId) return;
            if (event.data.type === "NEXUSLIST_FORUM_READY" && !sent) {
              sent = true; popup.postMessage(request, CONFIG.forum.origin); return;
            }
            if (event.data.type !== "NEXUSLIST_FORUM_RESULT" || !sent) return;
            cleanup();
            if (event.data.ok === true && event.data.postUrl) resolve(event.data);
            else { appState.publishingUncertain = event.data.uncertain === true; reject(new Error(event.data.error || "Publicação não confirmada.")); }
          }
          window.addEventListener("message", onMessage);
          popup.postMessage({ type: "NEXUSLIST_FORUM_HELLO", requestId: request.requestId }, CONFIG.forum.origin);
        });
      }

      function createPublishingTransport(action, windowName) {
        const sameForumOrigin =
          window.location.origin === CONFIG.forum.origin;
        const popup = sameForumOrigin
          ? null
          : window.open(
              forumTopicUrl(action.topicId),
              windowName
            );

        if (!sameForumOrigin && !popup) {
          showToast(
            "Permita a abertura da janela do fórum para continuar.",
            "warning"
          );
          return null;
        }

        return { sameForumOrigin, popup };
      }

      async function loadNexusList(options = {}) {
        const { quiet = false } = options;
        if (appState.editingMembers || appState.removingMembers || appState.addingMember || appState.savingMembers || appState.settingsSaving) {
          if (!quiet) showToast("Conclua ou cancele a edição antes de atualizar a lista.", "warning");
          return false;
        }
        const sequence = ++appState.loadSequence;
        setDataLoading(true);
        setWorkspaceState("", "Sincronizando");
        try {
          const response = await requestNexusList("bootstrap", null, { forceRefresh: true });
          if (sequence !== appState.loadSequence) return false;
          acceptBootstrap(response);
          renderBootstrap(response);
          if (!quiet) showToast(formatCount(appState.rows.length) + " registros atualizados.", "success");
          return true;
        } catch (error) {
          if (sequence !== appState.loadSequence) return false;
          appState.requiresRefresh = true;
          setWorkspaceState("error", "Atualização necessária");
          if (!appState.loaded) {
            document.getElementById("members-table").hidden = true;
            document.getElementById("table-state").hidden = false;
            document.getElementById("table-state").textContent = error.message;
          }
          showToast(error.message + " Edição bloqueada até atualizar com sucesso.", "error");
          return false;
        } finally {
          if (sequence === appState.loadSequence) setDataLoading(false);
        }
      }

      function createFormField(label, value, index, options = {}) {
        const wrapper = document.createElement("div");
        wrapper.className = `form-field${options.wide ? " form-field--wide" : ""}`;

        const inputId =
          options.id || `${options.prefix || "field"}-${index}`;
        const fieldLabel = document.createElement("label");
        fieldLabel.htmlFor = inputId;
        fieldLabel.textContent = label;

        const input = document.createElement("input");
        input.id = inputId;
        input.name = inputId;
        input.type = options.type || "text";
        input.value = value ?? "";
        input.dataset.index = index;
        if (options.placeholder) input.placeholder = options.placeholder;
        if (options.min !== undefined) input.min = options.min;
        if (options.dataset) {
          Object.entries(options.dataset).forEach(([key, datasetValue]) => {
            input.dataset[key] = datasetValue;
          });
        }

        wrapper.append(fieldLabel, input);
        return wrapper;
      }

      function openSettingsEditor(rowNumber) {
        if (!requireEditAccess() || appState.settingsSaving || appState.loading || appState.requiresRefresh) return;
        const item = appState.settings.find((entry) => entry.row === rowNumber);
        if (!item) return;

        appState.editingSettingsRow = rowNumber;
        document.getElementById("settings-editor-eyebrow").textContent =
          "Configuração do cargo";
        const fields = document.getElementById("settings-editor-fields");
        fields.replaceChildren();

        const roleField = document.createElement("div");
        roleField.className = "form-field";
        const roleLabel = document.createElement("label");
        roleLabel.htmlFor = "settings-field-0";
        roleLabel.textContent = "Cargo";
        roleField.append(
          roleLabel,
          createRoleSelect(item.role, {
            id: "settings-field-0",
            index: 0,
            className: "form-select",
            label: "Cargo"
          })
        );

        const vacanciesField = createFormField(
          "Quantidade de vagas",
          item.vacancies,
          1,
          {
            id: "settings-field-1",
            type: "number",
            placeholder: "0",
            min: 0
          }
        );
        fields.append(roleField, vacanciesField);

        const dialog = document.getElementById("settings-editor");
        dialog.oncancel = event => { if (appState.settingsSaving) event.preventDefault(); };
        dialog.showModal();
      }

      function closeSettingsEditor() {
        if (appState.settingsSaving) return;
        appState.editingSettingsRow = null;
        document.getElementById("settings-editor").close();
      }

      async function saveRoleSettings(event) {
        event.preventDefault();
        if (!requireEditAccess() || appState.settingsSaving) return;
        const item = appState.settings.find(entry => entry.row === appState.editingSettingsRow);
        if (!item) return;
        const role = document.getElementById("settings-field-0").value.trim();
        const vacanciesText = document.getElementById("settings-field-1").value.trim();
        if (!role || (vacanciesText && (!/^\d+$/.test(vacanciesText) || !Number.isSafeInteger(Number(vacanciesText))))) {
          showToast("Selecione um cargo e informe vagas inteiras não negativas.", "warning"); return;
        }
        appState.settingsSaving = true;
        const button = document.getElementById("save-settings"); button.disabled = true;
        updateMemberEditControls();
        try {
          const latest = await requestNexusList("bootstrap", null, { forceRefresh: true });
          decodeBootstrap(latest);
          const serverItem = latest.settings.rows.find(entry => Number(entry.row) === Number(item.row));
          if (!serverItem || canonicalRoleName(serverItem.role) !== item.role || String(serverItem.vacancies ?? "") !== String(item.vacancies ?? "")) {
            throw new Error("Esta configuração mudou. Atualize a lista antes de editar.");
          }
          await requestNexusList("saveSettings", { rows: [{ row: item.row, role, vacancies: vacanciesText }], expectedRevision: latest.meta?.revision ?? null });
          const response = await requestNexusList("bootstrap", null, { forceRefresh: true });
          const decoded = decodeBootstrap(response);
          const saved = response.settings.rows.find(entry => Number(entry.row) === Number(item.row));
          if (!saved || canonicalRoleName(saved.role) !== canonicalRoleName(role) || String(saved.vacancies ?? "") !== vacanciesText) throw new Error("A API não confirmou o cargo e as vagas enviados. Atualize para conferir.");
          acceptBootstrap(response, decoded); renderBootstrap(response);
          appState.settingsSaving = false; closeSettingsEditor();
          showToast("Cargo e vagas confirmados na planilha.", "success");
        } catch (error) { appState.requiresRefresh = true; showToast(error.message, "error"); }
        finally { appState.settingsSaving = false; button.disabled = false; updateMemberEditControls(); }
      }

      function createEditorFieldset(title, description) {
        const section = document.createElement("section");
        section.className = "editor-fieldset";

        const heading = document.createElement("h3");
        heading.className = "editor-fieldset__title";
        heading.textContent = title;

        const copy = document.createElement("p");
        copy.className = "editor-fieldset__description";
        copy.textContent = description;

        const grid = document.createElement("div");
        grid.className = "editor-grid";
        section.append(heading, copy, grid);
        return { section, grid };
      }

      function normalizeLayoutStyleValue(value) {
        return String(value || "").trim();
      }

      function validPreviewStyleValue(value, property) {
        if (!value || !window.CSS || typeof CSS.supports !== "function") {
          return false;
        }
        return property === "--directory-shadow"
          ? CSS.supports("box-shadow", value)
          : CSS.supports("color", value);
      }

      function previewTextColor(value) {
        let hex = String(value || "").replace("#", "");
        if (hex.length === 3 || hex.length === 4) {
          hex = hex
            .slice(0, 3)
            .split("")
            .map((digit) => digit + digit)
            .join("");
        } else {
          hex = hex.slice(0, 6);
        }

        if (!/^[0-9A-F]{6}$/i.test(hex)) return "#FFFFFF";
        const channels = [0, 2, 4].map((offset) =>
          parseInt(hex.slice(offset, offset + 2), 16)
        );
        const luminance =
          (channels[0] * 299 + channels[1] * 587 + channels[2] * 114) /
          255000;
        return luminance > 0.62 ? "#171717" : "#FFFFFF";
      }

      function updateLayoutBannerPreview() {
        const input = document.getElementById("layout-banner");
        const image = document.getElementById("layout-preview-banner");
        const placeholder = document.getElementById(
          "layout-preview-banner-placeholder"
        );
        if (!input || !image || !placeholder) return;

        const value = input.value.trim();
        image.hidden = true;
        placeholder.hidden = false;

        if (!value) {
          image.removeAttribute("src");
          image.dataset.previewSource = "";
          placeholder.textContent =
            "Adicione o link do banner para visualizá-lo.";
          return;
        }

        let source;
        try {
          const parsed = new URL(value);
          if (!["http:", "https:"].includes(parsed.protocol)) {
            throw new Error("Protocolo inválido");
          }
          source = parsed.toString();
        } catch {
          image.removeAttribute("src");
          image.dataset.previewSource = "";
          placeholder.textContent = "Insira um link válido para o banner.";
          return;
        }

        placeholder.textContent = "Carregando banner…";
        image.dataset.previewSource = source;
        image.onload = () => {
          if (image.dataset.previewSource !== source) return;
          image.hidden = false;
          placeholder.hidden = true;
        };
        image.onerror = () => {
          if (image.dataset.previewSource !== source) return;
          image.hidden = true;
          placeholder.hidden = false;
          placeholder.textContent = "Não foi possível carregar este banner.";
        };

        if (image.src !== source) {
          image.src = source;
        } else if (image.complete) {
          if (image.naturalWidth) {
            image.hidden = false;
            placeholder.hidden = true;
          } else {
            placeholder.textContent = "Não foi possível carregar este banner.";
          }
        }
      }

      function updateLayoutColorPreview() {
        const canvas = document.getElementById("layout-preview-canvas");
        const palette = document.getElementById("layout-preview-palette");
        if (!canvas || !palette) return;

        const definitions = [
          { property: "--directory-purple", label: "Roxo principal", fallback: "#821f88" },
          { property: "--directory-purple-dark", label: "Roxo escuro", fallback: "#57125b" },
          { property: "--directory-purple-deep", label: "Roxo profundo", fallback: "#500b59" },
          { property: "--directory-purple-bright", label: "Roxo brilhante", fallback: "#a22ca9" },
          { property: "--directory-purple-role", label: "Roxo dos cargos", fallback: "#8a188c" },
          { property: "--directory-lilac", label: "Lilás", fallback: "#dacbdb" },
          { property: "--directory-lilac-soft", label: "Lilás suave", fallback: "#f0f0f0" },
          { property: "--directory-lilac-muted", label: "Lilás secundário", fallback: "#c8b9c9" },
          { property: "--directory-ink", label: "Texto", fallback: "#352838" },
          { property: "--directory-white", label: "Branco", fallback: "#ffffff" },
          { property: "--directory-green", label: "WhatsApp", fallback: "#1ca14e" },
          { property: "--directory-discord", label: "Discord", fallback: "#5865f2" },
          { property: "--directory-project", label: "Projeto aprovado", fallback: "#da70d6" },
          { property: "--directory-pending", label: "Graduação pendente", fallback: "#b38171" },
          { property: "--directory-danger", label: "Perigo", fallback: "#b83243" },
          { property: "--directory-danger-soft", label: "Perigo suave", fallback: "rgba(184, 50, 67, 0.18)" },
          { property: "--directory-shadow", label: "Sombra", fallback: "0 2px 5px rgba(20, 0, 0, 0.14)" }
        ];
        const titles = new Map(
          Array.from(
            document.querySelectorAll("[data-layout-color-title-row]")
          ).map((input) => [
            Number(input.dataset.layoutColorTitleRow),
            input.value.trim()
          ])
        );
        const entries = Array.from(
          document.querySelectorAll("[data-layout-color-row]")
        )
          .map((input) => {
            const row = Number(input.dataset.layoutColorRow);
            const definition = definitions[row - 2];
            if (!definition) return null;
            const value = normalizeLayoutStyleValue(input.value);
            return {
              ...definition,
              row,
              title: titles.get(row) || definition.label,
              value,
              valid: validPreviewStyleValue(value, definition.property)
            };
          })
          .filter(Boolean)
          .sort((left, right) => left.row - right.row);

        definitions.forEach((definition) => {
          const entry = entries.find(
            (item) => item.property === definition.property
          );
          canvas.style.setProperty(
            definition.property,
            entry && entry.valid ? entry.value : definition.fallback
          );
        });

        palette.replaceChildren();
        entries.forEach((entry) => {
          const item = document.createElement("div");
          item.className = `bbcode-preview-color${
            entry.value && !entry.valid ? " is-invalid" : ""
          }`;
          const displayedValue = entry.valid ? entry.value : entry.fallback;
          if (entry.property === "--directory-shadow") {
            item.style.setProperty("--preview-swatch", "var(--surface-muted)");
            item.style.boxShadow = displayedValue;
            item.style.setProperty("--preview-chip-text", "var(--text)");
          } else {
            item.style.setProperty("--preview-swatch", displayedValue);
            item.style.setProperty(
              "--preview-chip-text",
              previewTextColor(displayedValue)
            );
          }
          item.textContent = entry.title;
          item.title = entry.valid
            ? `${entry.title}: ${entry.value}`
            : `${entry.title}: ${
                entry.value ? "valor inválido" : "usando o padrão"
              }`;
          palette.appendChild(item);
        });
      }

      function updateLayoutLivePreview() {
        updateLayoutBannerPreview();
        updateLayoutColorPreview();
      }

      function openLayoutEditor() {
        if (!requireEditAccess()) return;
        if (appState.settingsSaving || appState.loading || appState.requiresRefresh) return;
        const owner = getLayoutOwner();
        if (!owner) return;

        appState.editingLayoutOwnerRow = owner.row;
        const fields = document.getElementById("layout-editor-fields");
        fields.replaceChildren();

        const bannerGroup = createEditorFieldset(
          "Banner",
          "Imagem principal que será usada no topo da futura listagem em BBCode."
        );
        bannerGroup.grid.appendChild(
          createFormField("URL do banner", owner.banner, 0, {
            id: "layout-banner",
            type: "url",
            placeholder: "https://...",
            wide: true
          })
        );

        const colorGroup = createEditorFieldset(
          "Paleta de cores",
          "Defina os valores visuais na mesma ordem usada pela listagem."
        );
        appState.settings.forEach((item, index) => {
          colorGroup.grid.appendChild(
            createFormField(
              `Título da cor ${index + 1}`,
              item.colorTitle,
              index,
              {
                id: `layout-color-title-${item.row}`,
                placeholder: `Cor ${index + 1}`,
                dataset: { layoutColorTitleRow: String(item.row) }
              }
            )
          );
          colorGroup.grid.appendChild(
            createFormField(
              `Valor de ${String(item.colorTitle || "").trim() || `cor ${index + 1}`}`,
              item.color,
              index,
              {
              id: `layout-color-${item.row}`,
              placeholder:
                item.row === 18
                  ? "0 2px 5px rgba(20, 0, 0, .14)"
                  : "#821F88 ou rgba(...)",
              dataset: { layoutColorRow: String(item.row) }
              }
            )
          );
        });

        const linksGroup = createEditorFieldset(
          "Comunidades",
          "Links oficiais do Discord e WhatsApp usados na composição do BBCode."
        );
        Array.from({ length: 2 }, (_, index) => {
          linksGroup.grid.appendChild(
            createFormField(
              index === 0 ? "Discord" : "WhatsApp",
              (owner.links || [])[index] || "",
              index,
              {
                id: `layout-link-${index}`,
                type: "url",
                placeholder: "https://...",
                wide: true
              }
            )
          );
        });

        fields.append(
          bannerGroup.section,
          colorGroup.section,
          linksGroup.section
        );
        document
          .getElementById("layout-banner")
          .addEventListener("input", updateLayoutBannerPreview);
        fields
          .querySelectorAll(
            "[data-layout-color-row], [data-layout-color-title-row]"
          )
          .forEach((input) =>
            input.addEventListener("input", updateLayoutColorPreview)
          );
        updateLayoutLivePreview();
        const dialog = document.getElementById("layout-editor");
        dialog.oncancel = event => { if (appState.settingsSaving) event.preventDefault(); };
        dialog.showModal();
      }

      function closeLayoutEditor() {
        if (appState.settingsSaving) return;
        appState.editingLayoutOwnerRow = null;
        document.getElementById("layout-editor").close();
      }

      async function saveLayoutSettings(event) {
        event.preventDefault();
        if (!requireEditAccess() || appState.settingsSaving) return;
        const owner = appState.settings.find(
          (item) => item.row === appState.editingLayoutOwnerRow
        );
        if (!owner) return;

        const banner = document.getElementById("layout-banner").value.trim();
        const links = Array.from({ length: 2 }, (_, index) =>
          document.getElementById(`layout-link-${index}`).value.trim()
        );
        if ([banner, ...links].some(value => {
          if (!value) return false;
          try { return !["http:", "https:"].includes(new URL(value).protocol); } catch { return true; }
        })) { showToast("Use links HTTP ou HTTPS válidos para o banner e as comunidades.", "warning"); return; }
        const colors = new Map(
          Array.from(
            document.querySelectorAll("[data-layout-color-row]")
          ).map((input) => [
            Number(input.dataset.layoutColorRow),
            normalizeLayoutStyleValue(input.value)
          ])
        );
        const colorTitles = new Map(
          Array.from(
            document.querySelectorAll("[data-layout-color-title-row]")
          ).map((input) => [
            Number(input.dataset.layoutColorTitleRow),
            input.value.trim()
          ])
        );
        if ([...colors].some(([row, value]) => value && !validPreviewStyleValue(value, row === 18 ? "--directory-shadow" : "color"))) {
          showToast("Corrija os valores de cor ou sombra inválidos antes de salvar.", "warning"); return;
        }
        const updates = new Map();

        function mergeUpdate(row, fields) {
          updates.set(row, { ...(updates.get(row) || { row }), ...fields });
        }

        if (
          banner !== String(owner.banner || "").trim() ||
          links.some(
            (link, index) =>
              link !== String((owner.links || [])[index] || "").trim()
          )
        ) {
          mergeUpdate(owner.row, { banner, links });
        }

        appState.settings.forEach((item) => {
          const color = colors.get(item.row) || "";
          const colorTitle = colorTitles.get(item.row) || "";
          const colorChanged =
            color !== normalizeLayoutStyleValue(item.color);
          const titleChanged =
            colorTitle !== String(item.colorTitle || "").trim();
          if (colorChanged || titleChanged) {
            mergeUpdate(item.row, { color, colorTitle });
          }
        });

        if (!updates.size) {
          closeLayoutEditor();
          showToast("Nenhuma alteração nos recursos do BBCode.", "info");
          return;
        }

        appState.settingsSaving = true;
        const button = document.getElementById("save-layout");
        button.disabled = true;
        button.textContent = "Salvando…";
        updateMemberEditControls();

        try {
          const rows = Array.from(updates.values());
          const before = await requestNexusList("bootstrap", null, { forceRefresh: true });
          decodeBootstrap(before);
          for (const update of rows) {
            const old = appState.settings.find(item => Number(item.row) === Number(update.row));
            const live = before.settings.rows.find(item => Number(item.row) === Number(update.row));
            if (!live || Object.keys(update).filter(key => key !== "row").some(key => JSON.stringify(live[key] ?? (key === "links" ? [] : "")) !== JSON.stringify(old?.[key] ?? (key === "links" ? [] : "")))) {
              throw new Error("Os recursos foram alterados por outra pessoa. Atualize antes de salvar.");
            }
          }
          await requestNexusList("saveSettings", { rows, expectedRevision: before.meta?.revision ?? null });
          const confirmed = await requestNexusList("bootstrap", null, { forceRefresh: true });
          const decoded = decodeBootstrap(confirmed);
          for (const update of rows) {
            const saved = confirmed.settings.rows.find(item => Number(item.row) === Number(update.row));
            if (!saved || Object.keys(update).filter(key => key !== "row").some(key => JSON.stringify(saved[key] ?? (key === "links" ? [] : "")) !== JSON.stringify(update[key]))) throw new Error("A API não confirmou os recursos enviados. Atualize para conferir.");
          }
          acceptBootstrap(confirmed, decoded);

          rows.forEach((update) => {
            const item = appState.settings.find(
              (entry) => entry.row === update.row
            );
            if (!item) return;
            if (Object.prototype.hasOwnProperty.call(update, "banner")) {
              item.banner = update.banner;
            }
            if (Object.prototype.hasOwnProperty.call(update, "color")) {
              item.color = update.color;
            }
            if (Object.prototype.hasOwnProperty.call(update, "colorTitle")) {
              item.colorTitle = update.colorTitle;
            }
            if (Object.prototype.hasOwnProperty.call(update, "links")) {
              item.links = update.links.slice();
            }
          });

          appState.settingsSaving = false;
          closeLayoutEditor();
          renderSettings();
          updateDataTimestamp();
          showToast("Recursos do BBCode atualizados.", "success");
        } catch (error) {
          appState.requiresRefresh = true;
          showToast(error.message, "error");
        } finally {
          appState.settingsSaving = false;
          updateMemberEditControls();
          button.disabled = false;
          button.textContent = "Salvar recursos";
        }
      }

      function cleanCell(value) {
        return String(value || "").replace(/^"|"$/g, "").trim();
      }

      function forumUserdataValue(html, key) {
        const escapedKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const assignment = new RegExp(
          `_userdata\\[\\s*["']${escapedKey}["']\\s*\\]\\s*=\\s*` +
            `(?:"((?:\\\\.|[^"\\\\])*)"|'((?:\\\\.|[^'\\\\])*)'|(-?\\d+))\\s*;`,
          "i"
        ).exec(String(html || ""));

        if (!assignment) return "";
        const value = assignment[1] ?? assignment[2] ?? assignment[3] ?? "";
        return String(value).replace(/\\(["'\\])/g, "$1");
      }

      function forumSessionFromUserdata(userdata) {
        if (!userdata) return null;

        const username = cleanCell(userdata.username);
        const loggedIn = Number(userdata.session_logged_in) === 1;
        const userId = Number(userdata.user_id);
        const anonymous = ["anonymous", "anonimo", "anônimo"].includes(
          nicknameIdentity(username)
        );

        if (!loggedIn || !Number.isInteger(userId) || userId <= 0 || anonymous) {
          return null;
        }

        return { username, userId };
      }

      function forumSessionFromHtml(html) {
        return forumSessionFromUserdata({
          username: forumUserdataValue(html, "username"),
          session_logged_in: forumUserdataValue(html, "session_logged_in"),
          user_id: forumUserdataValue(html, "user_id")
        });
      }

      async function fetchForumUsername() {
        const runtimeSession = forumSessionFromUserdata(window._userdata);
        let response;

        try {
          const fetched = await fetchForumWithTimeout(new URL("/forum", CONFIG.forum.origin), { method: "GET", credentials: "include", redirect: "follow", cache: "no-store" });
          response = { ok: fetched.response.ok, text: async () => fetched.html };
        } catch {
          if (runtimeSession) return runtimeSession.username;
          throw new Error("Não foi possível consultar sua sessão no fórum.");
        }

        if (!response.ok) {
          if (runtimeSession) return runtimeSession.username;
          throw new Error("Não foi possível confirmar seu login no fórum.");
        }

        const forumSession = forumSessionFromHtml(await response.text());
        if (!forumSession) {
          const error = new Error(
            "Você precisa estar conectado ao fórum para continuar."
          );
          error.code = "AUTH_DENIED";
          throw error;
        }

        return forumSession.username;
      }

      function denyAccess(message) {
        const authScreen = document.getElementById("auth-screen");
        currentUser = null;
        if (authRevalidationTimer) {
          window.clearInterval(authRevalidationTimer);
          authRevalidationTimer = null;
        }
        authScreen.hidden = false;
        authScreen.classList.remove("is-hidden");
        authScreen.classList.add("is-denied");
        document.getElementById("auth-title").textContent = "Acesso negado";
        document.getElementById("auth-message").textContent = message;
        authScreen.setAttribute("role", "alert");
        document.getElementById("topbar-user").classList.remove("is-visible");
        applyAccessMode();
      }

      function showAuthenticationUnavailable(message) {
        const authScreen = document.getElementById("auth-screen");
        authScreen.hidden = false;
        authScreen.classList.remove("is-hidden", "is-denied");
        authScreen.setAttribute("role", "status");
        document.getElementById("auth-title").textContent =
          "Verificação temporariamente indisponível";
        document.getElementById("auth-message").textContent =
          `${message} Tentaremos novamente automaticamente.`;
      }

      function allowAccess(user, options = {}) {
        currentUser = Object.freeze({ ...user });

        const authScreen = document.getElementById("auth-screen");
        const userBlock = document.getElementById("topbar-user");
        const avatar = document.getElementById("user-avatar");

        document.getElementById("user-display-name").textContent = user.nick;
        document.getElementById("user-display-role").textContent =
          options.pendingValidation
            ? `${user.role} · verificando acesso`
            : options.validationUnavailable
            ? `${user.role} · acesso mantido`
            : canCurrentUserEdit(user)
            ? user.role
            : `${user.role} · somente leitura`;
        avatar.src =
          `https://www.habbo.com.br/habbo-imaging/avatarimage?user=${encodeURIComponent(user.nick)}` +
          "&direction=2&head_direction=3&gesture=sml&size=m&headonly=1";
        avatar.alt = `Avatar de ${user.nick}`;
        userBlock.classList.add("is-visible");
        authScreen.classList.add("is-hidden");
        applyAccessMode();

        window.setTimeout(() => {
          authScreen.hidden = true;
        }, 250);
      }

      function userFromAccess(access, username) {
        return {
          nick: access.nick || username,
          role: canonicalRoleName(access.role) || "Acesso autorizado",
          roles: Array.isArray(access.roles)
            ? access.roles.map(canonicalRoleName)
            : [],
          canEdit:
            typeof access.canEdit === "boolean"
              ? access.canEdit
              : undefined,
          canManageAccess:
            typeof access.canManageAccess === "boolean"
              ? access.canManageAccess
              : undefined
        };
      }

      async function validateForumAccess() {
        const username = await fetchForumUsername();
        const response = await requestNexusList("access", { username });
        const access = response.access || {};

        if (typeof access.allowed !== "boolean") {
          throw new Error(
            "A API não retornou uma confirmação válida de acesso."
          );
        }

        if (access.allowed === false) {
          const error = new Error(
            access.message ||
              "Seu usuário não possui permissão para acessar a NexusList."
          );
          error.code = "AUTH_DENIED";
          throw error;
        }

        return userFromAccess(access, username);
      }

      let authenticationInFlight = null;

      function scheduleAuthenticationRevalidation() {
        if (authRevalidationTimer) {
          window.clearInterval(authRevalidationTimer);
        }
        authRevalidationTimer = window.setInterval(() => {
          revalidateAuthentication().catch(() => {});
        }, CONFIG.auth.revalidateIntervalMs);
      }

      async function revalidateAuthentication(options = {}) {
        if (authenticationInFlight) return authenticationInFlight;
        authenticationInFlight = (async () => {
          try {
            const user = await validateForumAccess();
            const changedUser = currentUser && nicknameIdentity(currentUser.nick) !== nicknameIdentity(user.nick);
            if (changedUser) {
              appState.editingMembers = false; appState.removingMembers = false; appState.addingMember = false;
              appState.memberDrafts.clear(); appState.selectedMemberRows.clear();
              appState.loaded = false; appState.requiresRefresh = true;
            }
            allowAccess(user); scheduleAuthenticationRevalidation();
            if (options.reloadData || !appState.loaded || changedUser) await loadNexusList({ quiet: true, forceSource: true });
            if (options.honorInitialHash && window.location.hash === "#configuracoes" && canCurrentUserEdit(user)) navigateToView("settings", { force: true });
            if (options.announce) showToast("", "success", "Bem-vindo, " + user.nick);
            return user;
          } catch (error) {
            if (error?.code === "AUTH_DENIED") { denyAccess(error.message); throw error; }
            if (currentUser) {
              allowAccess(currentUser, { validationUnavailable: true });
              scheduleAuthenticationRevalidation(); return currentUser;
            }
            showAuthenticationUnavailable(error?.message || "Não foi possível consultar o serviço de acesso.");
            scheduleAuthenticationRevalidation(); return null;
          }
        })();
        try { return await authenticationInFlight; } finally { authenticationInFlight = null; }
      }

      async function initializeAuthentication() {
        const authScreen = document.getElementById("auth-screen");
        authScreen.hidden = false;
        authScreen.classList.remove("is-hidden", "is-denied");
        authScreen.setAttribute("role", "status");
        document.getElementById("auth-title").textContent = "Verificando acesso";
        document.getElementById("auth-message").textContent =
          "Aguarde enquanto validamos seu login e sua permissão na NexusList.";

        revalidateAuthentication({
          reloadData: true,
          honorInitialHash: true,
          announce: true
        }).catch(() => {});
      }

      function showToast(message, type = "info", title = "") {
        const styles = {
          success: {
            title: "Sucesso",
            icon: '<i class="ti ti-circle-check" aria-hidden="true"></i>'
          },
          error: {
            title: "Erro",
            icon: '<i class="ti ti-circle-x" aria-hidden="true"></i>'
          },
          warning: {
            title: "Atenção",
            icon: '<i class="ti ti-alert-triangle" aria-hidden="true"></i>'
          },
          info: {
            title: "Informação",
            icon: '<i class="ti ti-info-circle" aria-hidden="true"></i>'
          }
        };

        const style = styles[type] || styles.info;
        const duration = type === "error" ? 7200 : 5600;
        const toast = document.createElement("div");
        toast.className = "toast is-expanded";
        toast.dataset.type = styles[type] ? type : "info";
        toast.setAttribute("role", type === "error" ? "alert" : "status");
        toast.style.setProperty(
          "--toast-duration",
          `${duration - 300}ms`
        );

        const toastIcon = document.createElement("span");
        toastIcon.className = "toast__icon";
        toastIcon.innerHTML = style.icon;

        const toastContent = document.createElement("span");
        toastContent.className = "toast__content";
        const toastTitle = document.createElement("strong");
        toastTitle.className = "toast__title";
        toastTitle.textContent = title || style.title;
        toastContent.appendChild(toastTitle);

        if (message) {
          const toastMessage = document.createElement("span");
          toastMessage.className = "toast__message";
          toastMessage.textContent = message;
          toastContent.appendChild(toastMessage);
        }

        const closeButton = document.createElement("button");
        closeButton.className = "toast__close";
        closeButton.type = "button";
        closeButton.setAttribute("aria-label", "Fechar notificação");
        closeButton.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
        closeButton.tabIndex = -1;

        const progress = document.createElement("span");
        progress.className = "toast__progress";
        progress.setAttribute("aria-hidden", "true");

        toast.append(toastIcon, toastContent, closeButton, progress);
        const container = document.getElementById("toast-container");
        while (container.children.length >= 4) {
          container.firstElementChild.remove();
        }
        container.appendChild(toast);

        let dismissTimer;
        const dismiss = () => {
          if (toast.classList.contains("is-leaving")) {
            return;
          }
          window.clearTimeout(dismissTimer);
          toast.classList.add("is-leaving");
          closeButton.tabIndex = -1;
          window.setTimeout(() => toast.remove(), 260);
        };

        closeButton.addEventListener("click", dismiss);

        requestAnimationFrame(() => {
          toast.classList.add("is-visible");
          closeButton.tabIndex = 0;
        });

        dismissTimer = window.setTimeout(dismiss, duration);
      }

      function setSidebarOpen(isOpen) {
        const sidebar = document.getElementById("app-sidebar");
        const menuButton = document.getElementById("mobile-menu-button");
        sidebar.classList.toggle("is-open", isOpen);
        menuButton.setAttribute("aria-expanded", String(isOpen));
        menuButton.setAttribute(
          "aria-label",
          isOpen ? "Fechar menu principal" : "Abrir menu principal"
        );
      }

      function navigateToView(viewName, options = {}) {
        if (!["members", "settings"].includes(viewName)) return;
        if (viewName === "settings" && !canCurrentUserEdit()) {
          showToast(
            "As configurações são exclusivas de usuários com acesso total.",
            "warning"
          );
          return;
        }

        if (
          !options.force &&
          viewName !== "members" &&
          (appState.editingMembers ||
            appState.removingMembers ||
            appState.addingMember)
        ) {
          showToast(
            "Conclua ou cancele a ação atual antes de trocar de página.",
            "warning"
          );
          return;
        }

        appState.currentView = viewName;
        document.querySelectorAll(".app-view").forEach((view) => {
          view.hidden = view.dataset.view !== viewName;
        });

        document.querySelectorAll("[data-view-target]").forEach((button) => {
          const isActive = button.dataset.viewTarget === viewName;
          button.classList.toggle("is-active", isActive);
          if (isActive) {
            button.setAttribute("aria-current", "page");
          } else {
            button.removeAttribute("aria-current");
          }
        });

        const isSettings = viewName === "settings";
        document.getElementById("topbar-page-title").textContent = isSettings
          ? "Configurações da NexusList"
          : "Controle de membros";
        document.title = isSettings
          ? "Configurações · NexusList"
          : "NexusList";

        const page = document.querySelector(".page");
        page.scrollTop = 0;
        setSidebarOpen(false);
      }

      window.NexusList = Object.freeze({
        config: CONFIG,
        worker: Object.freeze({
          buildUrl: buildWorkerUrl,
          fetch: fetchViaWorker
        }),
        auth: Object.freeze({
          getCurrentUser: () => currentUser,
          refresh: initializeAuthentication
        }),
        sheets: Object.freeze({
          request: requestNexusList,
          fetchViaWorker
        })
      });

      document
        .getElementById("refresh-members")
        .addEventListener("click", () =>
          loadNexusList({ forceSource: true })
        );

      document
        .getElementById("mark-license-returns")
        .addEventListener("click", markLicenseReturnsAsRl);

      document
        .getElementById("refresh-settings")
        .addEventListener("click", () =>
          loadNexusList({ forceSource: true })
        );

      document
        .getElementById("additional-access-type")
        .addEventListener("change", updateAdditionalAccessField);

      document
        .getElementById("additional-access-form")
        .addEventListener("submit", saveAdditionalAccess);

      document
        .getElementById("open-requirements")
        .addEventListener("click", openStampDialog);

      document
        .getElementById("close-requirements")
        .addEventListener("click", closeRequirementsDialog);

      document
        .getElementById("dismiss-requirements")
        .addEventListener("click", closeRequirementsDialog);

      document
        .getElementById("post-requirements-stamp")
        .addEventListener("click", postRequirementsStamp);

      requirementTagInputs().forEach((input) => {
        input.addEventListener("input", handleRequirementTagInput);
        input.addEventListener("paste", handleRequirementTagPaste);
        input.addEventListener("keydown", handleRequirementTagKeydown);
      });

      document
        .getElementById("requirements-dialog")
        .addEventListener("click", (event) => {
          if (event.target === event.currentTarget) closeRequirementsDialog();
        });

      document
        .getElementById("requirements-dialog")
        .addEventListener("cancel", (event) => {
          if (appState.requirementsBusy) {
            event.preventDefault();
          }
        });

      document
        .getElementById("member-search")
        .addEventListener("input", (event) => {
          appState.search = event.target.value;
          renderMembers();
        });

      document
        .getElementById("edit-members")
        .addEventListener("click", beginMemberEditing);

      document
        .getElementById("organize-members")
        .addEventListener("click", organizeMemberList);

      document
        .getElementById("save-members-edit")
        .addEventListener("click", saveMemberList);

      document
        .getElementById("cancel-members-edit")
        .addEventListener("click", cancelMemberEditing);

      document
        .getElementById("add-member")
        .addEventListener("click", openAddMemberEditor);

      document
        .getElementById("add-member-form")
        .addEventListener("submit", saveNewMember);

      document
        .getElementById("close-add-member")
        .addEventListener("click", closeAddMemberEditor);

      document
        .getElementById("cancel-add-member")
        .addEventListener("click", closeAddMemberEditor);

      document
        .getElementById("add-member-editor")
        .addEventListener("click", (event) => {
          if (event.target === event.currentTarget) closeAddMemberEditor();
        });

      document
        .getElementById("add-member-editor")
        .addEventListener("cancel", (event) => {
          if (appState.savingMembers) {
            event.preventDefault();
            return;
          }
          appState.addingMember = false;
          updateMemberEditControls();
        });

      document
        .getElementById("add-member-editor")
        .addEventListener("close", () => {
          appState.addingMember = false;
          updateMemberEditControls();
        });

      document
        .getElementById("remove-members")
        .addEventListener("click", beginMemberRemoval);

      document
        .getElementById("confirm-members-remove")
        .addEventListener("click", confirmMemberRemoval);

      document
        .getElementById("cancel-members-remove")
        .addEventListener("click", cancelMemberRemoval);

      document
        .getElementById("settings-editor-form")
        .addEventListener("submit", saveRoleSettings);

      document
        .getElementById("close-settings-editor")
        .addEventListener("click", closeSettingsEditor);

      document
        .getElementById("cancel-settings-editor")
        .addEventListener("click", closeSettingsEditor);

      document
        .getElementById("settings-editor")
        .addEventListener("click", (event) => {
          if (event.target === event.currentTarget) closeSettingsEditor();
        });

      document
        .getElementById("edit-layout")
        .addEventListener("click", openLayoutEditor);

      document
        .getElementById("layout-editor-form")
        .addEventListener("submit", saveLayoutSettings);

      document
        .getElementById("close-layout-editor")
        .addEventListener("click", closeLayoutEditor);

      document
        .getElementById("cancel-layout-editor")
        .addEventListener("click", closeLayoutEditor);

      document
        .getElementById("layout-editor")
        .addEventListener("click", (event) => {
          if (event.target === event.currentTarget) closeLayoutEditor();
        });

      document
        .getElementById("mobile-menu-button")
        .addEventListener("click", () => {
          const sidebar = document.getElementById("app-sidebar");
          setSidebarOpen(!sidebar.classList.contains("is-open"));
        });

      document
        .getElementById("sidebar-overlay")
        .addEventListener("click", () => setSidebarOpen(false));

      document.querySelectorAll("[data-view-target]").forEach((navItem) => {
        navItem.addEventListener("click", () => {
          navItem.classList.remove("is-pulsing");
          void navItem.offsetWidth;
          navItem.classList.add("is-pulsing");
          window.setTimeout(
            () => navItem.classList.remove("is-pulsing"),
            440
          );
          navigateToView(navItem.dataset.viewTarget);
        });
      });

      document
        .getElementById("sidebar-logo")
        .addEventListener("click", (event) => {
          event.preventDefault();
          navigateToView("members");
        });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          setSidebarOpen(false);
          setVisionPanelOpen(false);
        }
      });

      window.addEventListener("resize", () => {
        if (window.innerWidth >= 768) setSidebarOpen(false);
      });

      initializeTheme();
      initializeVisionTools();
      updateAdditionalAccessField();
      navigateToView("members", { force: true });
      initializeAuthentication();
    })();
