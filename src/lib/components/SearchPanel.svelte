<script lang="ts">
	import type { ServerInfo } from '$lib/collector';

	let {
		servers = [],
		onFocusServer,
		isMobile = false,
		defaultOpen = true
	}: {
		servers: ServerInfo[];
		onFocusServer: (host: string) => void;
		isMobile?: boolean;
		defaultOpen?: boolean;
	} = $props();

	let isExpanded = $state(defaultOpen);
	let searchQuery = $state('');
	let isOpen = $state(false);
	let selectedIndex = $state(-1);
	let inputElement: HTMLInputElement | undefined = $state();

	// 検索結果（最大10件）
	let searchResults = $derived(() => {
		if (!searchQuery.trim()) return [];
		const query = searchQuery.toLowerCase().trim();
		return servers
			.filter(server => server.host.toLowerCase().includes(query))
			.slice(0, 10);
	});

	function handleInput() {
		isOpen = searchQuery.trim().length > 0;
		selectedIndex = -1;
	}

	function handleSelect(host: string) {
		onFocusServer(host);
		searchQuery = '';
		isOpen = false;
		selectedIndex = -1;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!isOpen || searchResults().length === 0) {
			if (e.key === 'Escape') {
				searchQuery = '';
				isOpen = false;
			}
			return;
		}

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, searchResults().length - 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, -1);
				break;
			case 'Enter':
				e.preventDefault();
				if (selectedIndex >= 0 && selectedIndex < searchResults().length) {
					handleSelect(searchResults()[selectedIndex].host);
				} else if (searchResults().length > 0) {
					handleSelect(searchResults()[0].host);
				}
				break;
			case 'Escape':
				e.preventDefault();
				searchQuery = '';
				isOpen = false;
				selectedIndex = -1;
				break;
		}
	}

	function handleBlur() {
		// 少し遅延させてクリックイベントを先に処理
		setTimeout(() => {
			isOpen = false;
			selectedIndex = -1;
		}, 150);
	}
</script>

<div class="search-panel">
	<button class="panel-header-toggle" onclick={() => isExpanded = !isExpanded}>
		<svg class="panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<circle cx="11" cy="11" r="8" />
			<line x1="21" y1="21" x2="16.65" y2="16.65" />
		</svg>
		<h4>検索</h4>
		<svg class="toggle-icon" class:expanded={isExpanded} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<polyline points="6 9 12 15 18 9" />
		</svg>
	</button>

	{#if isExpanded}
	<div class="search-wrapper">
		<input
			bind:this={inputElement}
			type="text"
			bind:value={searchQuery}
			oninput={handleInput}
			onkeydown={handleKeydown}
			onblur={handleBlur}
			onfocus={() => { if (searchQuery.trim()) isOpen = true; }}
			placeholder="サーバーを検索..."
		/>
		{#if searchQuery}
			<button class="clear-btn" onclick={() => { searchQuery = ''; isOpen = false; }} title="クリア">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		{/if}
	</div>

	{#if isOpen && searchResults().length > 0}
		<ul class="search-results">
			{#each searchResults() as result, i (result.host)}
				<li>
					<button
						class="result-item"
						class:selected={i === selectedIndex}
						onclick={() => handleSelect(result.host)}
					>
						<span class="result-host">{result.host}</span>
						{#if result.usersCount != null}
							<span class="result-users">{result.usersCount.toLocaleString()} users</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{:else if isOpen && searchQuery.trim() && searchResults().length === 0}
		<div class="no-results">
			<span>見つかりませんでした</span>
		</div>
	{/if}
	{/if}
</div>

<style>
	.search-panel {
		padding: 0.625rem 0.75rem;
		position: relative;
		z-index: 10;
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

	.search-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	input {
		width: 100%;
		padding: 0.625rem 2.25rem 0.625rem 0.875rem;
		background: var(--glass-bg-subtle);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		color: var(--fg-primary);
		transition: all var(--transition-fast);
		box-shadow: var(--shadow-inset);
	}

	input::placeholder {
		color: var(--fg-muted);
	}

	input:focus {
		outline: none;
		border-color: var(--accent-500);
		box-shadow: 0 0 0 3px rgba(134, 179, 0, 0.12), var(--shadow-inset);
		background: var(--bg-card);
	}

	.clear-btn {
		position: absolute;
		right: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 50%;
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--transition-bounce);
	}

	.clear-btn svg {
		width: 12px;
		height: 12px;
	}

	.clear-btn:hover {
		background: rgba(255, 100, 100, 0.12);
		color: #fca5a5;
		transform: scale(1.1);
	}

	.search-results {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		margin: 0.5rem 0 0;
		padding: 0.375rem;
		list-style: none;
		background: var(--glass-bg-strong);
		backdrop-filter: blur(var(--glass-blur-lg));
		-webkit-backdrop-filter: blur(var(--glass-blur-lg));
		border: 1px solid var(--border-color);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-xl), inset 0 1px 0 var(--glass-border);
		z-index: 1000;
		max-height: 220px;
		overflow-y: auto;
		animation: fadeInScale 0.2s var(--ease-out-back);
	}

	.result-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.625rem 0.75rem;
		background: transparent;
		border: none;
		border-radius: var(--radius-md);
		font-size: 0.75rem;
		color: var(--fg-secondary);
		text-align: left;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.result-item:hover,
	.result-item.selected {
		background: rgba(134, 179, 0, 0.12);
		color: var(--fg-primary);
	}

	.result-item.selected {
		box-shadow: inset 0 0 0 1px rgba(134, 179, 0, 0.3);
	}

	.result-host {
		font-weight: 600;
	}

	.result-users {
		font-size: 0.65rem;
		color: var(--fg-muted);
		background: var(--glass-bg-subtle);
		padding: 0.125rem 0.375rem;
		border-radius: var(--radius-full);
	}

	.no-results {
		margin-top: 0.5rem;
		padding: 0.75rem;
		text-align: center;
		font-size: 0.75rem;
		color: var(--fg-muted);
		background: var(--glass-bg-subtle);
		border-radius: var(--radius-md);
	}
</style>
