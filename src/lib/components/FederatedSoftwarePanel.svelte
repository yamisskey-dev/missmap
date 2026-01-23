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
		selectedRepositoryUrls = $bindable([]),
		isMobile = false,
		defaultOpen = true
	}: {
		servers: ServerInfo[];
		federations: FederationInfo[];
		viewpointServers: string[];
		selectedRepositoryUrls: string[];
		isMobile?: boolean;
		defaultOpen?: boolean;
	} = $props();

	let isExpanded = $state(defaultOpen);

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
	<button class="panel-header-toggle" onclick={() => isExpanded = !isExpanded}>
		<svg class="panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M12 2L2 7l10 5 10-5-10-5z" />
			<path d="M2 17l10 5 10-5" />
			<path d="M2 12l10 5 10-5" />
		</svg>
		<h4>連合ソフトウェア</h4>
		{#if selectedCount > 0}
			<span class="selected-badge">{selectedCount}</span>
		{/if}
		<svg class="toggle-icon" class:expanded={isExpanded} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<polyline points="6 9 12 15 18 9" />
		</svg>
	</button>

	{#if isExpanded}
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
	{/if}
</div>
{/if}

<style>
	.federated-software-panel {
		padding: 0.625rem 0.75rem;
	}

	.panel-header-toggle {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		width: 100%;
		padding: 0.25rem 0;
		margin-bottom: 0.5rem;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		border-radius: var(--radius-sm);
		transition: background var(--transition-fast);
	}

	.panel-header-toggle:hover {
		background: rgba(134, 179, 0, 0.05);
	}

	.panel-header-toggle h4 {
		flex: 1;
		margin: 0;
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--fg-primary);
	}

	.toggle-icon {
		width: 16px;
		height: 16px;
		color: var(--fg-muted);
		transition: transform var(--transition-bounce);
	}

	.toggle-icon.expanded {
		transform: rotate(180deg);
	}

	.panel-icon {
		width: 18px;
		height: 18px;
		color: var(--accent-500);
		filter: drop-shadow(0 0 4px rgba(134, 179, 0, 0.3));
	}

	h4 {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	.selected-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		margin-left: 0.375rem;
		background: linear-gradient(135deg, var(--accent-600), var(--accent-500));
		border-radius: var(--radius-full);
		font-size: 0.65rem;
		font-weight: 700;
		color: white;
		box-shadow: 0 0 8px rgba(134, 179, 0, 0.3);
		animation: badge-pop 0.3s var(--ease-out-back);
	}

	@keyframes badge-pop {
		0% { transform: scale(0); opacity: 0; }
		100% { transform: scale(1); opacity: 1; }
	}

	.software-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.software-chip {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		background: var(--glass-bg-subtle);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-full);
		font-size: 0.65rem;
		color: var(--fg-secondary);
		cursor: pointer;
		transition: all var(--transition-bounce);
		box-shadow: var(--shadow-xs);
	}

	.software-chip:hover {
		background: color-mix(in srgb, var(--chip-color) 18%, transparent);
		border-color: var(--chip-color);
		color: var(--fg-primary);
		transform: translateY(-1px);
		box-shadow: var(--shadow-sm), 0 0 12px color-mix(in srgb, var(--chip-color) 25%, transparent);
	}

	.software-chip.selected {
		background: color-mix(in srgb, var(--chip-color) 22%, transparent);
		border-color: var(--chip-color);
		color: var(--fg-primary);
		box-shadow: var(--shadow-sm), 0 0 16px color-mix(in srgb, var(--chip-color) 30%, transparent);
	}

	.chip-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
		box-shadow: 0 0 6px currentColor;
	}

	.chip-name {
		font-weight: 600;
		max-width: 90px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
