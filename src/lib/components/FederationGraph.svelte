<script lang="ts">
	import { onMount } from 'svelte';
	import type { ServerInfo } from '$lib/collector';
	import { getRepositoryColor, blendColors } from '$lib/collector';

	interface Federation {
		sourceHost: string;
		targetHost: string;
		usersCount: number;
		notesCount: number;
	}

	let {
		servers,
		federations,
		seedServer = '',
		viewpointServers = [],
		viewMode = 'merged',
		onSelectServer
	}: {
		servers: ServerInfo[];
		federations: Federation[];
		seedServer?: string;
		viewpointServers?: string[];
		viewMode?: 'merged' | 'single';
		onSelectServer?: (server: ServerInfo | null, position: { x: number; y: number } | null) => void;
	} = $props();

	let container: HTMLDivElement;
	let cy: import('cytoscape').Core | null = null;
	let isDestroying = false;
	let isInitialized = false;

	let prevServersLength = 0;
	let prevFederationsLength = 0;
	let prevSeedServer = '';

	function destroyCy() {
		if (cy && !isDestroying) {
			isDestroying = true;
			try {
				// レイアウトを停止してから破棄
				cy.stop();
				cy.destroy();
			} catch {
				// 破棄中のエラーは無視
			}
			cy = null;
			isDestroying = false;
		}
	}

	onMount(() => {
		prevServersLength = servers.length;
		prevFederationsLength = federations.length;
		prevSeedServer = seedServer;

		// ResizeObserverでコンテナの高さが確定したら初期化
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				if (entry.contentRect.height > 0 && !isInitialized && !cy) {
					isInitialized = true;
					initGraph();
				}
			}
		});

		if (container) {
			resizeObserver.observe(container);
			// 既に高さがある場合は即座に初期化
			if (container.clientHeight > 0) {
				isInitialized = true;
				initGraph();
			}
		}

		return () => {
			resizeObserver.disconnect();
			destroyCy();
		};
	});

	// props が変更されたらグラフを再描画
	$effect(() => {
		const serversChanged = servers.length !== prevServersLength;
		const federationsChanged = federations.length !== prevFederationsLength;
		const seedChanged = seedServer !== prevSeedServer;

		if ((serversChanged || federationsChanged || seedChanged) && container) {
			const onlySeedChanged = seedChanged && !serversChanged && !federationsChanged;

			// マージモードでseedServerのみ変更された場合は、ハイライト更新のみ
			if (onlySeedChanged && viewMode === 'merged' && cy) {
				const oldSeedServer = prevSeedServer;
				prevSeedServer = seedServer;
				updateSeedHighlight(oldSeedServer, seedServer);
				return;
			}

			prevServersLength = servers.length;
			prevFederationsLength = federations.length;
			prevSeedServer = seedServer;

			destroyCy();
			initGraph();
		}
	});

	// seedServerのハイライトのみを更新（レイアウト再計算なし）
	function updateSeedHighlight(oldSeed: string, newSeed: string) {
		if (!cy) return;

		// 古いseedServerのハイライトを解除
		if (oldSeed) {
			const oldNode = cy.getElementById(oldSeed);
			if (oldNode.length > 0) {
				oldNode.data('isSeed', false);
				const isViewpoint = oldNode.data('isViewpoint');
				const nodeColor = oldNode.data('color');
				const borderWidth = oldNode.data('borderWidth');

				if (isViewpoint) {
					oldNode.style({
						'border-width': 3,
						'border-color': '#86b300',
						'border-style': 'solid'
					});
				} else {
					oldNode.style({
						'border-width': borderWidth,
						'border-color': nodeColor,
						'border-style': 'solid'
					});
				}
				// エッジのハイライトも解除
				oldNode.connectedEdges().forEach((edge: { data: (key: string) => string | number; style: (styles: Record<string, unknown>) => void }) => {
					edge.style({
						'line-color': edge.data('color'),
						opacity: edge.data('opacity')
					});
				});
			}
		}

		// 新しいseedServerをハイライト（マウスオーバーと同じスタイル）
		if (newSeed) {
			const newNode = cy.getElementById(newSeed);
			if (newNode.length > 0) {
				newNode.data('isSeed', true);
				newNode.style({
					'border-width': 4,
					'border-color': '#fff',
					'border-style': 'solid'
				});
				// 接続エッジもハイライト
				newNode.connectedEdges().style({
					'line-color': 'rgba(255, 255, 255, 0.7)',
					opacity: 1
				});
			}
		}
	}

	async function initGraph() {
		// コンテナが準備されていない場合は中断
		if (!container || container.clientHeight === 0) {
			return;
		}

		const cytoscape = (await import('cytoscape')).default;

		// 既知のサーバーホスト
		const serverHosts = new Set(servers.map((s) => s.host));

		// 種サーバーからの連合先を収集（未知のサーバーも含む）
		const federatedHosts = new Set<string>();
		for (const fed of federations) {
			if (fed.sourceHost === seedServer) {
				federatedHosts.add(fed.targetHost);
			}
			if (fed.targetHost === seedServer) {
				federatedHosts.add(fed.sourceHost);
			}
		}

		// 視点サーバーのセット（MisskeyHubにないサーバーでも表示対象に含める）
		const viewpointHosts = new Set<string>();
		for (const fed of federations) {
			viewpointHosts.add(fed.sourceHost);
		}

		// まず全エッジの活動量を収集して最大値・最小値を取得
		const rawActivities: { source: string; target: string; activity: number }[] = [];
		for (const fed of federations) {
			// エッジの両端がいずれかの条件を満たす場合のみ表示:
			// 1. MisskeyHubのサーバーリストに含まれている
			// 2. 視点サーバーである（MisskeyHubに載っていなくても表示）
			const sourceAllowed = serverHosts.has(fed.sourceHost) || viewpointHosts.has(fed.sourceHost);
			const targetAllowed = serverHosts.has(fed.targetHost) || viewpointHosts.has(fed.targetHost);
			if (!sourceAllowed || !targetAllowed) {
				continue;
			}
			const [source, target] =
				fed.sourceHost < fed.targetHost
					? [fed.sourceHost, fed.targetHost]
					: [fed.targetHost, fed.sourceHost];
			// usersCount: リモートフォローユーザー数、notesCount: 取得投稿数
			const activity = fed.usersCount + fed.notesCount / 10;
			rawActivities.push({ source, target, activity });
		}

		// 活動量の最大値・最小値を計算（正規化用）
		const activities = rawActivities.map(r => r.activity);
		const maxActivity = Math.max(...activities, 1);
		const minActivity = Math.min(...activities, 0);
		const activityRange = maxActivity - minActivity || 1;

		// 重複エッジを除去し、正規化した重みを計算
		const edgeMap = new Map<string, { source: string; target: string; weight: number; rawActivity: number }>();
		for (const item of rawActivities) {
			const key = `${item.source}-${item.target}`;
			const existing = edgeMap.get(key);

			// 0-1に正規化してから1-30の範囲にスケール
			// 平方根を使って中間値をより目立たせる
			const normalized = Math.sqrt((item.activity - minActivity) / activityRange);
			const weight = 1 + normalized * 29; // 1-30

			if (existing) {
				if (item.activity > existing.rawActivity) {
					existing.weight = weight;
					existing.rawActivity = item.activity;
				}
			} else {
				edgeMap.set(key, { source: item.source, target: item.target, weight, rawActivity: item.activity });
			}
		}

		// ホストからリポジトリURLへのマッピングを作成（エッジの色計算用）
		const hostToRepoForEdge = new Map<string, string | null>();
		for (const server of servers) {
			hostToRepoForEdge.set(server.host, server.repositoryUrl);
		}

		const edges = Array.from(edgeMap.values()).map((e) => {
			// 2つのノードの色の中間色を計算
			const sourceRepo = hostToRepoForEdge.get(e.source);
			const targetRepo = hostToRepoForEdge.get(e.target);
			const sourceColor = getRepositoryColor(sourceRepo ?? null);
			const targetColor = getRepositoryColor(targetRepo ?? null);
			const edgeColor = blendColors(sourceColor, targetColor);

			// 重みに応じたopacity（0.3〜0.9の範囲）
			// 強い繋がりはより目立つように
			const opacity = Math.min(0.3 + (e.weight / 30) * 0.6, 0.9);

			return {
				data: {
					id: `${e.source}-${e.target}`,
					source: e.source,
					target: e.target,
					weight: e.weight,
					color: edgeColor,
					opacity
				}
			};
		});

		// 連合関係があるサーバーのみをノードとして表示
		// 種サーバーは常に表示、種サーバーからの連合先も表示
		const connectedHosts = new Set<string>();
		if (seedServer) {
			connectedHosts.add(seedServer);
		}
		for (const edge of edgeMap.values()) {
			connectedHosts.add(edge.source);
			connectedHosts.add(edge.target);
		}

		// サーバー情報のマップを作成
		const serverMap = new Map(servers.map((s) => [s.host, s]));

		// ノードサイズの正規化用に全サーバーのユーザー数を収集
		const allUserCounts = servers
			.filter(s => connectedHosts.has(s.host))
			.map(s => s.usersCount ?? 1);
		const maxUsers = Math.max(...allUserCounts, 1);
		const minUsers = Math.min(...allUserCounts, 1);
		// 対数スケールで正規化（ユーザー数の差が極端なため）
		const logMaxUsers = Math.log10(maxUsers + 1);
		const logMinUsers = Math.log10(minUsers + 1);
		const logUserRange = logMaxUsers - logMinUsers || 1;

		const nodes: Array<{ data: Record<string, unknown> }> = [];

		for (const host of connectedHosts) {
			const server = serverMap.get(host);
			const isSeed = host === seedServer;

			let size: number;
			let label: string;
			let repositoryUrl: string | null;
			let iconUrl: string;
			let hasIcon: boolean;

			if (server) {
				// 既知のサーバー - 対数スケールで正規化してサイズ計算
				const users = server.usersCount ?? 1;
				const logUsers = Math.log10(users + 1);
				// 0-1に正規化
				const normalized = (logUsers - logMinUsers) / logUserRange;
				// 20-200pxの範囲にマッピング（差をより明確に）
				size = 20 + normalized * 180;

				label = server.name ?? server.host;
				repositoryUrl = server.repositoryUrl;
				// MisskeyHubのアイコンURLを使用（CORSの問題があるためクライアント取得は断念）
				iconUrl = server.iconUrl || '';
				hasIcon = !!server.iconUrl;
			} else {
				// 未知のサーバー（種サーバーからの連合先）
				size = 15;
				label = host;
				repositoryUrl = null;
				iconUrl = '';
				hasIcon = false;
			}

			const isViewpoint = viewpointServers.includes(host);
			nodes.push({
				data: {
					id: host,
					label,
					size,
					repositoryUrl,
					color: getRepositoryColor(repositoryUrl),
					iconUrl,
					hasIcon,
					isSeed,
					isViewpoint
				}
			});
		}

		// ノードサイズに応じたフォントサイズを計算
		for (const node of nodes) {
			const size = node.data.size as number;
			// サイズに比例したフォントサイズ（8px〜16px）
			node.data.fontSize = Math.min(Math.max(size / 8, 8), 16);
			// ボーダー幅もサイズに応じて
			node.data.borderWidth = Math.min(Math.max(size / 20, 2), 6);
		}

		cy = cytoscape({
			container,
			elements: [...nodes, ...edges],
			style: [
				{
					selector: 'node',
					style: {
						'background-color': 'data(color)',
						label: 'data(label)',
						width: 'data(size)',
						height: 'data(size)',
						'font-size': 'data(fontSize)',
						color: '#fff',
						'text-outline-color': '#1a1a2e',
						'text-outline-width': 2,
						'text-valign': 'bottom',
						'text-margin-y': 5,
						'border-width': 'data(borderWidth)',
						'border-color': 'data(color)',
						'transition-property': 'border-color, width, height',
						'transition-duration': 200
					}
				},
				{
					selector: 'node[iconUrl != ""]',
					style: {
						'background-image': 'data(iconUrl)',
						'background-fit': 'cover',
						'background-clip': 'node'
					}
				},
				{
					selector: 'node:active',
					style: {
						'overlay-opacity': 0.2,
						'overlay-color': '#fff'
					}
				},
				{
					selector: 'node:selected',
					style: {
						'border-width': 4,
						'border-color': '#fff'
					}
				},
				{
					selector: 'node[?isSeed]',
					style: {
						'border-width': 4,
						'border-color': '#fff',
						'border-style': 'solid'
					}
				},
				{
					selector: 'node[?isViewpoint]',
					style: {
						'border-width': 3,
						'border-color': '#86b300',
						'border-style': 'solid'
					}
				},
				{
					selector: 'edge',
					style: {
						width: 'data(weight)',
						'line-color': 'data(color)',
						'curve-style': 'bezier',
						opacity: 'data(opacity)',
						'transition-property': 'line-color, opacity',
						'transition-duration': 200
					}
				},
				{
					selector: 'edge:selected',
					style: {
						'line-color': 'rgba(255, 255, 255, 0.8)',
						opacity: 1
					}
				}
			],
			layout: {
				name: 'cose',
				animate: true,
				animationDuration: 1500,
				nodeRepulsion: () => 50000,
				idealEdgeLength: (edge: { data: (key: string) => number }) => {
					const weight = edge.data('weight') || 1;
					// weight: 1-30 → length: 500-50 (反比例)
					// 重みが大きいほど距離が短い（強い繋がり＝近い）
					// より大きな差をつけて芋づる式の距離感を表現
					const normalized = (weight - 1) / 29; // 0-1
					return 500 - normalized * 450; // 500→50
				},
				edgeElasticity: (edge: { data: (key: string) => number }) => {
					const weight = edge.data('weight') || 1;
					// 重みに比例してばね力を強く
					// 強い繋がりはより強く引き付ける
					return weight * 300;
				},
				gravity: 0.15, // 重力を弱めて自然な配置に
				numIter: 2500,
				coolingFactor: 0.97,
				padding: 80,
				randomize: false
			},
			// インタラクティブ設定
			minZoom: 0.3,
			maxZoom: 3,
			boxSelectionEnabled: true,
			selectionType: 'single'
		});

		// ノードのハイライト関数
		function highlightNode(node: import('cytoscape').NodeSingular) {
			node.style({
				'border-width': 4,
				'border-color': '#fff'
			});
			// 接続エッジをハイライト
			node.connectedEdges().style({
				'line-color': 'rgba(255, 255, 255, 0.7)',
				opacity: 1
			});
		}

		function unhighlightNode(node: import('cytoscape').NodeSingular) {
			const isSeed = node.data('isSeed');
			const isViewpoint = node.data('isViewpoint');
			const nodeColor = node.data('color');
			const borderWidth = node.data('borderWidth');

			if (isSeed) {
				// seedServerはマウスオーバーと同じハイライトを維持
				node.style({
					'border-width': 4,
					'border-color': '#fff',
					'border-style': 'solid'
				});
				// エッジもハイライトを維持
				node.connectedEdges().style({
					'line-color': 'rgba(255, 255, 255, 0.7)',
					opacity: 1
				});
			} else if (isViewpoint) {
				node.style({
					'border-width': 3,
					'border-color': '#86b300',
					'border-style': 'solid'
				});
				// エッジは元に戻す
				node.connectedEdges().forEach((edge: { data: (key: string) => string | number; style: (styles: Record<string, unknown>) => void }) => {
					edge.style({
						'line-color': edge.data('color'),
						opacity: edge.data('opacity')
					});
				});
			} else {
				node.style({
					'border-width': borderWidth,
					'border-color': nodeColor,
					'border-style': 'solid'
				});
				// エッジは元に戻す
				node.connectedEdges().forEach((edge: { data: (key: string) => string | number; style: (styles: Record<string, unknown>) => void }) => {
					edge.style({
						'line-color': edge.data('color'),
						opacity: edge.data('opacity')
					});
				});
			}
		}

		// サーバー情報のマップを作成（タップ時に使用）
		const serverInfoMap = new Map(servers.map((s) => [s.host, s]));

		// 現在選択中のノード
		let selectedNode: import('cytoscape').NodeSingular | null = null;

		// タップでサーバー情報表示、選択中に再タップでサーバー遷移
		cy.on('tap', 'node', (evt) => {
			const node = evt.target;
			const host = node.id();

			// ノードの画面上の位置を取得
			const renderedPos = node.renderedPosition();
			const containerRect = container.getBoundingClientRect();
			const position = {
				x: containerRect.left + renderedPos.x,
				y: containerRect.top + renderedPos.y
			};

			if (selectedNode && selectedNode.id() === host) {
				// 同じノードを再タップ → サーバーに遷移
				window.open(`https://${host}`, '_blank');
				unhighlightNode(node);
				selectedNode = null;
				onSelectServer?.(null, null);
			} else {
				// 新しいノードをタップ → サーバー情報を表示
				if (selectedNode) {
					unhighlightNode(selectedNode);
				}

				highlightNode(node);
				selectedNode = node;

				// サーバー情報を親に通知（位置情報付き）
				const serverInfo = serverInfoMap.get(host);
				if (serverInfo) {
					onSelectServer?.(serverInfo, position);
				} else {
					// 未知のサーバー（MisskeyHubにないサーバー）の場合は最小限の情報を作成
					onSelectServer?.({
						host,
						name: host,
						description: null,
						repositoryUrl: null,
						usersCount: null,
						notesCount: null,
						iconUrl: null,
						softwareName: null,
						softwareVersion: null,
						registrationOpen: true,
						emailRequired: false,
						approvalRequired: false,
						inviteOnly: false,
						ageRestriction: 'unknown'
					}, position);
				}
			}
		});

		// 背景タップで選択解除
		cy.on('tap', (evt) => {
			if (evt.target === cy && selectedNode) {
				unhighlightNode(selectedNode);
				selectedNode = null;
				onSelectServer?.(null, null);
			}
		});

		// デスクトップ: マウスホバーでもハイライト表示
		cy.on('mouseover', 'node', (evt) => {
			if (!selectedNode || selectedNode.id() !== evt.target.id()) {
				highlightNode(evt.target);
			}
		});

		cy.on('mouseout', 'node', (evt) => {
			if (!selectedNode || selectedNode.id() !== evt.target.id()) {
				unhighlightNode(evt.target);
			}
		});

		// ドラッグは無効化（連合関係の距離感を維持）
		cy.nodes().ungrabify();

		cy.on('layoutstop', () => {
			// レイアウト完了後は常に全体表示（力学モデルの結果を尊重）
			if (cy) {
				cy.fit(undefined, 50);
			}
		});
	}
</script>

<div class="graph-wrapper">
	<div class="graph" bind:this={container}></div>

	<!-- Graph controls overlay -->
	<div class="graph-controls">
		<button class="control-btn" onclick={() => cy?.fit()} title="全体表示">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
			</svg>
		</button>
		<button class="control-btn" onclick={() => cy?.zoom(cy.zoom() * 1.3)} title="拡大">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="11" cy="11" r="8" />
				<line x1="21" y1="21" x2="16.65" y2="16.65" />
				<line x1="11" y1="8" x2="11" y2="14" />
				<line x1="8" y1="11" x2="14" y2="11" />
			</svg>
		</button>
		<button class="control-btn" onclick={() => cy?.zoom(cy.zoom() * 0.7)} title="縮小">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="11" cy="11" r="8" />
				<line x1="21" y1="21" x2="16.65" y2="16.65" />
				<line x1="8" y1="11" x2="14" y2="11" />
			</svg>
		</button>
		<button class="control-btn" onclick={() => cy?.fit(undefined, 50)} title="全体表示に戻る">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="10" />
				<circle cx="12" cy="12" r="3" />
			</svg>
		</button>
	</div>

</div>

<style>
	.graph-wrapper {
		position: relative;
		flex: 1;
		min-height: 0;
		height: 100%;
		background: radial-gradient(ellipse at center, rgba(134, 179, 0, 0.03) 0%, transparent 70%);
	}

	.graph {
		width: 100%;
		height: 100%;
	}

	/* Controls */
	.graph-controls {
		position: absolute;
		top: 1rem;
		right: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		z-index: 10;
	}

	.control-btn {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-card);
		backdrop-filter: blur(12px);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		color: var(--fg-secondary);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.control-btn:hover {
		background: var(--bg-card-hover);
		border-color: var(--border-color-hover);
		color: var(--fg-primary);
		transform: scale(1.05);
	}

	.control-btn:active {
		transform: scale(0.95);
	}

	.control-btn svg {
		width: 18px;
		height: 18px;
	}

	@media (max-width: 768px) {
		.graph-controls {
			top: 0.75rem;
			right: 0.75rem;
		}

		.control-btn {
			width: 32px;
			height: 32px;
		}

		.control-btn svg {
			width: 16px;
			height: 16px;
		}
	}
</style>
