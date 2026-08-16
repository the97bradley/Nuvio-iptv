import { NuvioDialog } from "../../ui/components/nuvioDialog.js";
import { I18n } from "../../i18n/index.js";
import { IptvRepository } from "./iptvRepository.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

/**
 * Multi-kind IPTV source dialog (M3U / Stalker / Xtream).
 * Returns a Promise<string|null> — new source id when added, otherwise null.
 */
export function openIptvAddSourceDialog({ onAdded = null } = {}) {
  return new Promise((resolve) => {
    let kind = "M3U";
    let settled = false;
    const content = document.createElement("div");
    content.className = "live-add-form";
    content.innerHTML = `
      <div class="live-add-kinds">
        <button type="button" class="live-group-chip selected" data-kind="M3U">M3U</button>
        <button type="button" class="live-group-chip" data-kind="Stalker">Stalker</button>
        <button type="button" class="live-group-chip" data-kind="Xtream">Xtream</button>
      </div>
      <label class="live-field">
        <span>${escapeHtml(t("live_name_label", {}, "Name"))}</span>
        <input class="live-input" data-field="name" type="text" />
      </label>
      <div data-fields="M3U">
        <label class="live-field">
          <span>${escapeHtml(t("live_m3u_url_label", {}, "M3U URL"))}</span>
          <input class="live-input" data-field="url" type="url" placeholder="https://…" />
        </label>
        <label class="live-field">
          <span>${escapeHtml(t("live_epg_url_label", {}, "EPG URL (optional XMLTV)"))}</span>
          <input class="live-input" data-field="epgUrl" type="url" placeholder="https://…/guide.xml" />
        </label>
      </div>
      <div data-fields="Stalker" hidden>
        <label class="live-field">
          <span>${escapeHtml(t("live_portal_url_label", {}, "Portal URL"))}</span>
          <input class="live-input" data-field="portalUrl" type="url" placeholder="http://…" />
        </label>
        <label class="live-field">
          <span>${escapeHtml(t("live_mac_label", {}, "MAC address"))}</span>
          <input class="live-input" data-field="mac" type="text" placeholder="00:1A:79:…" />
        </label>
      </div>
      <div data-fields="Xtream" hidden>
        <label class="live-field">
          <span>${escapeHtml(t("live_server_url_label", {}, "Server URL"))}</span>
          <input class="live-input" data-field="serverUrl" type="url" placeholder="http://…" />
        </label>
        <label class="live-field">
          <span>${escapeHtml(t("live_username_label", {}, "Username"))}</span>
          <input class="live-input" data-field="username" type="text" />
        </label>
        <label class="live-field">
          <span>${escapeHtml(t("live_password_label", {}, "Password"))}</span>
          <input class="live-input" data-field="password" type="password" />
        </label>
      </div>
      <p class="live-add-error" data-role="error" hidden></p>
    `;

    const syncKind = () => {
      content.querySelectorAll("[data-kind]").forEach((button) => {
        button.classList.toggle("selected", button.getAttribute("data-kind") === kind);
      });
      content.querySelectorAll("[data-fields]").forEach((block) => {
        block.hidden = block.getAttribute("data-fields") !== kind;
      });
    };

    content.addEventListener("click", (event) => {
      const kindButton = event.target?.closest?.("[data-kind]");
      if (!kindButton) return;
      kind = kindButton.getAttribute("data-kind");
      syncKind();
    });

    const finish = (sourceId) => {
      if (settled) return;
      settled = true;
      resolve(sourceId || null);
    };

    const dialog = new NuvioDialog({
      title: t("live_add_source", {}, "Add playlist"),
      widthVw: 48,
      content,
      onDismiss: () => finish(null),
      buttons: [
        {
          label: t("common.cancel", {}, "Cancel"),
          key: "cancel",
          onAction: () => {
            dialog.destroy();
            finish(null);
          }
        },
        {
          label: t("common.add", {}, "Add"),
          key: "add",
          onAction: async () => {
            const value = (field) => content.querySelector(`[data-field="${field}"]`)?.value || "";
            const errorEl = content.querySelector('[data-role="error"]');
            let ok = null;
            if (kind === "M3U") {
              ok = await IptvRepository.addM3uSource(value("name"), value("url"), value("epgUrl"));
            } else if (kind === "Stalker") {
              ok = await IptvRepository.addStalkerSource(
                value("name"),
                value("portalUrl"),
                value("mac")
              );
            } else {
              ok = await IptvRepository.addXtreamSource(
                value("name"),
                value("serverUrl"),
                value("username"),
                value("password")
              );
            }
            if (!ok) {
              const message = IptvRepository.getState().errorMessage || "Could not add playlist.";
              if (errorEl) {
                errorEl.hidden = false;
                errorEl.textContent = message;
              }
              return;
            }
            dialog.destroy();
            try {
              await onAdded?.(ok);
            } catch (_) {}
            finish(ok);
          }
        }
      ]
    });
    dialog.mount(document.body);
    syncKind();
  });
}
