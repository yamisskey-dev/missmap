<script lang="ts">
	import { DEFAULT_SETTINGS, type UserSettings, type ViewMode } from '$lib/types';

	let { settings = $bindable(DEFAULT_SETTINGS), onAddViewpoint, ssrViewpoints = [], defaultViewpoints = [], isMobile = false, defaultOpen = true }: {
		settings: UserSettings;
		onAddViewpoint: (host: string) => void;
		ssrViewpoints: string[];
		defaultViewpoints: string[];
		isMobile?: boolean;
		defaultOpen?: boolean;
	} = $props();

	let isExpanded = $state(defaultOpen);

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
		// 同じサーバーをクリックしたら選択解除、違うサーバーなら選択
		settings.seedServer = settings.seedServer === host ? '' : host;
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

	// デフォルトに戻す
	function handleResetToDefault() {
		if (defaultViewpoints.length > 0) {
			settings.viewpointServers = [...defaultViewpoints];
			settings.seedServer = defaultViewpoints[0];
		}
	}

	// 現在の設定がデフォルトと同じかどうか
	function isDefault(): boolean {
		if (defaultViewpoints.length === 0) return false;
		if (settings.viewpointServers.length !== defaultViewpoints.length) return false;
		return defaultViewpoints.every(h => settings.viewpointServers.includes(h));
	}
</script>

<div class="settings-panel">
	{#if isMobile}
		<button class="panel-header-toggle" onclick={() => isExpanded = !isExpanded}>
			<svg class="panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="3" />
				<path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
			</svg>
			<h4>視点サーバー</h4>
			<svg class="toggle-icon" class:expanded={isExpanded} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="6 9 12 15 18 9" />
			</svg>
		</button>
	{:else}
		<div class="panel-header">
			<svg class="panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="3" />
				<path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
			</svg>
			<h4>視点サーバー</h4>
		</div>
	{/if}

	{#if !isMobile || isExpanded}
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
	<div class="viewpoint-chips">
		{#each settings.viewpointServers as host (host)}
			<div class="viewpoint-chip" class:active={settings.seedServer === host}>
				<button class="chip-main" onclick={() => handleFocus(host)}>
					{host}
					{#if isFromSSR(host)}
						<span class="ssr-dot" title="SSRで取得済み"></span>
					{/if}
				</button>
				{#if settings.viewpointServers.length > 1}
					<button class="chip-remove" onclick={() => handleRemove(host)} title="削除">
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
		<div class="action-buttons">
			<button class="add-viewpoint-btn" onclick={() => isAdding = true}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="16" />
					<line x1="8" y1="12" x2="16" y2="12" />
				</svg>
				追加
			</button>
			{#if !isDefault()}
				<button class="reset-btn" onclick={handleResetToDefault} title="デフォルトに戻す">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
						<path d="M3 3v5h5" />
					</svg>
					リセット
				</button>
			{/if}
		</div>
	{/if}
	{/if}
</div>

<style>
	.settings-panel {
		padding: 0.5rem 0.75rem;
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-bottom: 0.375rem;
	}

	.panel-header-toggle {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		width: 100%;
		padding: 0;
		margin-bottom: 0.375rem;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
	}

	.panel-header-toggle h4 {
		flex: 1;
		margin: 0;
		color: var(--fg-primary);
	}

	.toggle-icon {
		width: 14px;
		height: 14px;
		color: var(--fg-muted);
		transition: transform var(--transition-fast);
	}

	.toggle-icon.expanded {
		transform: rotate(180deg);
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

	/* View Mode Toggle */
	.view-mode-toggle {
		display: flex;
		gap: 0.125rem;
		margin-bottom: 0.5rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: var(--radius-sm);
		padding: 0.125rem;
	}

	.mode-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		padding: 0.375rem;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.mode-btn svg {
		width: 12px;
		height: 12px;
	}

	.mode-btn:hover {
		color: var(--fg-secondary);
		background: rgba(255, 255, 255, 0.05);
	}

	.mode-btn.active {
		background: var(--accent-600);
		color: white;
	}

	/* Viewpoint Chips */
	.viewpoint-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-bottom: 0.375rem;
	}

	.viewpoint-chip {
		display: inline-flex;
		align-items: center;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		overflow: hidden;
		transition: all var(--transition-fast);
	}

	.viewpoint-chip.active {
		background: rgba(134, 179, 0, 0.15);
		border-color: var(--accent-600);
	}

	.chip-main {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: none;
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--fg-secondary);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.viewpoint-chip.active .chip-main {
		color: var(--accent-400);
	}

	.chip-main:hover {
		color: var(--fg-primary);
	}

	.ssr-dot {
		width: 5px;
		height: 5px;
		background: var(--accent-500);
		border-radius: 50%;
		flex-shrink: 0;
	}

	.chip-remove {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		padding: 0;
		margin-right: 0.125rem;
		background: transparent;
		border: none;
		border-radius: 50%;
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.chip-remove svg {
		width: 10px;
		height: 10px;
	}

	.chip-remove:hover {
		background: rgba(255, 100, 100, 0.15);
		color: #fca5a5;
	}

	/* Action buttons */
	.action-buttons {
		display: flex;
		gap: 0.25rem;
	}

	.add-viewpoint-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		padding: 0.375rem;
		background: transparent;
		border: 1px dashed var(--border-color);
		border-radius: var(--radius-sm);
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.add-viewpoint-btn svg {
		width: 12px;
		height: 12px;
	}

	.add-viewpoint-btn:hover {
		background: rgba(134, 179, 0, 0.1);
		border-color: var(--accent-500);
		color: var(--accent-400);
	}

	.reset-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		padding: 0.375rem 0.5rem;
		background: transparent;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-sm);
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.reset-btn svg {
		width: 12px;
		height: 12px;
	}

	.reset-btn:hover {
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
