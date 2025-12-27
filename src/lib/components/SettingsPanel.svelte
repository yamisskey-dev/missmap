<script lang="ts">
	import { DEFAULT_SETTINGS, type UserSettings, type ViewMode } from '$lib/types';

	let { settings = $bindable(DEFAULT_SETTINGS), onAddViewpoint, ssrViewpoints = [] }: {
		settings: UserSettings;
		onAddViewpoint: (host: string) => void;
		ssrViewpoints: string[];
	} = $props();

	let inputValue = $state('');
	let isAdding = $state(false);

	function handleAdd() {
		const host = inputValue.trim().toLowerCase();
		if (host && !settings.viewpointServers.includes(host)) {
			settings.viewpointServers = [...settings.viewpointServers, host];
			settings.seedServer = host;
			onAddViewpoint(host);
		}
		inputValue = '';
		isAdding = false;
	}

	function handleRemove(host: string) {
		settings.viewpointServers = settings.viewpointServers.filter(h => h !== host);
		if (settings.seedServer === host) {
			settings.seedServer = settings.viewpointServers[0] ?? 'misskey.io';
		}
	}

	function handleFocus(host: string) {
		settings.seedServer = host;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleAdd();
		} else if (e.key === 'Escape') {
			inputValue = '';
			isAdding = false;
		}
	}

	function toggleViewMode() {
		settings.viewMode = settings.viewMode === 'merged' ? 'single' : 'merged';
	}

	// SSRで取得済みかどうかを判定
	function isFromSSR(host: string): boolean {
		return ssrViewpoints.includes(host);
	}
</script>

<div class="settings-panel">
	<div class="panel-header">
		<svg class="panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<circle cx="12" cy="12" r="3" />
			<path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
		</svg>
		<h4>視点サーバー</h4>
	</div>

	<!-- 表示モード切替 -->
	<div class="view-mode-toggle">
		<button
			class="mode-btn"
			class:active={settings.viewMode === 'merged'}
			onclick={() => settings.viewMode = 'merged'}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="3" />
				<circle cx="5" cy="6" r="2" />
				<circle cx="19" cy="6" r="2" />
				<circle cx="5" cy="18" r="2" />
				<circle cx="19" cy="18" r="2" />
			</svg>
			マージ
		</button>
		<button
			class="mode-btn"
			class:active={settings.viewMode === 'single'}
			onclick={() => settings.viewMode = 'single'}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="4" />
				<line x1="12" y1="2" x2="12" y2="6" />
				<line x1="12" y1="18" x2="12" y2="22" />
				<line x1="2" y1="12" x2="6" y2="12" />
				<line x1="18" y1="12" x2="22" y2="12" />
			</svg>
			単一
		</button>
	</div>

	<!-- 視点サーバーリスト -->
	<div class="viewpoint-list">
		{#each settings.viewpointServers as host (host)}
			<div class="viewpoint-item" class:focused={settings.seedServer === host} class:ssr={isFromSSR(host)}>
				<button class="viewpoint-btn" onclick={() => handleFocus(host)}>
					<svg class="server-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" />
						<line x1="2" y1="12" x2="22" y2="12" />
						<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
					</svg>
					<span class="host-name">{host}</span>
					{#if isFromSSR(host)}
						<span class="ssr-badge">SSR</span>
					{/if}
				</button>
				{#if settings.viewpointServers.length > 1}
					<button class="remove-btn" onclick={() => handleRemove(host)} title="削除">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				{/if}
			</div>
		{/each}
	</div>

	<!-- 追加UI -->
	{#if isAdding}
		<div class="input-group">
			<div class="input-wrapper">
				<svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="16" />
					<line x1="8" y1="12" x2="16" y2="12" />
				</svg>
				<input
					type="text"
					bind:value={inputValue}
					onkeydown={handleKeydown}
					placeholder="例: misskey.io"
				/>
			</div>
			<div class="button-group">
				<button class="apply-btn" onclick={handleAdd}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<polyline points="20 6 9 17 4 12" />
					</svg>
					追加
				</button>
				<button class="cancel-btn" onclick={() => { inputValue = ''; isAdding = false; }} title="キャンセル">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>
		</div>
	{:else}
		<button class="add-viewpoint-btn" onclick={() => isAdding = true}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="10" />
				<line x1="12" y1="8" x2="12" y2="16" />
				<line x1="8" y1="12" x2="16" y2="12" />
			</svg>
			視点を追加
		</button>
	{/if}
</div>

<style>
	.settings-panel {
		padding: 0.875rem;
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.375rem;
	}

	.panel-icon {
		width: 18px;
		height: 18px;
		color: var(--accent-500);
	}

	h4 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.description {
		margin: 0 0 0.625rem;
		font-size: 0.75rem;
		color: var(--fg-muted);
	}

	/* View Mode Toggle */
	.view-mode-toggle {
		display: flex;
		gap: 0.25rem;
		margin-bottom: 0.75rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: var(--radius-md);
		padding: 0.25rem;
	}

	.mode-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.5rem;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.mode-btn svg {
		width: 14px;
		height: 14px;
	}

	.mode-btn:hover {
		color: var(--fg-secondary);
		background: rgba(255, 255, 255, 0.05);
	}

	.mode-btn.active {
		background: var(--accent-600);
		color: white;
	}

	/* Viewpoint List */
	.viewpoint-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-bottom: 0.625rem;
		max-height: 200px;
		overflow-y: auto;
	}

	.viewpoint-item {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem;
		border-radius: var(--radius-md);
		transition: all var(--transition-fast);
	}

	.viewpoint-item.focused {
		background: rgba(134, 179, 0, 0.1);
	}

	.viewpoint-btn {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(0, 0, 0, 0.15);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all var(--transition-fast);
		text-align: left;
	}

	.viewpoint-item.focused .viewpoint-btn {
		border-color: rgba(134, 179, 0, 0.3);
		background: rgba(134, 179, 0, 0.05);
	}

	.viewpoint-btn:hover {
		background: rgba(134, 179, 0, 0.1);
		border-color: rgba(134, 179, 0, 0.2);
	}

	.server-icon {
		width: 16px;
		height: 16px;
		color: var(--accent-500);
		flex-shrink: 0;
	}

	.host-name {
		flex: 1;
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--fg-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ssr-badge {
		font-size: 0.6rem;
		font-weight: 600;
		color: var(--accent-400);
		background: rgba(134, 179, 0, 0.15);
		padding: 0.125rem 0.375rem;
		border-radius: var(--radius-sm);
		text-transform: uppercase;
	}

	.remove-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.remove-btn svg {
		width: 14px;
		height: 14px;
	}

	.remove-btn:hover {
		background: rgba(255, 100, 100, 0.15);
		color: #fca5a5;
	}

	/* Add button */
	.add-viewpoint-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.625rem;
		background: transparent;
		border: 1px dashed var(--border-color);
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.add-viewpoint-btn svg {
		width: 16px;
		height: 16px;
	}

	.add-viewpoint-btn:hover {
		background: rgba(134, 179, 0, 0.1);
		border-color: var(--accent-500);
		color: var(--accent-400);
	}

	/* Input group */
	.input-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.input-icon {
		position: absolute;
		left: 0.75rem;
		width: 16px;
		height: 16px;
		color: var(--fg-muted);
		pointer-events: none;
	}

	input {
		width: 100%;
		padding: 0.625rem 0.75rem 0.625rem 2.25rem;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		font-size: 0.85rem;
		color: var(--fg-primary);
		transition: all var(--transition-fast);
	}

	input::placeholder {
		color: var(--fg-muted);
	}

	input:focus {
		outline: none;
		border-color: var(--accent-500);
		box-shadow: 0 0 0 3px rgba(134, 179, 0, 0.15);
	}

	.button-group {
		display: flex;
		gap: 0.375rem;
	}

	.apply-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.5rem 0.75rem;
		background: var(--accent-600);
		border: none;
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		font-weight: 600;
		color: white;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.apply-btn svg {
		width: 14px;
		height: 14px;
	}

	.apply-btn:hover {
		background: var(--accent-500);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(134, 179, 0, 0.3);
	}

	.cancel-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.cancel-btn svg {
		width: 16px;
		height: 16px;
	}

	.cancel-btn:hover {
		background: rgba(255, 100, 100, 0.1);
		border-color: rgba(255, 100, 100, 0.3);
		color: #fca5a5;
	}
</style>
