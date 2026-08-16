import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { Platform } from "../../../platform/index.js";
import { I18n } from "../../../i18n/index.js";
import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";
import { NuvioDialog } from "../../components/nuvioDialog.js";
import { renderLoadingIndicator } from "../../components/loadingIndicator.js";
import {
  bindRootSidebarEvents,
  renderRootSidebar
} from "../../components/sidebarNavigation.js";
import { BuiltinUsaChannels } from "../../../features/iptv/builtinUsaChannels.js";
import { IptvRepository } from "../../../features/iptv/iptvRepository.js";

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

function sourceLabel(source) {
  if (BuiltinUsaChannels.isBuiltin(source)) return source.name;
  return `${source.name} (${source.kind})`;
}

export const LiveScreen = {
  container: null,
  unsubscribe: null,
  addDialog: null,
  addKind: "M3U",
  boundClick: null,
  boundInput: null,

  async mount() {
    this.container = document.getElementById("live");
    ScreenUtils.show(this.container);
    this.boundClick = (event) => this.onClick(event);
    this.boundInput = (event) => this.onInput(event);
    this.container.addEventListener("click", this.boundClick);
    this.container.addEventListener("input", this.boundInput);
    this.unsubscribe = IptvRepository.subscribe(() => this.render());
    await IptvRepository.ensureLoaded();
    this.render();
  },

  render() {
    if (!this.container) return;
    const state = IptvRepository.getState();
    const layout = LayoutPreferences.get?.() || {};
    const channels = IptvRepository.filteredChannels(state);
    const sidebar = renderRootSidebar({
      selectedRoute: "live",
      layout
    });
    const active = document.activeElement;
    const restoreSearch =
      active?.getAttribute?.("data-action") === "search" && this.container.contains(active);
    const selectionStart = restoreSearch ? active.selectionStart : null;
    const selectionEnd = restoreSearch ? active.selectionEnd : null;

    this.container.innerHTML = `
      <div class="home-shell library-shell live-shell">
        ${sidebar}
        <main class="library-main live-main">
          <header class="live-header">
            <div>
              <h1 class="settings-title">${escapeHtml(t("live_title", {}, "Live"))}</h1>
              <p class="settings-subtitle">${escapeHtml(
                t(
                  "live_subtitle",
                  {},
                  "USA Public channels are built in. Add M3U, Stalker, or Xtream sources anytime."
                )
              )}</p>
            </div>
            <div class="live-header-actions">
              <button class="library-action-button focusable" data-action="refresh" data-row="0" data-col="0">
                ${escapeHtml(t("live_refresh", {}, "Refresh"))}
              </button>
              <button class="library-action-button library-primary focusable" data-action="add" data-row="0" data-col="1">
                ${escapeHtml(t("live_add_source", {}, "Add source"))}
              </button>
            </div>
          </header>

          <section class="live-source-row" aria-label="Sources">
            ${state.sources
              .map((source, index) => {
                const selected = source.id === state.selectedSourceId;
                const builtin = BuiltinUsaChannels.isBuiltin(source);
                return `
                  <div class="live-source-chip${selected ? " selected" : ""}">
                    <button class="live-source-button focusable${selected ? " selected" : ""}"
                            data-action="select-source"
                            data-source-id="${escapeHtml(source.id)}"
                            data-row="1"
                            data-col="${index}">
                      ${escapeHtml(sourceLabel(source))}
                    </button>
                    ${
                      builtin
                        ? ""
                        : `<button class="live-source-remove focusable"
                                  data-action="remove-source"
                                  data-source-id="${escapeHtml(source.id)}"
                                  data-row="1"
                                  data-col="${index}"
                                  aria-label="${escapeHtml(t("live_remove_source", {}, "Remove source"))}">×</button>`
                    }
                  </div>
                `;
              })
              .join("")}
          </section>

          <section class="live-toolbar">
            <label class="library-cloud-search-shell live-search-shell">
              <span class="material-icons" aria-hidden="true">search</span>
              <input class="library-cloud-search-input focusable"
                     type="search"
                     data-action="search"
                     data-row="2"
                     data-col="0"
                     placeholder="${escapeHtml(t("live_search_channels", {}, "Search channels"))}"
                     value="${escapeHtml(state.query)}" />
            </label>
            <div class="live-group-row">
              <button class="live-group-chip focusable${!state.selectedGroupTitle ? " selected" : ""}"
                      data-action="select-group"
                      data-group=""
                      data-row="3"
                      data-col="0">
                ${escapeHtml(t("live_groups_all", {}, "All groups"))}
              </button>
              ${state.groups
                .map(
                  (group, index) => `
                    <button class="live-group-chip focusable${
                      state.selectedGroupTitle === group.title ? " selected" : ""
                    }"
                            data-action="select-group"
                            data-group="${escapeHtml(group.title)}"
                            data-row="3"
                            data-col="${index + 1}">
                      ${escapeHtml(group.title)} (${group.channels.length})
                    </button>
                  `
                )
                .join("")}
            </div>
          </section>

          ${
            state.errorMessage
              ? `<div class="live-error">${escapeHtml(state.errorMessage)}</div>`
              : ""
          }

          ${
            state.isLoading
              ? `<section class="library-empty-state">${renderLoadingIndicator({
                  size: "medium"
                })}<p class="library-empty-subtitle">${escapeHtml(
                  t("live_loading", {}, "Loading channels")
                )}</p></section>`
              : channels.length === 0
                ? `<section class="library-empty-state"><h3 class="library-empty-title">${escapeHtml(
                    t("live_no_channels", {}, "No channels match this filter.")
                  )}</h3></section>`
                : `<section class="live-channel-list">
                    <div class="live-channel-count">${escapeHtml(
                      t("live_channel_count", { count: channels.length }, `${channels.length} channels`)
                    )}</div>
                    <div class="live-channel-grid">
                      ${channels
                        .map(
                          (channel, index) => `
                            <button class="live-channel-card focusable"
                                    data-action="play-channel"
                                    data-channel-id="${escapeHtml(channel.id)}"
                                    data-row="${4 + Math.floor(index / 3)}"
                                    data-col="${index % 3}">
                              ${
                                channel.logoUrl
                                  ? `<img class="live-channel-logo" src="${escapeHtml(
                                      channel.logoUrl
                                    )}" alt="" loading="lazy" />`
                                  : `<div class="live-channel-logo live-channel-logo-fallback">${escapeHtml(
                                      channel.name.slice(0, 1).toUpperCase()
                                    )}</div>`
                              }
                              <div class="live-channel-copy">
                                <div class="live-channel-name">${escapeHtml(channel.name)}</div>
                                <div class="live-channel-meta">${escapeHtml(
                                  channel.groupTitle || IptvRepository.UNGROUPED
                                )}</div>
                              </div>
                            </button>
                          `
                        )
                        .join("")}
                    </div>
                  </section>`
          }
        </main>
      </div>
    `;

    bindRootSidebarEvents(this.container, {
      currentRoute: "live"
    });
    ScreenUtils.indexFocusables(this.container);
    if (restoreSearch) {
      const input = this.container.querySelector('[data-action="search"]');
      if (input) {
        input.focus();
        if (selectionStart != null && selectionEnd != null) {
          try {
            input.setSelectionRange(selectionStart, selectionEnd);
          } catch (_) {}
        }
      }
    }
  },

  async onClick(event) {
    const target = event.target?.closest?.("[data-action]");
    if (!target) return;
    const action = target.getAttribute("data-action");
    if (action === "select-source") {
      await IptvRepository.selectSource(target.getAttribute("data-source-id"));
      return;
    }
    if (action === "remove-source") {
      await IptvRepository.removeSource(target.getAttribute("data-source-id"));
      return;
    }
    if (action === "select-group") {
      const group = target.getAttribute("data-group") || "";
      IptvRepository.selectGroup(group || null);
      return;
    }
    if (action === "refresh") {
      await IptvRepository.refreshSelectedSource();
      return;
    }
    if (action === "add") {
      this.openAddDialog();
      return;
    }
    if (action === "play-channel") {
      const channelId = target.getAttribute("data-channel-id");
      const channel = IptvRepository.getState().channels.find((item) => item.id === channelId);
      if (!channel) return;
      try {
        const streamUrl = await IptvRepository.resolvePlaybackUrl(channel);
        Router.navigate("player", {
          streamUrl,
          playerTitle: channel.name,
          itemId: channel.id,
          itemType: "movie"
        });
      } catch (error) {
        IptvRepository._update({
          errorMessage: error?.message || "Unable to play this channel."
        });
      }
    }
  },

  onInput(event) {
    const target = event.target;
    if (target?.getAttribute?.("data-action") === "search") {
      IptvRepository.setQuery(target.value || "");
    }
  },

  openAddDialog() {
    this.addKind = "M3U";
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
    `;

    const syncKind = () => {
      content.querySelectorAll("[data-kind]").forEach((button) => {
        button.classList.toggle("selected", button.getAttribute("data-kind") === this.addKind);
      });
      content.querySelectorAll("[data-fields]").forEach((block) => {
        block.hidden = block.getAttribute("data-fields") !== this.addKind;
      });
    };

    content.addEventListener("click", (event) => {
      const kindButton = event.target?.closest?.("[data-kind]");
      if (!kindButton) return;
      this.addKind = kindButton.getAttribute("data-kind");
      syncKind();
    });

    this.addDialog = new NuvioDialog({
      title: t("live_add_source", {}, "Add source"),
      widthVw: 48,
      content,
      onDismiss: () => {
        this.addDialog = null;
      },
      buttons: [
        {
          label: t("common.cancel", {}, "Cancel"),
          key: "cancel",
          onAction: () => {
            this.addDialog?.destroy();
            this.addDialog = null;
          }
        },
        {
          label: t("common.add", {}, "Add"),
          key: "add",
          onAction: async () => {
            const value = (field) => content.querySelector(`[data-field="${field}"]`)?.value || "";
            let ok = false;
            if (this.addKind === "M3U") {
              ok = await IptvRepository.addM3uSource(value("name"), value("url"));
            } else if (this.addKind === "Stalker") {
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
            if (ok) {
              this.addDialog?.destroy();
              this.addDialog = null;
            } else {
              this.render();
            }
          }
        }
      ]
    });
    this.addDialog.mount(document.body);
    syncKind();
  },

  async onKeyDown(event) {
    if (Platform.isBackEvent(event)) {
      event?.preventDefault?.();
      if (this.addDialog) {
        this.addDialog.destroy();
        this.addDialog = null;
        return;
      }
      await Router.navigate("home");
    }
  },

  consumeBackRequest() {
    if (this.addDialog) {
      this.addDialog.destroy();
      this.addDialog = null;
      return true;
    }
    return false;
  },

  cleanup() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.boundClick) {
      this.container?.removeEventListener("click", this.boundClick);
      this.boundClick = null;
    }
    if (this.boundInput) {
      this.container?.removeEventListener("input", this.boundInput);
      this.boundInput = null;
    }
    if (this.addDialog) {
      this.addDialog.destroy();
      this.addDialog = null;
    }
    ScreenUtils.hide(this.container);
  }
};
