<script lang="ts">
	import type { ServerInfo } from '$lib/collector';
	import { getRepositoryDisplayName, getRepositoryColor } from '$lib/collector';
	import { browser } from '$app/environment';

	let {
		server,
		position,
		onClose
	}: {
		server: ServerInfo | null;
		position: { x: number; y: number } | null;
		onClose: () => void;
	} = $props();

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
				<span class="server-host">{server.host}</span>
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
		width: 300px;
		background: #fff;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
		animation: popIn 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
		pointer-events: auto;
	}

	@media (prefers-color-scheme: dark) {
		.popup-card {
			background: rgba(22, 27, 34, 0.95);
		}
	}

	@keyframes popIn {
		from {
			opacity: 0;
			transform: scale(0.9);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* バナー */
	.banner {
		position: relative;
		height: 70px;
		background: linear-gradient(135deg,
			var(--theme-color, var(--accent-600)) 0%,
			color-mix(in srgb, var(--theme-color, var(--accent-600)) 50%, #000) 100%
		);
		overflow: hidden;
	}

	.banner-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0.9;
	}

	.close-btn {
		position: absolute;
		top: 0.375rem;
		right: 0.375rem;
		width: 26px;
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(4px);
		border: none;
		border-radius: 50%;
		color: white;
		cursor: pointer;
		transition: all var(--transition-fast);
		z-index: 10;
	}

	.close-btn:hover {
		background: rgba(0, 0, 0, 0.6);
		transform: scale(1.1);
	}

	.close-btn svg {
		width: 14px;
		height: 14px;
	}

	/* アイコン */
	.icon-container {
		display: flex;
		justify-content: center;
		margin-top: -28px;
		position: relative;
		z-index: 5;
	}

	.server-icon {
		width: 56px;
		height: 56px;
		border-radius: 12px;
		object-fit: cover;
		border: 3px solid var(--bg-card);
		box-shadow: var(--shadow-md);
	}

	.server-icon-placeholder {
		width: 56px;
		height: 56px;
		border-radius: 12px;
		background: var(--bg-secondary);
		border: 3px solid var(--bg-card);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: var(--shadow-md);
	}

	.server-icon-placeholder svg {
		width: 24px;
		height: 24px;
		color: var(--fg-muted);
	}

	.content {
		padding: 0.5rem 0.875rem 0.75rem;
	}

	.server-title {
		text-align: center;
		margin-bottom: 0.625rem;
	}

	.server-title h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
		color: var(--fg-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.server-host {
		font-size: 0.7rem;
		color: var(--fg-muted);
	}

	/* 統計 */
	.stats-row {
		display: flex;
		justify-content: center;
		gap: 1.5rem;
		padding: 0.5rem 0;
		border-top: 1px solid var(--border-color);
		border-bottom: 1px solid var(--border-color);
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.125rem;
	}

	.stat-value {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--fg-primary);
	}

	.stat-label {
		font-size: 0.65rem;
		color: var(--fg-muted);
	}

	/* メタ情報行 */
	.meta-row {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0;
		flex-wrap: wrap;
	}

	.software-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.7rem;
		color: var(--sw-color);
		padding: 0.25rem 0.5rem;
		background: color-mix(in srgb, var(--sw-color) 15%, transparent);
		border-radius: 4px;
	}

	.software-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--sw-color);
	}

	.reg-status {
		font-size: 0.7rem;
		font-weight: 500;
		color: #fca5a5;
		padding: 0.25rem 0.5rem;
		background: rgba(248, 113, 113, 0.15);
		border-radius: 4px;
	}

	.reg-status.open {
		color: var(--accent-400);
		background: rgba(134, 179, 0, 0.15);
	}

	/* 説明文 */
	.description {
		margin: 0;
		padding: 0.5rem 0;
		font-size: 0.75rem;
		color: var(--fg-secondary);
		line-height: 1.5;
		border-top: 1px solid var(--border-color);
		max-height: 120px;
		overflow-y: auto;
	}

</style>
