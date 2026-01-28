<script lang="ts">
	import type { ServerInfo } from '$lib/collector';
	import { getRepositoryDisplayName, getRepositoryColor } from '$lib/collector';
	import { browser } from '$app/environment';

	let {
		server,
		position,
		onClose,
		isViewpoint = false,
		isBookmarked = false,
		onToggleViewpoint,
		onToggleBookmark,
		viewpointServers = []
	}: {
		server: ServerInfo | null;
		position: { x: number; y: number } | null;
		onClose: () => void;
		isViewpoint?: boolean;
		isBookmarked?: boolean;
		onToggleViewpoint?: (host: string, add: boolean) => void;
		onToggleBookmark?: (host: string, add: boolean) => void;
		viewpointServers?: string[];
	} = $props();

	// 共有用URLを生成
	function getShareUrl(): string {
		if (!server || !browser) return '';
		const url = new URL(window.location.origin);
		// 現在の視点サーバーを維持しつつ、選択サーバーを追加
		for (const vp of viewpointServers) {
			url.searchParams.append('from', vp);
		}
		url.searchParams.set('select', server.host);
		url.searchParams.set('focus', server.host);
		return url.toString();
	}

	// URLをクリップボードにコピー
	let copied = $state(false);
	async function copyShareUrl() {
		const url = getShareUrl();
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => copied = false, 2000);
		} catch {
			// フォールバック: 古いブラウザ用
			const textarea = document.createElement('textarea');
			textarea.value = url;
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand('copy');
			document.body.removeChild(textarea);
			copied = true;
			setTimeout(() => copied = false, 2000);
		}
	}

	// ポップアップの位置を計算（画面からはみ出さないように調整）
	let popupStyle = $derived(() => {
		if (!position || !browser) return '';

		const popupWidth = 300;
		const popupHeight = 400;
		const margin = 12;
		const nodeOffset = 50; // ノードからの距離

		let x = position.x + nodeOffset;
		let y = position.y - popupHeight / 2;

		// 右端からはみ出す場合は左側に表示
		if (x + popupWidth + margin > window.innerWidth) {
			x = position.x - popupWidth - nodeOffset;
		}

		// 左端からはみ出す場合
		if (x < margin) {
			x = margin;
		}

		// 上端からはみ出す場合
		if (y < margin) {
			y = margin;
		}

		// 下端からはみ出す場合
		if (y + popupHeight + margin > window.innerHeight) {
			y = window.innerHeight - popupHeight - margin;
		}

		return `left: ${x}px; top: ${y}px;`;
	});

	// バナー画像を動的に取得
	let bannerUrl = $state<string | null>(null);
	let bannerLoading = $state(false);

	async function fetchBanner(host: string) {
		bannerLoading = true;
		bannerUrl = null;
		try {
			const res = await fetch(`https://${host}/api/meta`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			if (res.ok) {
				const data = await res.json();
				if (data.bannerUrl) {
					bannerUrl = data.bannerUrl;
				}
			}
		} catch {
			// バナー取得失敗は無視
		} finally {
			bannerLoading = false;
		}
	}

	// サーバーが変わったらバナーを取得
	$effect(() => {
		if (server && browser) {
			fetchBanner(server.host);
		}
	});

	function formatNumber(num: number | null): string {
		if (num === null) return '-';
		if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
		if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
		return num.toString();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}

	// 登録状況の取得
	function getRegistrationStatus(server: ServerInfo): { label: string; open: boolean } {
		if (!server.registrationOpen) return { label: '登録停止中', open: false };
		if (server.inviteOnly) return { label: '招待制', open: false };
		if (server.approvalRequired) return { label: '承認制', open: true };
		if (server.emailRequired) return { label: '要メール', open: true };
		return { label: '登録受付中', open: true };
	}

</script>

<svelte:window onkeydown={handleKeydown} />

{#if server && position}
	<div class="popup-card" style={popupStyle()}>
		<!-- バナー -->
		<div class="banner" style="--theme-color: {getRepositoryColor(server.repositoryUrl)}">
			{#if bannerUrl}
				<img class="banner-img" src={bannerUrl} alt="" />
			{/if}
			<button class="close-btn" onclick={onClose} title="閉じる (Esc)">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>

		<!-- アイコン（バナーからはみ出す形で配置） -->
		<div class="icon-container">
			{#if server.iconUrl}
				<img class="server-icon" src={server.iconUrl} alt="" />
			{:else}
				<div class="server-icon-placeholder">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" />
						<line x1="2" y1="12" x2="22" y2="12" />
						<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
					</svg>
				</div>
			{/if}
		</div>

		<div class="content">
			<!-- サーバー名 -->
			<div class="server-title">
				<h3>{server.name ?? server.host}</h3>
				<a href="https://{server.host}" target="_blank" rel="noopener noreferrer" class="server-host-link">
					{server.host}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
						<polyline points="15 3 21 3 21 9" />
						<line x1="10" y1="14" x2="21" y2="3" />
					</svg>
				</a>
			</div>

			<!-- 統計 -->
			<div class="stats-row">
				<div class="stat">
					<span class="stat-value">{formatNumber(server.usersCount)}</span>
					<span class="stat-label">ユーザー</span>
				</div>
				<div class="stat">
					<span class="stat-value">{formatNumber(server.notesCount)}</span>
					<span class="stat-label">ノート</span>
				</div>
			</div>

			<!-- ソフトウェア & 登録状況 -->
			<div class="meta-row">
				{#if server.repositoryUrl}
					<span class="software-tag" style="--sw-color: {getRepositoryColor(server.repositoryUrl)}">
						<span class="software-dot"></span>
						{getRepositoryDisplayName(server.repositoryUrl)}
					</span>
				{/if}
				<span class="reg-status" class:open={getRegistrationStatus(server).open}>
					{getRegistrationStatus(server).label}
				</span>
			</div>

			<!-- アクションボタン -->
			<div class="action-buttons">
				{#if onToggleViewpoint}
					<button
						class="action-btn viewpoint-btn"
						class:active={isViewpoint}
						onclick={() => onToggleViewpoint(server.host, !isViewpoint)}
						title={isViewpoint ? '視点から外す' : '視点に追加'}
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							{#if isViewpoint}
								<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
								<circle cx="12" cy="12" r="3" />
								<line x1="4" y1="4" x2="20" y2="20" stroke-width="2.5" />
							{:else}
								<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
								<circle cx="12" cy="12" r="3" />
							{/if}
						</svg>
						<span>{isViewpoint ? '視点から外す' : '視点に追加'}</span>
					</button>
				{/if}
				{#if onToggleBookmark}
					<button
						class="action-btn bookmark-btn"
						class:active={isBookmarked}
						onclick={() => onToggleBookmark(server.host, !isBookmarked)}
						title={isBookmarked ? 'お気に入りから外す' : 'お気に入りに追加'}
					>
						<svg viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2">
							<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
						</svg>
					</button>
				{/if}
				<button
					class="action-btn share-btn"
					class:copied
					onclick={copyShareUrl}
					title="このサーバーへのリンクをコピー"
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						{#if copied}
							<polyline points="20 6 9 17 4 12" />
						{:else}
							<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
							<polyline points="16 6 12 2 8 6" />
							<line x1="12" y1="2" x2="12" y2="15" />
						{/if}
					</svg>
					<span>{copied ? 'コピー済み!' : '共有'}</span>
				</button>
			</div>

			<!-- 説明文（HTMLを展開） -->
			{#if server.description}
				<div class="description">{@html server.description}</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.popup-card {
		position: fixed;
		z-index: 1000;
		width: 320px;
		background: var(--glass-bg-strong);
		backdrop-filter: blur(var(--glass-blur-lg));
		-webkit-backdrop-filter: blur(var(--glass-blur-lg));
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-xl), inset 0 1px 0 var(--glass-border);
		overflow: hidden;
		animation: popIn 0.25s var(--ease-out-back);
		pointer-events: auto;
	}

	@media (prefers-color-scheme: dark) {
		.popup-card {
			background: rgba(22, 27, 34, 0.92);
		}
	}

	@keyframes popIn {
		from {
			opacity: 0;
			transform: scale(0.92) translateY(8px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	/* バナー */
	.banner {
		position: relative;
		height: 80px;
		background: linear-gradient(135deg,
			var(--theme-color, var(--accent-600)) 0%,
			color-mix(in srgb, var(--theme-color, var(--accent-600)) 40%, #000) 100%
		);
		overflow: hidden;
	}

	.banner::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 40px;
		background: linear-gradient(to top, var(--glass-bg-strong), transparent);
		pointer-events: none;
	}

	.banner-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0.85;
	}

	.close-btn {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.35);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 50%;
		color: white;
		cursor: pointer;
		transition: all var(--transition-bounce);
		z-index: 10;
	}

	.close-btn:hover {
		background: rgba(0, 0, 0, 0.5);
		transform: scale(1.1);
		box-shadow: 0 0 12px rgba(0, 0, 0, 0.3);
	}

	.close-btn svg {
		width: 14px;
		height: 14px;
	}

	/* アイコン */
	.icon-container {
		display: flex;
		justify-content: center;
		margin-top: -32px;
		position: relative;
		z-index: 5;
	}

	.server-icon {
		width: 64px;
		height: 64px;
		border-radius: 14px;
		object-fit: cover;
		border: 3px solid var(--glass-bg-strong);
		box-shadow: var(--shadow-lg), 0 0 0 1px var(--border-color);
		transition: transform var(--transition-bounce);
	}

	.server-icon:hover {
		transform: scale(1.05);
	}

	.server-icon-placeholder {
		width: 64px;
		height: 64px;
		border-radius: 14px;
		background: var(--glass-bg);
		border: 3px solid var(--glass-bg-strong);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: var(--shadow-lg), 0 0 0 1px var(--border-color);
	}

	.server-icon-placeholder svg {
		width: 28px;
		height: 28px;
		color: var(--fg-muted);
	}

	.content {
		padding: 0.625rem 1rem 1rem;
	}

	.server-title {
		text-align: center;
		margin-bottom: 0.75rem;
	}

	.server-title h3 {
		margin: 0 0 0.125rem;
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--fg-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		letter-spacing: -0.02em;
	}

	.server-host-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.7rem;
		color: var(--fg-muted);
		font-weight: 500;
		text-decoration: none;
		transition: all var(--transition-fast);
	}

	.server-host-link:hover {
		color: var(--accent-400);
	}

	.server-host-link svg {
		width: 12px;
		height: 12px;
		opacity: 0.6;
	}

	.server-host-link:hover svg {
		opacity: 1;
	}

	/* 統計 */
	.stats-row {
		display: flex;
		justify-content: center;
		gap: 2rem;
		padding: 0.75rem 0;
		margin: 0 -0.5rem;
		background: var(--glass-bg-subtle);
		border-radius: var(--radius-md);
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.stat-value {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--fg-primary);
		letter-spacing: -0.02em;
	}

	.stat-label {
		font-size: 0.65rem;
		font-weight: 500;
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.stat.highlight .stat-value {
		color: var(--accent-400);
	}

	.stat.highlight .stat-label {
		color: var(--accent-500);
	}

	/* メタ情報行 */
	.meta-row {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 0;
		flex-wrap: wrap;
	}

	.software-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--sw-color);
		padding: 0.375rem 0.625rem;
		background: color-mix(in srgb, var(--sw-color) 15%, transparent);
		border-radius: var(--radius-full);
		border: 1px solid color-mix(in srgb, var(--sw-color) 25%, transparent);
	}

	.software-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--sw-color);
		box-shadow: 0 0 6px var(--sw-color);
	}

	.reg-status {
		font-size: 0.7rem;
		font-weight: 600;
		color: #fca5a5;
		padding: 0.375rem 0.625rem;
		background: rgba(248, 113, 113, 0.12);
		border: 1px solid rgba(248, 113, 113, 0.25);
		border-radius: var(--radius-full);
	}

	.reg-status.open {
		color: var(--accent-400);
		background: rgba(134, 179, 0, 0.12);
		border-color: rgba(134, 179, 0, 0.25);
	}

	/* アクションボタン */
	.action-buttons {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 0;
		justify-content: center;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--fg-secondary);
		background: var(--glass-bg);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-full);
		cursor: pointer;
		transition: all var(--transition-bounce);
	}

	.action-btn:hover {
		background: var(--glass-bg-strong);
		border-color: var(--accent-500);
		color: var(--accent-400);
		transform: translateY(-1px);
		box-shadow: var(--shadow-md);
	}

	.action-btn svg {
		width: 16px;
		height: 16px;
	}

	.viewpoint-btn.active {
		color: var(--accent-400);
		background: rgba(134, 179, 0, 0.15);
		border-color: var(--accent-500);
	}

	.viewpoint-btn.active:hover {
		background: rgba(248, 113, 113, 0.15);
		border-color: #f87171;
		color: #fca5a5;
	}

	.share-btn.copied {
		color: var(--accent-400);
		background: rgba(134, 179, 0, 0.15);
		border-color: var(--accent-500);
	}

	.bookmark-btn {
		padding: 0.5rem;
	}

	.bookmark-btn.active {
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.15);
		border-color: #fbbf24;
	}

	.bookmark-btn.active:hover {
		background: rgba(248, 113, 113, 0.15);
		border-color: #f87171;
		color: #fca5a5;
	}

	/* 説明文 */
	.description {
		margin: 0;
		padding: 0.75rem 0;
		font-size: 0.75rem;
		color: var(--fg-secondary);
		line-height: 1.6;
		border-top: 1px solid var(--border-color);
		max-height: 130px;
		overflow-y: auto;
	}

	.description::-webkit-scrollbar {
		width: 4px;
	}

	.description::-webkit-scrollbar-thumb {
		background: var(--border-color);
		border-radius: 2px;
	}

</style>
