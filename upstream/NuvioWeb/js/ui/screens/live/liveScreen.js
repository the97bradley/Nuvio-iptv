import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { Platform } from "../../../platform/index.js";
import { I18n } from "../../../i18n/index.js";
import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";
import { renderLoadingIndicator } from "../../components/loadingIndicator.js";
import {
  bindRootSidebarEvents,
  renderRootSidebar
} from "../../components/sidebarNavigation.js";
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

export const LiveScreen = {
  container: null,
  unsubscribe: null,
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
    const sidebar = renderRootSidebar({ selectedRoute: "live", layout });
    const active = document.activeElement;
    const restoreSearch =
      active?.getAttribute?.("data-action") === "search" && this.container.contains(active);
    const selectionStart = restoreSearch ? active.selectionStart : null;
    const selectionEnd = restoreSearch ? active.selectionEnd : null;
    const hasSources = state.sources.length > 0;

    this.container.innerHTML = `
      <div class="home-shell live-shell">
        ${sidebar}
        <main class="live-main">
          <header class="live-header">
            <div class="live-header-copy">
              <h1 class="live-title">${escapeHtml(t("live_title", {}, "Live"))}</h1>
              <p class="live-subtitle">${escapeHtml(
                t(
                  "live_subtitle",
                  {},
                  "Watch channels from playlists you add in Settings → IPTV."
                )
              )}</p>
            </div>
            <div class="live-header-actions">
              ${
                hasSources
                  ? `<button class="live-btn focusable" data-action="refresh" data-row="0" data-col="0">
                       ${escapeHtml(t("live_refresh", {}, "Refresh"))}
                     </button>`
                  : ""
              }
              <button class="live-btn live-btn-primary focusable" data-action="open-settings" data-row="0" data-col="1">
                ${escapeHtml(t("live_manage_playlists", {}, "Manage playlists"))}
              </button>
            </div>
          </header>

          ${
            !hasSources
              ? `<section class="live-empty">
                   <h2>${escapeHtml(t("live_empty_title", {}, "No playlists yet"))}</h2>
                   <p>${escapeHtml(
                     t(
                       "live_empty_body",
                       {},
                       "Add an M3U URL, Stalker portal, or Xtream Codes login in Settings → IPTV."
                     )
                   )}</p>
                   <button class="live-btn live-btn-primary focusable" data-action="open-settings" data-row="1" data-col="0">
                     ${escapeHtml(t("live_open_iptv_settings", {}, "Open IPTV settings"))}
                   </button>
                 </section>`
              : `
                <section class="live-controls">
                  <div class="live-source-tabs" role="tablist">
                    ${state.sources
                      .map((source, index) => {
                        const selected = source.id === state.selectedSourceId;
                        return `
                          <button class="live-tab focusable${selected ? " selected" : ""}"
                                  role="tab"
                                  aria-selected="${selected ? "true" : "false"}"
                                  data-action="select-source"
                                  data-source-id="${escapeHtml(source.id)}"
                                  data-row="1"
                                  data-col="${index}">
                            <span class="live-tab-name">${escapeHtml(source.name)}</span>
                            <span class="live-tab-kind">${escapeHtml(source.kind)}</span>
                          </button>
                        `;
                      })
                      .join("")}
                  </div>

                  <div class="live-filter-row">
                    <label class="live-search">
                      <span class="material-icons" aria-hidden="true">search</span>
                      <input class="live-search-input focusable"
                             type="search"
                             data-action="search"
                             data-row="2"
                             data-col="0"
                             placeholder="${escapeHtml(t("live_search_channels", {}, "Search channels"))}"
                             value="${escapeHtml(state.query)}" />
                    </label>
                    <div class="live-groups">
                      <button class="live-chip focusable${!state.selectedGroupTitle ? " selected" : ""}"
                              data-action="select-group"
                              data-group=""
                              data-row="3"
                              data-col="0">
                        ${escapeHtml(t("live_groups_all", {}, "All"))}
                      </button>
                      ${state.groups
                        .map(
                          (group, index) => `
                            <button class="live-chip focusable${
                              state.selectedGroupTitle === group.title ? " selected" : ""
                            }"
                                    data-action="select-group"
                                    data-group="${escapeHtml(group.title)}"
                                    data-row="3"
                                    data-col="${index + 1}">
                              ${escapeHtml(group.title)}
                              <span class="live-chip-count">${group.channels.length}</span>
                            </button>
                          `
                        )
                        .join("")}
                    </div>
                  </div>
                </section>

                ${
                  state.errorMessage
                    ? `<div class="live-error">${escapeHtml(state.errorMessage)}</div>`
                    : ""
                }

                ${
                  state.isLoading
                    ? `<section class="live-empty live-empty-soft">
                         ${renderLoadingIndicator({ size: "medium" })}
                         <p>${escapeHtml(t("live_loading", {}, "Loading channels"))}</p>
                       </section>`
                    : channels.length === 0
                      ? `<section class="live-empty live-empty-soft">
                           <p>${escapeHtml(t("live_no_channels", {}, "No channels match this filter."))}</p>
                         </section>`
                      : `<section class="live-list-wrap">
                           <div class="live-list-meta">${escapeHtml(
                             t(
                               "live_channel_count",
                               { count: channels.length },
                               `${channels.length} channels`
                             )
                           )}</div>
                           <div class="live-list" role="list">
                             ${channels
                               .map(
                                 (channel, index) => `
                                   <button class="live-row focusable"
                                           role="listitem"
                                           data-action="play-channel"
                                           data-channel-id="${escapeHtml(channel.id)}"
                                           data-row="${4 + index}"
                                           data-col="0">
                                     ${
                                       channel.logoUrl
                                         ? `<img class="live-row-logo" src="${escapeHtml(
                                             channel.logoUrl
                                           )}" alt="" loading="lazy" />`
                                         : `<div class="live-row-logo live-row-logo-fallback">${escapeHtml(
                                             channel.name.slice(0, 1).toUpperCase()
                                           )}</div>`
                                     }
                                     <span class="live-row-copy">
                                       <span class="live-row-name">${escapeHtml(channel.name)}</span>
                                       <span class="live-row-group">${escapeHtml(
                                         channel.groupTitle || IptvRepository.UNGROUPED
                                       )}</span>
                                     </span>
                                     <span class="material-icons live-row-play" aria-hidden="true">play_arrow</span>
                                   </button>
                                 `
                               )
                               .join("")}
                           </div>
                         </section>`
                }
              `
          }
        </main>
      </div>
    `;

    bindRootSidebarEvents(this.container, { currentRoute: "live" });
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
    if (action === "open-settings") {
      await Router.navigate("settings", { section: "iptv" });
      return;
    }
    if (action === "select-source") {
      await IptvRepository.selectSource(target.getAttribute("data-source-id"));
      return;
    }
    if (action === "select-group") {
      IptvRepository.selectGroup(target.getAttribute("data-group") || null);
      return;
    }
    if (action === "refresh") {
      await IptvRepository.refreshSelectedSource();
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

  async onKeyDown(event) {
    if (Platform.isBackEvent(event)) {
      event?.preventDefault?.();
      await Router.navigate("home");
    }
  },

  consumeBackRequest() {
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
    ScreenUtils.hide(this.container);
  }
};
