<script lang="ts">
	import '../app.css';
	import type { PageData } from './$types';
	import FilterPanel from '$lib/components/FilterPanel.svelte';
	import SettingsPanel from '$lib/components/SettingsPanel.svelte';
	import FederationGraph from '$lib/components/FederationGraph.svelte';
	import ServerInfoPopup from '$lib/components/ServerInfoPopup.svelte';
	import Legend from '$lib/components/Legend.svelte';
	import StatsPanel from '$lib/components/StatsPanel.svelte';
	import {
		DEFAULT_FILTER,
		DEFAULT_SETTINGS,
		type ServerFilter,
		type ServerScale,
		type UserSettings
	} from '$lib/types';
	import { getServerScale, type ServerInfo } from '$lib/collector';
	import { browser } from '$app/environment';

	let { data }: { data: PageData } = $props();

	// モバイル判定
	let isMobile = $state(false);

	// ブラウザ環境でモバイル判定
	$effect(() => {
		if (browser) {
			const checkMobile = () => {
				isMobile = window.innerWidth <= 768;
			};
			checkMobile();
			window.addEventListener('resize', checkMobile);
			return () => window.removeEventListener('resize', checkMobile);
		}
	});

	interface FederationInfo {
		sourceHost: string;
		targetHost: string;
		usersCount: number;
		notesCount: number;
	}

	let filter: ServerFilter = $state({ ...DEFAULT_FILTER });
	let settings: UserSettings = $state({ ...DEFAULT_SETTINGS });
	let isLoading = $state(false);
	let additionalFederations = $state<FederationInfo[]>([]); // 追加取得した連合情報
	let initialized = $state(false);

	// SSRで取得済みの視点サーバーリスト
	let ssrViewpoints = $derived(() => {
		const hosts = new Set<string>();
		for (const fed of data.federations as FederationInfo[]) {
			hosts.add(fed.sourceHost);
		}
		return Array.from(hosts);
	});

	// SSRから取得したデフォルト視点サーバー
	let defaultViewpoints = $derived(() => {
		return (data.defaultViewpoints as string[]) ?? [];
	});

	// ブラウザ環境で設定を読み込み
	$effect(() => {
		if (browser && !initialized) {
			initialized = true;
			const saved = localStorage.getItem('missmap_settings');
			if (saved) {
				try {
					const parsed = JSON.parse(saved);
					// 古い形式からの移行: viewpointServersがなければ作成
					if (!parsed.viewpointServers) {
						parsed.viewpointServers = [parsed.seedServer || 'misskey.io'];
					}
					if (!parsed.viewMode) {
						parsed.viewMode = 'merged';
					}
					settings = parsed;
				} catch {
					// ignore
				}
			} else if (defaultViewpoints().length > 0) {
				// ローカルストレージに設定がない場合、SSRのデフォルト視点サーバーを使用
				settings.viewpointServers = defaultViewpoints();
				settings.seedServer = defaultViewpoints()[0];
			}
			// 視点サーバーリストにあるがSSRデータにないサーバーから連合情報を取得
			const ssrHosts = new Set(ssrViewpoints());
			for (const host of settings.viewpointServers) {
				if (!ssrHosts.has(host)) {
					fetchSeedFederations(host).then((feds) => {
						const existingKeys = new Set(additionalFederations.map(f => `${f.sourceHost}-${f.targetHost}`));
						const newFeds = feds.filter(f => !existingKeys.has(`${f.sourceHost}-${f.targetHost}`));
						if (newFeds.length > 0) {
							additionalFederations = [...additionalFederations, ...newFeds];
						}
					});
				}
			}
		}
	});

	// SSRデータと追加取得データをマージした連合情報
	let allFederations = $derived(() => {
		const ssrFeds = data.federations as FederationInfo[];
		// 重複を除去してマージ
		const fedMap = new Map<string, FederationInfo>();
		for (const fed of ssrFeds) {
			const key = `${fed.sourceHost}-${fed.targetHost}`;
			fedMap.set(key, fed);
		}
		for (const fed of additionalFederations) {
			const key = `${fed.sourceHost}-${fed.targetHost}`;
			if (!fedMap.has(key)) {
				fedMap.set(key, fed);
			}
		}
		return Array.from(fedMap.values());
	});

	// 表示モードに応じた連合情報
	let displayFederations = $derived(() => {
		if (settings.viewMode === 'single') {
			// 単一モード: 現在の視点サーバーからの連合のみ
			return allFederations().filter(f => f.sourceHost === settings.seedServer);
		}
		// マージモード: 全視点サーバーからの連合
		return allFederations().filter(f => settings.viewpointServers.includes(f.sourceHost));
	});

	// 設定変更を監視して保存
	$effect(() => {
		// settingsへの明示的な参照で依存関係を作成
		const currentSettings = JSON.stringify(settings);
		if (browser && initialized) {
			localStorage.setItem('missmap_settings', currentSettings);
		}
	});

	let federationError = $state<string | null>(null);

	// 種サーバーから連合情報を取得（サーバーサイドAPI経由でCORSを回避）
	async function fetchSeedFederations(seedHost: string): Promise<FederationInfo[]> {
		federationError = null;
		try {
			const res = await fetch('/api/federation', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ seedServer: seedHost })
			});

			if (!res.ok) {
				const errorData = (await res.json().catch(() => ({}))) as { message?: string };
				federationError = errorData.message ?? `${seedHost} から連合情報を取得できませんでした`;
				return [];
			}

			const result = (await res.json()) as { federations: FederationInfo[] };
			return result.federations;
		} catch {
			federationError = `${seedHost} への接続に失敗しました`;
			return [];
		}
	}

	// 視点サーバー追加時の処理
	async function handleAddViewpoint(host: string) {
		// 既に連合情報がある場合はスキップ
		const existingHosts = new Set([...ssrViewpoints(), ...additionalFederations.map(f => f.sourceHost)]);
		if (existingHosts.has(host)) {
			return;
		}

		isLoading = true;
		try {
			const federations = await fetchSeedFederations(host);
			// 追加データとしてマージ（既存を保持しつつ追加）
			const existingKeys = new Set(additionalFederations.map(f => `${f.sourceHost}-${f.targetHost}`));
			const newFeds = federations.filter(f => !existingKeys.has(`${f.sourceHost}-${f.targetHost}`));
			if (newFeds.length > 0) {
				additionalFederations = [...additionalFederations, ...newFeds];
			}
		} catch (e) {
			console.error('Failed to fetch federations:', e);
		} finally {
			isLoading = false;
		}
	}

	// グラフでサーバーを選択した時のポップアップ表示用
	let selectedServerInfo = $state<ServerInfo | null>(null);
	let popupPosition = $state<{ x: number; y: number } | null>(null);

	function handleSelectServer(server: ServerInfo | null, position: { x: number; y: number } | null) {
		selectedServerInfo = server;
		popupPosition = position;
	}

	function handleClosePopup() {
		selectedServerInfo = null;
		popupPosition = null;
	}

	// 表示するサーバー一覧（SSRで取得したデータを使用）
	let displayServers = $derived(() => {
		return data.servers as ServerInfo[];
	});

	// 利用可能なリポジトリURLを抽出
	let availableRepositories = $derived(() => {
		const repos = new Set<string>();
		for (const server of displayServers()) {
			if (server.repositoryUrl) {
				repos.add(server.repositoryUrl);
			}
		}
		return Array.from(repos).sort();
	});

	// サーバーの登録状態を判定
	function getRegistrationStatus(server: ServerInfo): 'open' | 'approval' | 'invite' | 'closed' {
		// registrationOpen = false の場合
		if (!server.registrationOpen) {
			// 招待制（inviteOnlyフラグがある場合）
			if (server.inviteOnly) {
				return 'invite';
			}
			// それ以外は停止中
			return 'closed';
		}
		// registrationOpen = true の場合
		if (server.approvalRequired) {
			return 'approval';
		}
		return 'open';
	}

	// フィルターがアクティブかどうか
	let hasActiveFilter = $derived(() => {
		return (
			filter.registrationStatus.length > 0 ||
			filter.emailRequirement !== null ||
			filter.ageRestriction !== null ||
			filter.repositoryUrls.length > 0 ||
			filter.scale.length > 0
		);
	});

	// フィルター適用後のサーバー一覧
	let filteredServers = $derived(() => {
		return displayServers().filter((server: ServerInfo) => {
			// 新規登録フィルター
			if (filter.registrationStatus.length > 0) {
				const status = getRegistrationStatus(server);
				if (!filter.registrationStatus.includes(status)) return false;
			}

			// メールアドレス要件
			if (filter.emailRequirement !== null) {
				if (filter.emailRequirement === 'required' && !server.emailRequired) return false;
				if (filter.emailRequirement === 'notRequired' && server.emailRequired) return false;
			}

			// 年齢制限（階層的にフィルタリング）
			// 13+を選択 → 13+と18+のサーバーを表示（小学生不可以上）
			// 18+を選択 → 18+のサーバーのみ表示（未成年不可）
			if (filter.ageRestriction) {
				if (filter.ageRestriction === '13+') {
					// 13+以上: 13+ または 18+ を表示
					if (server.ageRestriction !== '13+' && server.ageRestriction !== '18+') return false;
				} else if (filter.ageRestriction === '18+') {
					// 18+のみ
					if (server.ageRestriction !== '18+') return false;
				}
			}

			// リポジトリURL
			if (filter.repositoryUrls.length > 0) {
				if (!server.repositoryUrl || !filter.repositoryUrls.includes(server.repositoryUrl)) {
					return false;
				}
			}

			// 規模
			if (filter.scale.length > 0) {
				const scale: ServerScale = getServerScale(server.usersCount);
				if (!filter.scale.includes(scale)) return false;
			}

			return true;
		});
	});
</script>

<svelte:head>
	<title>みすまっぷ</title>
	<meta name="description" content="Misskeyサーバーの連合関係を視覚的に表示するインタラクティブマップ" />
</svelte:head>

<div class="page">
	<!-- GitHub Corner -->
	<a href="https://github.com/yamisskey-dev/missmap" target="_blank" rel="noopener noreferrer" class="github-corner" aria-label="View source on GitHub">
		<svg width="80" height="80" viewBox="0 0 250 250" aria-hidden="true">
			<path d="M0,0 L115,115 L130,115 L142,142 L250,250 L250,0 Z" />
			<path d="M128.3,109.0 C113.8,99.7 119.0,89.6 119.0,89.6 C122.0,82.7 120.5,78.6 120.5,78.6 C119.2,72.0 123.4,76.3 123.4,76.3 C127.3,80.9 125.5,87.3 125.5,87.3 C122.9,97.6 130.6,101.9 134.4,103.2" fill="currentColor" class="octo-arm" />
			<path d="M115.0,115.0 C114.9,115.1 118.7,116.5 119.8,115.4 L133.7,101.6 C136.9,99.2 139.9,98.4 142.2,98.6 C133.8,88.0 127.5,74.4 143.8,58.0 C148.5,53.4 154.0,51.2 159.7,51.0 C160.3,49.4 163.2,43.6 171.4,40.1 C171.4,40.1 176.1,42.5 178.8,56.2 C183.1,58.6 187.2,61.8 190.9,65.4 C194.5,69.0 197.7,73.2 200.1,77.6 C213.8,80.2 216.3,84.9 216.3,84.9 C212.7,93.1 206.9,96.0 205.4,96.6 C205.1,102.4 203.0,107.8 198.3,112.5 C181.9,128.9 168.3,122.5 157.7,114.1 C157.9,116.9 156.7,120.9 152.7,124.9 L141.0,136.5 C139.8,137.7 141.6,141.9 141.8,141.8 Z" fill="currentColor" class="octo-body" />
		</svg>
	</a>

	<!-- モバイル: パネルを上部に配置 -->
	{#if isMobile}
		<div class="mobile-panels">
			<SettingsPanel bind:settings onAddViewpoint={handleAddViewpoint} ssrViewpoints={ssrViewpoints()} defaultViewpoints={defaultViewpoints()} {isMobile} defaultOpen={false} />
			<FilterPanel bind:filter availableRepositories={availableRepositories()} {isMobile} defaultOpen={false} />
			<Legend />
		</div>
	{/if}

	<div class="layout">
		<!-- デスクトップ: サイドバー -->
		{#if !isMobile}
			<aside class="sidebar">
				<SettingsPanel bind:settings onAddViewpoint={handleAddViewpoint} ssrViewpoints={ssrViewpoints()} defaultViewpoints={defaultViewpoints()} />
				<FilterPanel bind:filter availableRepositories={availableRepositories()} />
				<Legend />
				<StatsPanel
					totalServers={displayServers().length}
					filteredServers={filteredServers().length}
					federationCount={displayFederations().length}
					viewpointCount={settings.viewpointServers.length}
					hasActiveFilter={hasActiveFilter()}
				/>
			</aside>
		{/if}


		<main>
			{#if federationError}
				<div class="error-banner">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="error-icon">
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" />
					</svg>
					<span>{federationError}</span>
				</div>
			{/if}
			{#if isLoading}
				<div class="graph-placeholder loading">
					<div class="spinner"></div>
					<span class="loading-text">{settings.seedServer} から連合情報を取得中...</span>
				</div>
			{:else if filteredServers().length > 0}
				<div class="graph-container">
					<FederationGraph
						servers={filteredServers()}
						federations={displayFederations()}
						seedServer={settings.seedServer}
						viewpointServers={settings.viewpointServers}
						onSelectServer={handleSelectServer}
					/>
				</div>
			{:else}
				<div class="graph-placeholder empty">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
						<circle cx="12" cy="12" r="10" />
						<path d="M8 15s1.5-2 4-2 4 2 4 2" />
						<line x1="9" y1="9" x2="9.01" y2="9" />
						<line x1="15" y1="9" x2="15.01" y2="9" />
					</svg>
					<span>条件に一致するサーバーがありません</span>
					<button class="reset-btn" onclick={() => filter = { ...DEFAULT_FILTER }}>
						フィルターをリセット
					</button>
				</div>
			{/if}
		</main>
	</div>
</div>

<!-- Server Info Popup -->
<ServerInfoPopup server={selectedServerInfo} position={popupPosition} onClose={handleClosePopup} />

<style>
	.page {
		min-height: 100vh;
		background: var(--bg-primary);
	}

	/* Layout */
	.layout {
		display: flex;
		gap: 1rem;
		max-width: 1600px;
		margin: 0 auto;
		padding: 0.75rem 1rem;
		height: 100vh;
	}

	/* Sidebar */
	.sidebar {
		width: 260px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		overflow-y: auto;
	}

	.sidebar :global(.filter-panel),
	.sidebar :global(.settings-panel),
	.sidebar :global(.legend-panel),
	.sidebar :global(.stats-panel) {
		background: var(--bg-card);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-lg);
		color: var(--fg-primary);
		transition: border-color var(--transition-normal), box-shadow var(--transition-normal);
	}

	.sidebar :global(.filter-panel:hover),
	.sidebar :global(.settings-panel:hover),
	.sidebar :global(.legend-panel:hover),
	.sidebar :global(.stats-panel:hover) {
		border-color: var(--border-color-hover);
		box-shadow: var(--shadow-md);
	}

	.sidebar :global(h3),
	.sidebar :global(h4) {
		color: var(--fg-primary);
	}

	.sidebar :global(label) {
		color: var(--fg-secondary);
	}

	.sidebar :global(.description) {
		color: var(--fg-muted);
	}

	/* Main */
	main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	/* Error Banner */
	.error-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: rgba(248, 113, 113, 0.1);
		border: 1px solid rgba(248, 113, 113, 0.3);
		border-radius: var(--radius-md);
		padding: 0.875rem 1.25rem;
		margin-bottom: 1rem;
		color: #fca5a5;
		font-size: 0.9rem;
		animation: fadeIn 0.3s ease-out;
	}

	.error-icon {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
	}

	/* Graph Container */
	.graph-container {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		background: var(--bg-card);
		backdrop-filter: blur(12px);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-lg);
		overflow: hidden;
		box-shadow: var(--shadow-lg);
		animation: fadeIn 0.4s ease-out;
	}

	.graph-container :global(.graph-wrapper) {
		flex: 1;
		min-height: 0;
	}

	/* Placeholder states */
	.graph-placeholder {
		flex: 1;
		min-height: 0;
		background: var(--bg-card);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		color: var(--fg-muted);
	}

	.graph-placeholder.loading {
		background: linear-gradient(135deg, rgba(134, 179, 0, 0.05), rgba(134, 179, 0, 0.02));
		border-color: rgba(134, 179, 0, 0.2);
	}

	.graph-placeholder.empty {
		background: var(--bg-card);
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(134, 179, 0, 0.2);
		border-top-color: var(--accent-500);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.loading-text {
		color: var(--fg-secondary);
		font-size: 0.95rem;
	}

	.empty-icon {
		width: 64px;
		height: 64px;
		color: var(--fg-muted);
		opacity: 0.5;
	}

	.reset-btn {
		margin-top: 0.5rem;
		padding: 0.625rem 1.25rem;
		background: var(--accent-600);
		color: white;
		border: none;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.reset-btn:hover {
		background: var(--accent-500);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(134, 179, 0, 0.3);
	}

	@media (max-width: 1024px) {
		.layout {
			padding: 0.5rem 0.75rem;
		}

		.sidebar {
			width: 220px;
		}
	}

	/* Mobile panels - ヘッダー下に配置 */
	.mobile-panels {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 0 1rem;
		background: var(--bg-primary);
	}

	.mobile-panels :global(.settings-panel),
	.mobile-panels :global(.filter-panel),
	.mobile-panels :global(.legend-panel) {
		background: var(--bg-card);
		border: 1px solid var(--border-color);
		border-radius: 0;
		margin: 0 -1rem;
		border-left: none;
		border-right: none;
	}

	.mobile-panels :global(.settings-panel),
	.mobile-panels :global(.filter-panel) {
		border-bottom: none;
	}

	.mobile-panels :global(.legend-panel) {
		padding: 0.375rem 0.5rem;
	}

	.mobile-panels :global(.legend-grid) {
		display: flex;
		justify-content: space-around;
		gap: 0;
	}

	.mobile-panels :global(.legend-item) {
		flex-direction: row;
		align-items: center;
		gap: 0.125rem;
	}

	.mobile-panels :global(.legend-label) {
		font-size: 0.6rem;
	}

	.mobile-panels :global(.legend-value) {
		font-size: 0.6rem;
	}

	.mobile-panels :global(.legend-label::after) {
		content: '=';
		margin-left: 0.125rem;
	}

	@media (max-width: 768px) {
		.page {
			min-height: 100vh;
			overflow-y: auto;
		}

		.layout {
			display: flex;
			flex-direction: column;
			min-height: calc(100vh - 70px);
			padding: 0.25rem;
		}

		.sidebar {
			display: none;
		}

		main {
			flex: 1;
			min-height: 50vh;
		}

		.graph-container {
			height: 100%;
			min-height: 50vh;
		}

		.graph-placeholder {
			height: 100%;
			min-height: 50vh;
		}

		.github-corner svg {
			width: 60px;
			height: 60px;
		}
	}

	/* GitHub Corner */
	.github-corner {
		position: fixed;
		top: 0;
		right: 0;
		z-index: 100;
	}

	.github-corner svg {
		fill: var(--accent-600);
		color: var(--bg-primary);
	}

	.github-corner:hover .octo-arm {
		animation: octocat-wave 560ms ease-in-out;
	}

	.github-corner .octo-arm {
		transform-origin: 130px 106px;
	}

	@keyframes octocat-wave {
		0%, 100% { transform: rotate(0); }
		20%, 60% { transform: rotate(-25deg); }
		40%, 80% { transform: rotate(10deg); }
	}

	@media (max-width: 500px) {
		.github-corner:hover .octo-arm {
			animation: none;
		}
		.github-corner .octo-arm {
			animation: octocat-wave 560ms ease-in-out;
		}
	}
</style>
