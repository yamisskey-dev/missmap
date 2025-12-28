<script lang="ts">
	import type { ServerInfo } from '$lib/collector';
	import { getRepositoryDisplayName, getRepositoryColor } from '$lib/collector';

	interface FederationInfo {
		sourceHost: string;
		targetHost: string;
		usersCount: number;
		notesCount: number;
	}

	let {
		servers = [],
		federations = [],
		viewpointServers = [],
		selectedRepositoryUrls = $bindable([])
	}: {
		servers: ServerInfo[];
		federations: FederationInfo[];
		viewpointServers: string[];
		selectedRepositoryUrls: string[];
	} = $props();

	// サーバーホストをキーにしたマップ
	let serverMap = $derived(() => {
		const map = new Map<string, ServerInfo>();
		for (const server of servers) {
			map.set(server.host, server);
		}
		return map;
	});

	// 視点サーバーから連合しているサーバーのソフトウェア一覧（重複なし）
	let federatedSoftware = $derived(() => {
		// 視点サーバーからの連合のみを対象
		const viewpointFeds = federations.filter(f => viewpointServers.includes(f.sourceHost));

		// 連合先のホストを収集
		const federatedHosts = new Set<string>();
		for (const fed of viewpointFeds) {
			if (!viewpointServers.includes(fed.targetHost)) {
				federatedHosts.add(fed.targetHost);
			}
		}

		// ソフトウェア（repositoryUrl）を収集
		const softwareSet = new Set<string>();
		for (const host of federatedHosts) {
			const server = serverMap().get(host);
			if (server?.repositoryUrl) {
				softwareSet.add(server.repositoryUrl);
			}
		}

		// 表示用に変換（順序は不定 = 序列化しない）
		return Array.from(softwareSet).map(url => ({
			repositoryUrl: url,
			displayName: getRepositoryDisplayName(url),
			color: getRepositoryColor(url)
		}));
	});

	// ソフトウェアのトグル
	function toggleSoftware(repositoryUrl: string) {
		if (selectedRepositoryUrls.includes(repositoryUrl)) {
			selectedRepositoryUrls = selectedRepositoryUrls.filter(u => u !== repositoryUrl);
		} else {
			selectedRepositoryUrls = [...selectedRepositoryUrls, repositoryUrl];
		}
	}

	// 選択数
	let selectedCount = $derived(selectedRepositoryUrls.length);
</script>

{#if federatedSoftware().length > 0}
<div class="federated-software-panel">
	<div class="panel-header">
		<svg class="panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M12 2L2 7l10 5 10-5-10-5z" />
			<path d="M2 17l10 5 10-5" />
			<path d="M2 12l10 5 10-5" />
		</svg>
		<h4>連合ソフトウェア</h4>
		{#if selectedCount > 0}
			<span class="selected-badge">{selectedCount}</span>
		{/if}
	</div>

	<div class="software-chips">
		{#each federatedSoftware() as { repositoryUrl, displayName, color } (repositoryUrl)}
			<button
				class="software-chip"
				class:selected={selectedRepositoryUrls.includes(repositoryUrl)}
				style="--chip-color: {color}"
				onclick={() => toggleSoftware(repositoryUrl)}
				title={repositoryUrl}
			>
				<span class="chip-dot" style="background: {color}"></span>
				<span class="chip-name">{displayName.split('/')[1] || displayName}</span>
			</button>
		{/each}
	</div>
</div>
{/if}

<style>
	.federated-software-panel {
		padding: 0.5rem 0.75rem;
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-bottom: 0.375rem;
	}

	.panel-icon {
		width: 16px;
		height: 16px;
		color: var(--accent-500);
	}

	h4 {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.selected-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		margin-left: 0.25rem;
		background: var(--accent-600);
		border-radius: 9px;
		font-size: 0.65rem;
		font-weight: 700;
		color: white;
	}

	.software-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.software-chip {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		background: rgba(0, 0, 0, 0.1);
		border: 1px solid transparent;
		border-radius: 12px;
		font-size: 0.65rem;
		color: var(--fg-secondary);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.software-chip:hover {
		background: color-mix(in srgb, var(--chip-color) 15%, transparent);
		border-color: var(--chip-color);
		color: var(--fg-primary);
	}

	.software-chip.selected {
		background: color-mix(in srgb, var(--chip-color) 20%, transparent);
		border-color: var(--chip-color);
		color: var(--fg-primary);
	}

	.chip-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.chip-name {
		font-weight: 500;
		max-width: 80px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
