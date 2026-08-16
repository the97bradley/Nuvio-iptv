package com.nuvio.app.features.iptv

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.LiveTv
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.core.ui.NuvioLoadingIndicator
import com.nuvio.app.core.ui.NuvioScreen
import com.nuvio.app.core.ui.NuvioScreenHeader
import com.nuvio.app.core.ui.NuvioSurfaceCard
import com.nuvio.app.core.ui.NuvioTokens
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.compose_nav_live
import nuvio.composeapp.generated.resources.iptv_add_m3u_action
import nuvio.composeapp.generated.resources.iptv_add_playlist
import nuvio.composeapp.generated.resources.iptv_add_playlist_action
import nuvio.composeapp.generated.resources.iptv_add_stalker_action
import nuvio.composeapp.generated.resources.iptv_add_xtream_action
import nuvio.composeapp.generated.resources.iptv_cancel
import nuvio.composeapp.generated.resources.iptv_channel_count
import nuvio.composeapp.generated.resources.iptv_empty_body
import nuvio.composeapp.generated.resources.iptv_empty_title
import nuvio.composeapp.generated.resources.iptv_groups_all
import nuvio.composeapp.generated.resources.iptv_kind_m3u
import nuvio.composeapp.generated.resources.iptv_kind_stalker
import nuvio.composeapp.generated.resources.iptv_kind_xtream
import nuvio.composeapp.generated.resources.iptv_mac_label
import nuvio.composeapp.generated.resources.iptv_no_channels
import nuvio.composeapp.generated.resources.iptv_no_stars_body
import nuvio.composeapp.generated.resources.iptv_no_stars_title
import nuvio.composeapp.generated.resources.iptv_password_label
import nuvio.composeapp.generated.resources.iptv_playlist_name_label
import nuvio.composeapp.generated.resources.iptv_playlist_url_label
import nuvio.composeapp.generated.resources.iptv_portal_url_label
import nuvio.composeapp.generated.resources.iptv_remove_playlist
import nuvio.composeapp.generated.resources.iptv_search_channels
import nuvio.composeapp.generated.resources.iptv_server_url_label
import nuvio.composeapp.generated.resources.iptv_star_channels
import nuvio.composeapp.generated.resources.iptv_star_channels_done
import nuvio.composeapp.generated.resources.iptv_starred_count
import nuvio.composeapp.generated.resources.iptv_username_label
import org.jetbrains.compose.resources.stringResource

@Composable
fun LiveTvScreen(
    modifier: Modifier = Modifier,
    scrollToTopRequests: Flow<Unit> = emptyFlow(),
    onPlayChannel: (IptvChannel) -> Unit,
) {
    val state by IptvRepository.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    var showAddDialog by rememberSaveable { mutableStateOf(false) }
    var showStarDialog by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        IptvRepository.ensureLoaded()
    }

    LaunchedEffect(scrollToTopRequests) {
        scrollToTopRequests.collect {
            listState.animateScrollToItem(0)
        }
    }

    if (showAddDialog) {
        AddSourceDialog(
            onDismiss = { showAddDialog = false },
            onConfirmM3u = { name, url ->
                scope.launch {
                    val ok = IptvRepository.addM3uSource(name, url)
                    if (ok) {
                        showAddDialog = false
                        showStarDialog = true
                    }
                }
            },
            onConfirmStalker = { name, portalUrl, mac ->
                scope.launch {
                    val ok = IptvRepository.addStalkerSource(name, portalUrl, mac)
                    if (ok) {
                        showAddDialog = false
                        showStarDialog = true
                    }
                }
            },
            onConfirmXtream = { name, server, user, pass ->
                scope.launch {
                    val ok = IptvRepository.addXtreamSource(name, server, user, pass)
                    if (ok) {
                        showAddDialog = false
                        showStarDialog = true
                    }
                }
            },
        )
    }

    if (showStarDialog) {
        val sourceId = state.selectedSourceId
        if (sourceId != null) {
            StarChannelsDialog(
                sourceId = sourceId,
                onDismiss = { showStarDialog = false },
            )
        }
    }

    LaunchedEffect(showStarDialog, state.selectedSourceId) {
        if (showStarDialog && state.selectedSourceId == null) {
            showStarDialog = false
        }
    }

    NuvioScreen(
        modifier = modifier.fillMaxSize(),
        listState = listState,
    ) {
        item {
            NuvioScreenHeader(
                title = stringResource(Res.string.compose_nav_live),
                includeStatusBarPadding = false,
                actions = {
                    IconButton(
                        onClick = {
                            scope.launch { IptvRepository.refreshSelectedSource() }
                        },
                        enabled = state.selectedSourceId != null && !state.isLoading,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Refresh,
                            contentDescription = null,
                        )
                    }
                    IconButton(
                        onClick = { showStarDialog = true },
                        enabled = state.selectedSourceId != null,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Star,
                            contentDescription = stringResource(Res.string.iptv_star_channels),
                        )
                    }
                    IconButton(onClick = { showAddDialog = true }) {
                        Icon(
                            imageVector = Icons.Rounded.Add,
                            contentDescription = stringResource(Res.string.iptv_add_playlist),
                        )
                    }
                },
            )
        }

        if (state.sources.isNotEmpty()) {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s8),
                ) {
                    state.sources.forEach { source ->
                        FilterChip(
                            selected = source.id == state.selectedSourceId,
                            onClick = {
                                scope.launch { IptvRepository.selectSource(source.id) }
                            },
                            label = {
                                Text(
                                    text = "${source.name} (${source.kind.name})",
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            },
                            trailingIcon = {
                                Icon(
                                    imageVector = Icons.Rounded.Delete,
                                    contentDescription = stringResource(Res.string.iptv_remove_playlist),
                                    modifier = Modifier
                                        .size(16.dp)
                                        .clickable {
                                            scope.launch { IptvRepository.removeSource(source.id) }
                                        },
                                )
                            },
                        )
                    }
                }
            }
        }

        item {
            OutlinedTextField(
                value = state.query,
                onValueChange = IptvRepository::setQuery,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                leadingIcon = {
                    Icon(Icons.Rounded.Search, contentDescription = null)
                },
                placeholder = { Text(stringResource(Res.string.iptv_search_channels)) },
                enabled = state.channels.isNotEmpty() || state.isLoading,
            )
        }

        if (state.groups.isNotEmpty()) {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s8),
                ) {
                    FilterChip(
                        selected = state.selectedGroupTitle == null,
                        onClick = { IptvRepository.selectGroup(null) },
                        label = { Text(stringResource(Res.string.iptv_groups_all)) },
                    )
                    state.groups.forEach { group ->
                        FilterChip(
                            selected = state.selectedGroupTitle == group.title,
                            onClick = { IptvRepository.selectGroup(group.title) },
                            label = {
                                Text(
                                    text = "${group.title} (${group.channels.size})",
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            },
                        )
                    }
                }
            }
        }

        when {
            state.isLoading && state.channels.isEmpty() -> {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = NuvioTokens.Space.s24),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        NuvioLoadingIndicator()
                    }
                }
            }

            state.sources.isEmpty() -> {
                item {
                    NuvioSurfaceCard {
                        Icon(
                            imageVector = Icons.Rounded.LiveTv,
                            contentDescription = null,
                            modifier = Modifier.size(36.dp),
                        )
                        Spacer(modifier.height(NuvioTokens.Space.s12))
                        Text(
                            text = stringResource(Res.string.iptv_empty_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(modifier.height(NuvioTokens.Space.s8))
                        Text(
                            text = stringResource(Res.string.iptv_empty_body),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(modifier.height(NuvioTokens.Space.s16))
                        TextButton(onClick = { showAddDialog = true }) {
                            Text(stringResource(Res.string.iptv_add_playlist_action))
                        }
                    }
                }
            }

            state.errorMessage != null && state.filteredChannels.isEmpty() -> {
                item {
                    NuvioSurfaceCard {
                        Text(
                            text = state.errorMessage.orEmpty(),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }

            state.filteredChannels.isEmpty() -> {
                val hasFilter =
                    state.query.isNotBlank() || state.selectedGroupTitle != null
                val starredCount = state.starredCount(state.selectedSourceId)
                item {
                    NuvioSurfaceCard {
                        if (!hasFilter && starredCount == 0) {
                            Text(
                                text = stringResource(Res.string.iptv_no_stars_title),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(modifier.height(NuvioTokens.Space.s8))
                            Text(
                                text = stringResource(Res.string.iptv_no_stars_body),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(modifier.height(NuvioTokens.Space.s16))
                            TextButton(onClick = { showStarDialog = true }) {
                                Text(stringResource(Res.string.iptv_star_channels))
                            }
                        } else {
                            Text(
                                text = stringResource(Res.string.iptv_no_channels),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }
            }

            else -> {
                item {
                    Text(
                        text = stringResource(
                            Res.string.iptv_channel_count,
                            state.filteredChannels.size,
                        ),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                items(
                    items = state.filteredChannels,
                    key = { it.id },
                ) { channel ->
                    ChannelRow(
                        channel = channel,
                        onClick = { onPlayChannel(channel) },
                    )
                }
            }
        }
    }
}

@Composable
private fun StarChannelsDialog(
    sourceId: String,
    onDismiss: () -> Unit,
) {
    val state by IptvRepository.state.collectAsStateWithLifecycle()
    var query by rememberSaveable { mutableStateOf("") }
    var starredOnly by rememberSaveable { mutableStateOf(false) }
    val channels = remember(state.channels, state.starredChannelIds, sourceId, query, starredOnly) {
        IptvRepository.catalogChannels(sourceId, query = query, starredOnly = starredOnly)
    }
    val starredCount = state.starredCount(sourceId)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text(stringResource(Res.string.iptv_star_channels))
                Text(
                    text = stringResource(Res.string.iptv_starred_count, starredCount),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 420.dp),
                verticalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s8),
            ) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    leadingIcon = {
                        Icon(Icons.Rounded.Search, contentDescription = null)
                    },
                    placeholder = { Text(stringResource(Res.string.iptv_search_channels)) },
                )
                Row(horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s8)) {
                    FilterChip(
                        selected = !starredOnly,
                        onClick = { starredOnly = false },
                        label = { Text(stringResource(Res.string.iptv_groups_all)) },
                    )
                    FilterChip(
                        selected = starredOnly,
                        onClick = { starredOnly = true },
                        label = { Text(stringResource(Res.string.iptv_starred_count, starredCount)) },
                    )
                }
                LazyColumn(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s4),
                ) {
                    items(channels, key = { it.id }) { channel ->
                        val starred = state.isStarred(channel)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { IptvRepository.toggleStar(channel) }
                                .padding(vertical = NuvioTokens.Space.s8),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s12),
                        ) {
                            Icon(
                                imageVector = if (starred) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                                contentDescription = null,
                                tint = if (starred) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = channel.name,
                                    style = MaterialTheme.typography.bodyMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                channel.groupTitle?.takeIf { it.isNotBlank() }?.let { group ->
                                    Text(
                                        text = group,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(Res.string.iptv_star_channels_done))
            }
        },
    )
}

@Composable
private fun ChannelRow(
    channel: IptvChannel,
    onClick: () -> Unit,
) {
    NuvioSurfaceCard(
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s12),
        ) {
            Icon(
                imageVector = Icons.Rounded.LiveTv,
                contentDescription = null,
                modifier = Modifier.size(28.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = channel.name,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                channel.groupTitle?.takeIf { it.isNotBlank() }?.let { group ->
                    Text(
                        text = group,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Icon(
                imageVector = Icons.Rounded.PlayArrow,
                contentDescription = null,
            )
        }
    }
}

@Composable
private fun AddSourceDialog(
    onDismiss: () -> Unit,
    onConfirmM3u: (name: String, url: String) -> Unit,
    onConfirmStalker: (name: String, portalUrl: String, mac: String) -> Unit,
    onConfirmXtream: (name: String, serverUrl: String, username: String, password: String) -> Unit,
) {
    var kind by rememberSaveable { mutableStateOf(IptvSourceKind.M3U.name) }
    var name by rememberSaveable { mutableStateOf("") }
    var url by rememberSaveable { mutableStateOf("") }
    var mac by rememberSaveable { mutableStateOf("") }
    var username by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    val selectedKind = runCatching { IptvSourceKind.valueOf(kind) }.getOrDefault(IptvSourceKind.M3U)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(Res.string.iptv_add_playlist)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s12)) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s8),
                ) {
                    FilterChip(
                        selected = selectedKind == IptvSourceKind.M3U,
                        onClick = { kind = IptvSourceKind.M3U.name },
                        label = { Text(stringResource(Res.string.iptv_kind_m3u)) },
                    )
                    FilterChip(
                        selected = selectedKind == IptvSourceKind.Stalker,
                        onClick = { kind = IptvSourceKind.Stalker.name },
                        label = { Text(stringResource(Res.string.iptv_kind_stalker)) },
                    )
                    FilterChip(
                        selected = selectedKind == IptvSourceKind.Xtream,
                        onClick = { kind = IptvSourceKind.Xtream.name },
                        label = { Text(stringResource(Res.string.iptv_kind_xtream)) },
                    )
                }
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text(stringResource(Res.string.iptv_playlist_name_label)) },
                )
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = {
                        Text(
                            when (selectedKind) {
                                IptvSourceKind.Stalker -> stringResource(Res.string.iptv_portal_url_label)
                                IptvSourceKind.Xtream -> stringResource(Res.string.iptv_server_url_label)
                                IptvSourceKind.M3U -> stringResource(Res.string.iptv_playlist_url_label)
                            },
                        )
                    },
                )
                when (selectedKind) {
                    IptvSourceKind.Stalker -> {
                        OutlinedTextField(
                            value = mac,
                            onValueChange = { mac = it },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            label = { Text(stringResource(Res.string.iptv_mac_label)) },
                            placeholder = { Text("00:1A:79:12:34:56") },
                        )
                    }
                    IptvSourceKind.Xtream -> {
                        OutlinedTextField(
                            value = username,
                            onValueChange = { username = it },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            label = { Text(stringResource(Res.string.iptv_username_label)) },
                        )
                        OutlinedTextField(
                            value = password,
                            onValueChange = { password = it },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            label = { Text(stringResource(Res.string.iptv_password_label)) },
                        )
                    }
                    IptvSourceKind.M3U -> Unit
                }
            }
        },
        confirmButton = {
            val enabled = when (selectedKind) {
                IptvSourceKind.M3U -> url.isNotBlank()
                IptvSourceKind.Stalker -> url.isNotBlank() && mac.isNotBlank()
                IptvSourceKind.Xtream -> url.isNotBlank() && username.isNotBlank() && password.isNotBlank()
            }
            TextButton(
                onClick = {
                    when (selectedKind) {
                        IptvSourceKind.M3U -> onConfirmM3u(name, url)
                        IptvSourceKind.Stalker -> onConfirmStalker(name, url, mac)
                        IptvSourceKind.Xtream -> onConfirmXtream(name, url, username, password)
                    }
                },
                enabled = enabled,
            ) {
                Text(
                    when (selectedKind) {
                        IptvSourceKind.M3U -> stringResource(Res.string.iptv_add_m3u_action)
                        IptvSourceKind.Stalker -> stringResource(Res.string.iptv_add_stalker_action)
                        IptvSourceKind.Xtream -> stringResource(Res.string.iptv_add_xtream_action)
                    },
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(Res.string.iptv_cancel))
            }
        },
    )
}
