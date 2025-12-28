<script lang="ts">
	import { onMount } from 'svelte';
	import type { ServerInfo } from '$lib/collector';
	import { getRepositoryColor, blendColors } from '$lib/collector';

	// メディアプロキシ経由でアイコンを取得
	const MEDIA_PROXY = 'https://media.yami.ski/proxy/image.webp';
	function proxyIconUrl(url: string | null): string {
		if (!url) return '';
		return `${MEDIA_PROXY}?url=${encodeURIComponent(url)}`;
	}

	interface Federation {
		sourceHost: string;
		targetHost: string;
		usersCount: number;
		notesCount: number;
		isBlocked: boolean;
		isSuspended: boolean;
	}

	let {
		servers,
		federations,
		focusHost = '',
		viewpointServers = [],
		onSelectServer
	}: {
		servers: ServerInfo[];
		federations: Federation[];
		focusHost?: string;
		viewpointServers?: string[];
		onSelectServer?: (server: ServerInfo | null, position: { x: number; y: number } | null) => void;
	} = $props();

	let container: HTMLDivElement;
	let cy: import('cytoscape').Core | null = null;

	// ツールチップ状態
	let tooltip = $state<{ visible: boolean; x: number; y: number; label: string; host: string }>({
		visible: false,
		x: 0,
		y: 0,
		label: '',
		host: ''
	});
	let isDestroying = false;
	let isInitialized = false;
	let focusHighlightTimeout: ReturnType<typeof setTimeout> | null = null;
	let currentFocusedNode: import('cytoscape').NodeSingular | null = null;

	let prevServersLength = 0;
	let prevFederationsLength = 0;
	let prevFocusHost = '';

	// 宇宙空間の慣性パン用の状態
	let panVelocity = { x: 0, y: 0 };
	let lastPanPosition = { x: 0, y: 0 };
	let isPanning = false;
	let inertiaAnimationId: number | null = null;
	const FRICTION = 0.95; // 摩擦係数（小さいほど早く止まる）
	const MIN_VELOCITY = 0.5; // 最小速度（これ以下で停止）

	// パララックス効果用
	let starsLayer: HTMLDivElement;
	let starOffset = { x: 0, y: 0 };
	const PARALLAX_FACTOR = 0.15; // 星の移動量（グラフの15%）

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

	// 慣性アニメーションを停止
	function stopInertia() {
		if (inertiaAnimationId !== null) {
			cancelAnimationFrame(inertiaAnimationId);
			inertiaAnimationId = null;
		}
		panVelocity = { x: 0, y: 0 };
	}

	// パララックス効果を適用
	function updateParallax(deltaX: number, deltaY: number) {
		if (!starsLayer) return;
		starOffset.x += deltaX * PARALLAX_FACTOR;
		starOffset.y += deltaY * PARALLAX_FACTOR;
		starsLayer.style.transform = `translate(${starOffset.x}px, ${starOffset.y}px)`;
	}

	// 慣性アニメーション
	function applyInertia() {
		if (!cy) return;

		// 速度が十分小さければ停止
		if (Math.abs(panVelocity.x) < MIN_VELOCITY && Math.abs(panVelocity.y) < MIN_VELOCITY) {
			stopInertia();
			return;
		}

		// 摩擦を適用
		panVelocity.x *= FRICTION;
		panVelocity.y *= FRICTION;

		// パン適用
		cy.panBy({ x: panVelocity.x, y: panVelocity.y });

		// パララックス効果
		updateParallax(panVelocity.x, panVelocity.y);

		// 次のフレーム
		inertiaAnimationId = requestAnimationFrame(applyInertia);
	}

	onMount(() => {
		prevServersLength = servers.length;
		prevFederationsLength = federations.length;
		prevFocusHost = focusHost;

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
			if (focusHighlightTimeout) {
				clearTimeout(focusHighlightTimeout);
			}
			stopInertia();
			destroyCy();
		};
	});

	// サーバー/連合データが変更されたらグラフを再描画
	$effect(() => {
		const serversChanged = servers.length !== prevServersLength;
		const federationsChanged = federations.length !== prevFederationsLength;

		if ((serversChanged || federationsChanged) && container) {
			prevServersLength = servers.length;
			prevFederationsLength = federations.length;

			destroyCy();
			initGraph();
		}
	});

	// focusHostが変更されたらカメラ移動＋一時ハイライト
	$effect(() => {
		const focusChanged = focusHost !== prevFocusHost;

		if (focusChanged && cy && focusHost) {
			prevFocusHost = focusHost;
			focusOnNode(focusHost);
		} else if (focusChanged) {
			prevFocusHost = focusHost;
		}
	});

	// ノードにフォーカス（カメラ移動＋一時ハイライト）
	function focusOnNode(host: string) {
		if (!cy) return;

		const node = cy.getElementById(host);
		if (node.length === 0) return;

		// 前のハイライトタイマーをクリア
		if (focusHighlightTimeout) {
			clearTimeout(focusHighlightTimeout);
		}

		// 前のフォーカスノードのハイライトを解除
		if (currentFocusedNode && currentFocusedNode.id() !== host) {
			clearFocusHighlight(currentFocusedNode);
		}

		// ノードにカメラを移動（アニメーション付き）
		cy.animate({
			center: { eles: node },
			zoom: Math.min(cy.zoom() * 1.2, 2), // 少しズームイン
			duration: 500,
			easing: 'ease-out-cubic'
		});

		// ノードをハイライト
		node.style({
			'border-width': 6,
			'border-color': '#fff',
			'border-style': 'solid'
		});
		node.connectedEdges().style({
			'line-color': 'rgba(255, 255, 255, 0.8)',
			opacity: 1
		});

		currentFocusedNode = node;

		// 3秒後にハイライトを解除
		focusHighlightTimeout = setTimeout(() => {
			clearFocusHighlight(node);
			currentFocusedNode = null;
		}, 3000);
	}

	// フォーカスハイライトを解除
	function clearFocusHighlight(node: import('cytoscape').NodeSingular) {
		if (!cy) return;

		const isViewpoint = node.data('isViewpoint');
		const nodeColor = node.data('color');
		const borderWidth = node.data('borderWidth');

		if (isViewpoint) {
			node.style({
				'border-width': 3,
				'border-color': '#86b300',
				'border-style': 'solid'
			});
		} else {
			node.style({
				'border-width': borderWidth,
				'border-color': nodeColor,
				'border-style': 'solid'
			});
		}

		// エッジを元に戻す
		node.connectedEdges().forEach((edge: { data: (key: string) => string | number; style: (styles: Record<string, unknown>) => void }) => {
			edge.style({
				'line-color': edge.data('color'),
				opacity: edge.data('opacity')
			});
		});
	}


	async function initGraph() {
		// コンテナが準備されていない場合は中断
		if (!container || container.clientHeight === 0) {
			return;
		}

		const cytoscape = (await import('cytoscape')).default;

		// 既知のサーバーホスト
		const serverHosts = new Set(servers.map((s) => s.host));


		// 視点サーバーのセット（MisskeyHubにないサーバーでも表示対象に含める）
		const viewpointHosts = new Set<string>();
		for (const fed of federations) {
			viewpointHosts.add(fed.sourceHost);
		}

		// 正常な連合とブロック関係を分離
		const normalFederations = federations.filter(f => !f.isBlocked && !f.isSuspended);
		const blockedFederations = federations.filter(f => f.isBlocked || f.isSuspended);

		// まず全エッジの活動量を収集して最大値・最小値を取得（正常な連合のみ）
		const rawActivities: { source: string; target: string; activity: number }[] = [];
		for (const fed of normalFederations) {
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
					opacity,
					isBlocked: false,
					isSuspended: false
				}
			};
		});

		// ブロック/サスペンド関係のエッジを追加
		const blockedEdges: Array<{ data: Record<string, unknown> }> = [];
		for (const fed of blockedFederations) {
			const sourceAllowed = serverHosts.has(fed.sourceHost) || viewpointHosts.has(fed.sourceHost);
			const targetAllowed = serverHosts.has(fed.targetHost) || viewpointHosts.has(fed.targetHost);
			if (!sourceAllowed || !targetAllowed) continue;

			// ブロック関係は方向性があるのでソートしない（sourceがtargetをブロック）
			blockedEdges.push({
				data: {
					id: `blocked-${fed.sourceHost}-${fed.targetHost}`,
					source: fed.sourceHost,
					target: fed.targetHost,
					weight: 3,
					color: fed.isSuspended ? '#ff6b6b' : '#ff4757', // サスペンドは少し薄い赤
					opacity: 0.8,
					isBlocked: fed.isBlocked,
					isSuspended: fed.isSuspended
				}
			});
		}

		// 全エッジを結合
		const allEdges = [...edges, ...blockedEdges];

		// 連合関係があるサーバーのみをノードとして表示
		const connectedHosts = new Set<string>();
		for (const edge of edgeMap.values()) {
			connectedHosts.add(edge.source);
			connectedHosts.add(edge.target);
		}
		// ブロック関係のホストも追加
		for (const fed of blockedFederations) {
			if (serverHosts.has(fed.sourceHost) || viewpointHosts.has(fed.sourceHost)) {
				connectedHosts.add(fed.sourceHost);
			}
			if (serverHosts.has(fed.targetHost) || viewpointHosts.has(fed.targetHost)) {
				connectedHosts.add(fed.targetHost);
			}
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
				// メディアプロキシ経由でアイコンを取得（CORSを回避）
				// iconUrlがない場合はfaviconをフォールバック
				const originalIconUrl = server.iconUrl || `https://${host}/favicon.ico`;
				iconUrl = proxyIconUrl(originalIconUrl);
				hasIcon = true;
			} else {
				// 未知のサーバー（連合先）- faviconを試す
				size = 15;
				label = host;
				repositoryUrl = null;
				iconUrl = proxyIconUrl(`https://${host}/favicon.ico`);
				hasIcon = true; // faviconがあると仮定
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
			elements: [...nodes, ...allEdges],
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
						'text-background-color': 'rgba(0, 0, 0, 0.7)',
						'text-background-opacity': 1,
						'text-background-padding': '4px',
						'text-background-shape': 'roundrectangle',
						'border-width': 'data(borderWidth)',
						'border-color': 'data(color)',
						// 宇宙空間の星のようなグロー効果
						'overlay-padding': 8,
						'overlay-opacity': 0,
						'overlay-color': 'data(color)',
						'transition-property': 'border-color, width, height, overlay-opacity',
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
						'overlay-opacity': 0.3,
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
						opacity: 'data(opacity)' as unknown as number,
						'transition-property': 'line-color, opacity',
						'transition-duration': 200
					}
				},
				{
					selector: 'edge[?isBlocked], edge[?isSuspended]',
					style: {
						'line-style': 'dashed',
						'line-dash-pattern': [6, 3],
						'target-arrow-shape': 'triangle',
						'target-arrow-color': 'data(color)',
						'arrow-scale': 1.2,
						'curve-style': 'bezier'
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

		// ノードのハイライト関数（宇宙空間のグロー効果）
		function highlightNode(node: import('cytoscape').NodeSingular) {
			node.style({
				'border-width': 4,
				'border-color': '#fff',
				'overlay-opacity': 0.15
			});
			// 接続エッジをハイライト
			node.connectedEdges().style({
				'line-color': 'rgba(255, 255, 255, 0.7)',
				opacity: 1
			});
		}

		function unhighlightNode(node: import('cytoscape').NodeSingular) {
			const isViewpoint = node.data('isViewpoint');
			const nodeColor = node.data('color');
			const borderWidth = node.data('borderWidth');

			if (isViewpoint) {
				node.style({
					'border-width': 3,
					'border-color': '#86b300',
					'border-style': 'solid',
					'overlay-opacity': 0
				});
			} else {
				node.style({
					'border-width': borderWidth,
					'border-color': nodeColor,
					'border-style': 'solid',
					'overlay-opacity': 0
				});
			}
			// エッジは元に戻す
			node.connectedEdges().forEach((edge: { data: (key: string) => string | number; style: (styles: Record<string, unknown>) => void }) => {
				edge.style({
					'line-color': edge.data('color'),
					opacity: edge.data('opacity')
				});
			});
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

		// デスクトップ: マウスホバーでもハイライト表示 + ツールチップ
		cy.on('mouseover', 'node', (evt) => {
			const node = evt.target;
			if (!selectedNode || selectedNode.id() !== node.id()) {
				highlightNode(node);
			}
			// ツールチップ表示
			const renderedPos = node.renderedPosition();
			tooltip = {
				visible: true,
				x: renderedPos.x,
				y: renderedPos.y - node.renderedHeight() / 2 - 8,
				label: node.data('label'),
				host: node.id()
			};
		});

		cy.on('mouseout', 'node', (evt) => {
			if (!selectedNode || selectedNode.id() !== evt.target.id()) {
				unhighlightNode(evt.target);
			}
			// ツールチップ非表示
			tooltip.visible = false;
		});

		// ドラッグは無効化（連合関係の距離感を維持）
		cy.nodes().ungrabify();

		// 宇宙空間の慣性パン + パララックス効果
		cy.on('viewport', () => {
			if (isPanning && cy) {
				const pan = cy.pan();
				const deltaX = pan.x - lastPanPosition.x;
				const deltaY = pan.y - lastPanPosition.y;
				panVelocity = { x: deltaX, y: deltaY };
				lastPanPosition = { x: pan.x, y: pan.y };

				// ドラッグ中もパララックス効果
				updateParallax(deltaX, deltaY);
			}
		});

		cy.on('grab', () => {
			stopInertia();
		});

		// パン開始
		container.addEventListener('mousedown', (e) => {
			if (e.button === 0) { // 左クリックのみ
				isPanning = true;
				stopInertia();
				if (cy) {
					const pan = cy.pan();
					lastPanPosition = { x: pan.x, y: pan.y };
				}
			}
		});

		container.addEventListener('touchstart', () => {
			isPanning = true;
			stopInertia();
			if (cy) {
				const pan = cy.pan();
				lastPanPosition = { x: pan.x, y: pan.y };
			}
		});

		// パン終了 → 慣性開始
		const handlePanEnd = () => {
			if (isPanning) {
				isPanning = false;
				// 十分な速度があれば慣性を開始
				if (Math.abs(panVelocity.x) > MIN_VELOCITY || Math.abs(panVelocity.y) > MIN_VELOCITY) {
					inertiaAnimationId = requestAnimationFrame(applyInertia);
				}
			}
		};

		container.addEventListener('mouseup', handlePanEnd);
		container.addEventListener('mouseleave', handlePanEnd);
		container.addEventListener('touchend', handlePanEnd);

		cy.on('layoutstop', () => {
			// レイアウト完了後は常に全体表示（力学モデルの結果を尊重）
			if (cy) {
				cy.fit(undefined, 50);
			}
		});
	}
</script>

<div class="graph-wrapper">
	<!-- ツールチップ -->
	{#if tooltip.visible}
		<div
			class="node-tooltip"
			style="left: {tooltip.x}px; top: {tooltip.y}px;"
		>
			<span class="tooltip-label">{tooltip.label}</span>
			<span class="tooltip-host">{tooltip.host}</span>
		</div>
	{/if}

	<!-- 宇宙空間の星（パララックス効果付き） -->
	<div class="stars-layer" bind:this={starsLayer} aria-hidden="true">
		{#each { length: 50 } as _, i}
			<div
				class="star"
				style="
					left: {Math.random() * 100}%;
					top: {Math.random() * 100}%;
					--size: {0.5 + Math.random() * 2}px;
					--delay: {Math.random() * 3}s;
					--duration: {2 + Math.random() * 3}s;
				"
			></div>
		{/each}
	</div>
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

	<!-- Legend overlay (左下) -->
	<div class="graph-legend">
		<div class="legend-item"><span class="legend-key">色</span><span class="legend-val">ソフトウェア</span></div>
		<div class="legend-item"><span class="legend-key">大きさ</span><span class="legend-val">ユーザー数</span></div>
		<div class="legend-item"><span class="legend-key">線の太さ</span><span class="legend-val">やり取り量</span></div>
		<div class="legend-item"><span class="legend-key">中心</span><span class="legend-val">繋がり多</span></div>
		<div class="legend-item legend-blocked"><span class="legend-key">赤破線</span><span class="legend-val">ブロック</span></div>
	</div>
</div>

<style>
	.graph-wrapper {
		position: relative;
		flex: 1;
		min-height: 0;
		height: 100%;
		/* 宇宙空間の背景 - 中央にほんのり明るい星雲 */
		background:
			radial-gradient(ellipse at 30% 40%, rgba(100, 140, 200, 0.04) 0%, transparent 50%),
			radial-gradient(ellipse at 70% 60%, rgba(160, 100, 180, 0.03) 0%, transparent 50%),
			radial-gradient(ellipse at center, rgba(134, 179, 0, 0.05) 0%, transparent 60%);
		overflow: hidden;
	}

	/* ノードツールチップ */
	.node-tooltip {
		position: absolute;
		transform: translate(-50%, -100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.125rem;
		padding: 0.375rem 0.625rem;
		background: rgba(0, 0, 0, 0.85);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: var(--radius-md);
		pointer-events: none;
		z-index: 100;
		white-space: nowrap;
		animation: tooltip-fade-in 0.15s ease-out;
	}

	@keyframes tooltip-fade-in {
		from {
			opacity: 0;
			transform: translate(-50%, -90%);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -100%);
		}
	}

	.tooltip-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--fg-primary);
	}

	.tooltip-host {
		font-size: 0.65rem;
		color: var(--fg-muted);
	}

	/* 星のレイヤー */
	.stars-layer {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 0;
	}

	.star {
		position: absolute;
		width: var(--size);
		height: var(--size);
		background: white;
		border-radius: 50%;
		opacity: 0.6;
		animation: twinkle var(--duration) ease-in-out var(--delay) infinite;
	}

	@keyframes twinkle {
		0%, 100% {
			opacity: 0.3;
			transform: scale(1);
		}
		50% {
			opacity: 0.9;
			transform: scale(1.2);
		}
	}

	.graph {
		position: relative;
		width: 100%;
		height: 100%;
		z-index: 1;
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

	/* Legend overlay */
	.graph-legend {
		position: absolute;
		bottom: 1rem;
		left: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.5rem 0.625rem;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(8px);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		z-index: 10;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.65rem;
	}

	.legend-key {
		color: var(--fg-muted);
		min-width: 3.5rem;
	}

	.legend-val {
		color: var(--fg-secondary);
	}

	.legend-blocked .legend-key {
		color: #ff4757;
	}

	.legend-blocked .legend-val {
		color: #ff6b6b;
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

		.graph-legend {
			bottom: 0.5rem;
			left: 0.5rem;
			padding: 0.375rem 0.5rem;
		}

		.legend-item {
			font-size: 0.6rem;
		}

		.legend-key {
			min-width: 3rem;
		}
	}
</style>
