<script lang="ts">
	import type { ServerInfo } from '$lib/collector';

	let {
		totalServers = 0,
		filteredServers = 0,
		federationCount = 0,
		viewpointCount = 0,
		hasActiveFilter = false
	}: {
		totalServers: number;
		filteredServers: number;
		federationCount: number;
		viewpointCount: number;
		hasActiveFilter: boolean;
	} = $props();

	// フィルター適用状態のテキスト
	let filterStatus = $derived(() => {
		if (!hasActiveFilter) return null;
		const diff = totalServers - filteredServers;
		return `${diff}件を非表示`;
	});
</script>

<aside class="stats-panel">
	<div class="stats-grid">
		<div class="stat-item primary">
			<span class="stat-value">{filteredServers}</span>
			<span class="stat-label">
				{#if hasActiveFilter}
					/ {totalServers} 件
				{:else}
					サーバー
				{/if}
			</span>
		</div>
		<div class="stat-item">
			<span class="stat-value">{federationCount.toLocaleString()}</span>
			<span class="stat-label">連合接続</span>
		</div>
		<div class="stat-item">
			<span class="stat-value">{viewpointCount}</span>
			<span class="stat-label">視点</span>
		</div>
	</div>
	{#if hasActiveFilter && filterStatus()}
		<div class="filter-status">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
			</svg>
			<span>{filterStatus()}</span>
		</div>
	{/if}
</aside>

<style>
	.stats-panel {
		padding: 0.5rem 0.75rem;
	}

	.stats-grid {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.stat-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.125rem;
		flex: 1;
	}

	.stat-item.primary {
		flex: 1.2;
	}

	.stat-value {
		font-size: 1rem;
		font-weight: 700;
		color: var(--fg-primary);
		line-height: 1.2;
	}

	.stat-item.primary .stat-value {
		font-size: 1.25rem;
		color: var(--accent-400);
	}

	.stat-label {
		font-size: 0.6rem;
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.filter-status {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		margin-top: 0.5rem;
		padding: 0.25rem 0.5rem;
		background: rgba(134, 179, 0, 0.1);
		border-radius: var(--radius-sm);
		font-size: 0.65rem;
		color: var(--accent-400);
	}

	.filter-status svg {
		width: 10px;
		height: 10px;
	}
</style>
