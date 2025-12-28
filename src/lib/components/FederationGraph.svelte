<script lang="ts">
	import { onMount } from 'svelte';
	import type { ServerInfo } from '$lib/collector';
	import { getRepositoryColor, blendColors } from '$lib/collector';
	import { DEFAULT_EDGE_VISIBILITY, type EdgeVisibility } from '$lib/types';

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
		privateServers = new Set<string>(),
		edgeVisibility = DEFAULT_EDGE_VISIBILITY,
		initialSelection = null,
		onSelectServer,
		onSelectEdge,
		onClearSelection
	}: {
		servers: ServerInfo[];
		federations: Federation[];
		focusHost?: string;
		viewpointServers?: string[];
		privateServers?: Set<string>;
		edgeVisibility?: EdgeVisibility;
		initialSelection?: { type: 'node' | 'edge'; value: string } | null;
		onSelectServer?: (server: ServerInfo | null, position: { x: number; y: number } | null) => void;
		onSelectEdge?: (sourceHost: string, targetHost: string) => void;
		onClearSelection?: () => void;
	} = $props();

	let container: HTMLDivElement;
	let cy: import('cytoscape').Core | null = null;

	// ツールチップ状態（ノード用とエッジ用）
	let tooltip = $state<{
		visible: boolean;
		x: number;
		y: number;
		type: 'node' | 'edge';
		// ノード用
		label?: string;
		host?: string;
		// エッジ用
		source?: string;
		target?: string;
		relation?: 'federation' | 'blocked' | 'suspended' | 'connectivity-ok' | 'connectivity-ng' | 'connectivity-partial';
		isMutual?: boolean;
		connectivityError?: string;
		// 疎通チェック詳細（各方向の状態）
		forwardOk?: boolean;
		backwardOk?: boolean;
		forwardError?: string;
		backwardError?: string;
	}>({
		visible: false,
		x: 0,
		y: 0,
		type: 'node'
	});

	// 視点サーバー間の疎通状況
	let connectivityResults = $state<Map<string, {
		reachable: boolean;
		error?: string;
		latency?: number;
	}>>(new Map());
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
			const cyInstance = cy;
			cy = null; // 先にnullにして他の処理がアクセスしないようにする
			try {
				// 全てのアニメーションとレイアウトを停止
				cyInstance.stop(true, true);
				// イベントリスナーを全て削除
				cyInstance.removeAllListeners();
				// 破棄
				cyInstance.destroy();
			} catch {
				// 破棄中のエラーは無視
			}
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

	// 視点サーバー間の疎通チェック
	async function checkViewpointConnectivity() {
		if (viewpointServers.length < 2) return;

		// 視点サーバー間の全ペアをチェック
		const pairs: { source: string; target: string }[] = [];
		for (let i = 0; i < viewpointServers.length; i++) {
			for (let j = i + 1; j < viewpointServers.length; j++) {
				pairs.push({
					source: viewpointServers[i],
					target: viewpointServers[j]
				});
			}
		}

		// 並列で実行
		const results = await Promise.all(
			pairs.map(async ({ source, target }) => {
				try {
					const res = await fetch('/api/connectivity', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ source, target, bidirectional: true })
					});

					if (!res.ok) {
						return {
							source,
							target,
							forward: { reachable: false, error: 'API_ERROR' },
							backward: { reachable: false, error: 'API_ERROR' }
						};
					}

					const data = await res.json();
					return { source, target, forward: data.forward, backward: data.backward };
				} catch {
					return {
						source,
						target,
						forward: { reachable: false, error: 'FETCH_FAILED' },
						backward: { reachable: false, error: 'FETCH_FAILED' }
					};
				}
			})
		);

		// 結果をマップに格納
		const newResults = new Map<string, { reachable: boolean; error?: string; latency?: number }>();
		for (const result of results) {
			newResults.set(`${result.source}->${result.target}`, {
				reachable: result.forward.reachable,
				error: result.forward.error,
				latency: result.forward.latency
			});
			newResults.set(`${result.target}->${result.source}`, {
				reachable: result.backward.reachable,
				error: result.backward.error,
				latency: result.backward.latency
			});
		}
		connectivityResults = newResults;

		// グラフに疎通エッジを追加
		addConnectivityEdges();
	}

	// 疎通チェック結果をグラフに反映
	function addConnectivityEdges() {
		if (!cy || viewpointServers.length < 2) return;

		// 既存の疎通エッジを削除
		cy.elements('edge[?isConnectivity]').remove();

		// 視点サーバー間の疎通エッジを追加
		const connectivityEdges: Array<{ data: Record<string, unknown> }> = [];

		for (let i = 0; i < viewpointServers.length; i++) {
			for (let j = i + 1; j < viewpointServers.length; j++) {
				const hostA = viewpointServers[i];
				const hostB = viewpointServers[j];

				const forwardResult = connectivityResults.get(`${hostA}->${hostB}`);
				const backwardResult = connectivityResults.get(`${hostB}->${hostA}`);

				if (!forwardResult && !backwardResult) continue;

				const forwardOk = forwardResult?.reachable ?? false;
				const backwardOk = backwardResult?.reachable ?? false;
				const isMutualOk = forwardOk && backwardOk;

				// 疎通状態に応じた色
				let edgeColor: string;
				if (isMutualOk) {
					edgeColor = '#00d9ff'; // シアン: 相互疎通OK
				} else if (forwardOk || backwardOk) {
					edgeColor = '#ffaa00'; // オレンジ: 片方向のみ
				} else {
					edgeColor = '#a855f7'; // 紫: 疎通NG
				}

				connectivityEdges.push({
					data: {
						id: `connectivity-${hostA}-${hostB}`,
						source: hostA,
						target: hostB,
						weight: 4,
						color: edgeColor,
						opacity: 0.7,
						isConnectivity: true,
						isMutualOk,
						forwardOk,
						backwardOk,
						forwardError: forwardResult?.error,
						backwardError: backwardResult?.error
					}
				});
			}
		}

		if (connectivityEdges.length > 0) {
			cy.add(connectivityEdges);
		}
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

	// エッジ表示設定を適用する関数
	function applyEdgeVisibility() {
		if (!cy || isDestroying) return;

		const { showFederation, showBlocked, showSuspended, showConnectivityOk, showConnectivityNg } = edgeVisibility;

		try {
			// 通常の連合エッジの表示/非表示（isFederationがtrueでisBlocked/isSuspendedがfalse）
			const federationEdges = cy.edges('[?isFederation][!isBlocked][!isSuspended]');
			federationEdges.style('display', showFederation ? 'element' : 'none');

			// ブロックエッジの表示/非表示
			const blockedEdges = cy.edges('[?isBlocked][!isSuspended]');
			blockedEdges.style('display', showBlocked ? 'element' : 'none');

			// 配信停止エッジの表示/非表示
			const suspendedEdges = cy.edges('[?isSuspended]');
			suspendedEdges.style('display', showSuspended ? 'element' : 'none');

			// 疎通エッジの表示/非表示（OK/NGそれぞれ）
			const connectivityEdges = cy.edges('[?isConnectivity]');
			connectivityEdges.forEach((edge: import('cytoscape').EdgeSingular) => {
				const isMutualOk = edge.data('isMutualOk');
				if (isMutualOk) {
					// 疎通OK（両方向OK）
					edge.style('display', showConnectivityOk ? 'element' : 'none');
				} else {
					// 疎通NG（片方向のみ or 両方NG）
					edge.style('display', showConnectivityNg ? 'element' : 'none');
				}
			});

			// 孤立ノード（表示中のエッジが0のノード）を非表示にする
			cy.nodes().forEach((node: import('cytoscape').NodeSingular) => {
				// このノードに接続している表示中のエッジをカウント
				const visibleEdges = node.connectedEdges().filter((edge: import('cytoscape').EdgeSingular) => {
					return edge.style('display') !== 'none';
				});
				// 表示中のエッジがなければノードを非表示
				node.style('display', visibleEdges.length > 0 ? 'element' : 'none');
			});
		} catch (e) {
			// Cytoscapeが破棄されている可能性があるため、エラーは無視
			console.warn('Failed to update edge visibility:', e);
		}
	}

	// edgeVisibilityが変更されたらエッジの表示/非表示を切り替え
	$effect(() => {
		// 明示的に各プロパティを参照して依存関係を作成
		const _showFed = edgeVisibility.showFederation;
		const _showBlk = edgeVisibility.showBlocked;
		const _showSus = edgeVisibility.showSuspended;
		const _showCok = edgeVisibility.showConnectivityOk;
		const _showCng = edgeVisibility.showConnectivityNg;

		if (cy && !isDestroying) {
			applyEdgeVisibility();
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
					isFederation: true,
					isBlocked: false,
					isSuspended: false
				}
			};
		});

		// ブロック/サスペンド関係のエッジを追加（相互ブロックを検出してまとめる）
		const blockedEdges: Array<{ data: Record<string, unknown> }> = [];

		// まず全ブロック関係をマップに整理
		const blockRelationMap = new Map<string, {
			forward: boolean;  // A→B方向
			backward: boolean; // B→A方向
			isBlocked: boolean;
			isSuspended: boolean;
		}>();

		for (const fed of blockedFederations) {
			const sourceAllowed = serverHosts.has(fed.sourceHost) || viewpointHosts.has(fed.sourceHost);
			const targetAllowed = serverHosts.has(fed.targetHost) || viewpointHosts.has(fed.targetHost);
			if (!sourceAllowed || !targetAllowed) continue;

			// キーを正規化（アルファベット順でソート）
			const [hostA, hostB] = fed.sourceHost < fed.targetHost
				? [fed.sourceHost, fed.targetHost]
				: [fed.targetHost, fed.sourceHost];
			const key = `${hostA}-${hostB}`;

			const existing = blockRelationMap.get(key) || {
				forward: false,
				backward: false,
				isBlocked: false,
				isSuspended: false
			};

			// A→B方向かB→A方向かを記録
			if (fed.sourceHost < fed.targetHost) {
				existing.forward = true;
			} else {
				existing.backward = true;
			}
			existing.isBlocked = existing.isBlocked || fed.isBlocked;
			existing.isSuspended = existing.isSuspended || fed.isSuspended;

			blockRelationMap.set(key, existing);
		}

		// マップからエッジを生成
		for (const [key, relation] of blockRelationMap) {
			const [hostA, hostB] = key.split('-');
			const isMutual = relation.forward && relation.backward;
			const edgeColor = relation.isSuspended ? '#ffa502' : '#ff4757';

			blockedEdges.push({
				data: {
					id: `blocked-${key}`,
					source: relation.forward ? hostA : hostB,
					target: relation.forward ? hostB : hostA,
					weight: 3,
					color: edgeColor,
					opacity: 0.8,
					isBlocked: relation.isBlocked,
					isSuspended: relation.isSuspended,
					isMutual // 相互ブロックかどうか
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
		// 視点サーバーは必ず表示（連合情報を公開していなくても他サーバーとの関係で表示）
		for (const host of viewpointServers) {
			if (serverHosts.has(host)) {
				connectedHosts.add(host);
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
			const isPrivate = privateServers.has(host);
			// 非公開サーバーには鍵マークを追加
			const displayLabel = isPrivate ? `🔒 ${label}` : label;
			nodes.push({
				data: {
					id: host,
					label: displayLabel,
					size,
					repositoryUrl,
					color: getRepositoryColor(repositoryUrl),
					iconUrl,
					hasIcon,
					isViewpoint,
					isPrivate
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
					// 相互ブロック: 両端に矢印
					selector: 'edge[?isMutual]',
					style: {
						'source-arrow-shape': 'triangle',
						'source-arrow-color': 'data(color)'
					}
				},
				{
					// 疎通チェックエッジ: 点線スタイル
					selector: 'edge[?isConnectivity]',
					style: {
						'line-style': 'dotted',
						'line-dash-pattern': [2, 4],
						'target-arrow-shape': 'triangle',
						'target-arrow-color': 'data(color)',
						'source-arrow-shape': 'triangle',
						'source-arrow-color': 'data(color)',
						'arrow-scale': 1,
						'curve-style': 'bezier',
						'z-index': 1000 // 最前面に表示
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
			if (evt.target === cy) {
				if (selectedNode) {
					unhighlightNode(selectedNode);
					selectedNode = null;
				}
				onClearSelection?.();
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
				type: 'node',
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

		// エッジのマウスホバーでツールチップ表示
		cy.on('mouseover', 'edge', (evt) => {
			const edge = evt.target;
			const sourceId = edge.data('source');
			const targetId = edge.data('target');
			const isBlocked = edge.data('isBlocked');
			const isSuspended = edge.data('isSuspended');
			const isConnectivity = edge.data('isConnectivity') || false;
			const isMutual = edge.data('isMutual') || false;
			const isMutualOk = edge.data('isMutualOk') || false;
			const forwardOk = edge.data('forwardOk');
			const backwardOk = edge.data('backwardOk');
			const forwardError = edge.data('forwardError');
			const backwardError = edge.data('backwardError');

			// 関係の種類を判定
			let relation: 'federation' | 'blocked' | 'suspended' | 'connectivity-ok' | 'connectivity-ng' | 'connectivity-partial' = 'federation';
			let connectivityError: string | undefined;

			if (isConnectivity) {
				if (isMutualOk) {
					relation = 'connectivity-ok';
				} else if (forwardOk || backwardOk) {
					// 片方だけOK
					relation = 'connectivity-partial';
				} else {
					relation = 'connectivity-ng';
				}
			} else if (isSuspended) {
				relation = 'suspended';
			} else if (isBlocked) {
				relation = 'blocked';
			}

			// エッジの中点を計算
			const sourceNode = cy?.getElementById(sourceId);
			const targetNode = cy?.getElementById(targetId);
			if (sourceNode && targetNode) {
				const sourcePos = sourceNode.renderedPosition();
				const targetPos = targetNode.renderedPosition();
				const midX = (sourcePos.x + targetPos.x) / 2;
				const midY = (sourcePos.y + targetPos.y) / 2;

				tooltip = {
					visible: true,
					x: midX,
					y: midY - 10,
					type: 'edge',
					source: sourceId,
					target: targetId,
					relation,
					isMutual: isMutual || isMutualOk,
					connectivityError,
					// 疎通チェック詳細
					forwardOk: isConnectivity ? forwardOk : undefined,
					backwardOk: isConnectivity ? backwardOk : undefined,
					forwardError: isConnectivity ? forwardError : undefined,
					backwardError: isConnectivity ? backwardError : undefined
				};
			}

			// エッジをハイライト
			edge.style({
				'line-color': 'rgba(255, 255, 255, 0.9)',
				opacity: 1
			});
		});

		cy.on('mouseout', 'edge', (evt) => {
			const edge = evt.target;
			// エッジを元に戻す
			edge.style({
				'line-color': edge.data('color'),
				opacity: edge.data('opacity')
			});
			// ツールチップ非表示
			tooltip.visible = false;
		});

		// エッジタップで選択
		cy.on('tap', 'edge', (evt) => {
			const edge = evt.target;
			const sourceId = edge.data('source');
			const targetId = edge.data('target');

			// 前のノード選択を解除
			if (selectedNode) {
				unhighlightNode(selectedNode);
				selectedNode = null;
			}

			// エッジ選択を通知
			onSelectEdge?.(sourceId, targetId);
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
			// 視点サーバー間の疎通チェックを開始
			checkViewpointConnectivity();

			// 初期選択があればハイライトして情報を表示
			if (initialSelection && cy) {
				if (initialSelection.type === 'node') {
					// ノード選択
					const node = cy.getElementById(initialSelection.value);
					if (node.length > 0) {
						highlightNode(node);
						selectedNode = node;

						// ノードの位置を計算してサーバー情報を表示
						const renderedPos = node.renderedPosition();
						const containerRect = container.getBoundingClientRect();
						const position = {
							x: containerRect.left + renderedPos.x,
							y: containerRect.top + renderedPos.y
						};

						const serverInfo = serverInfoMap.get(initialSelection.value);
						if (serverInfo) {
							onSelectServer?.(serverInfo, position);
						} else {
							// 未知のサーバーの場合は最小限の情報を作成
							onSelectServer?.({
								host: initialSelection.value,
								name: initialSelection.value,
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
				} else if (initialSelection.type === 'edge') {
					// エッジ選択: "hostA..hostB" 形式
					const [hostA, hostB] = initialSelection.value.split('..');
					if (hostA && hostB) {
						// エッジIDを試す（両方向）
						let edge = cy.getElementById(`${hostA}-${hostB}`);
						if (edge.length === 0) {
							edge = cy.getElementById(`${hostB}-${hostA}`);
						}
						// ブロック関係のエッジも試す
						if (edge.length === 0) {
							edge = cy.getElementById(`blocked-${hostA}-${hostB}`);
						}
						if (edge.length === 0) {
							edge = cy.getElementById(`blocked-${hostB}-${hostA}`);
						}

						if (edge.length > 0) {
							// エッジをハイライト
							edge.style({
								'line-color': 'rgba(255, 255, 255, 0.9)',
								opacity: 1
							});
							// エッジ選択を通知
							onSelectEdge?.(hostA, hostB);
						}
					}
				}
			}
		});
	}
</script>

<div class="graph-wrapper">
	<!-- ツールチップ -->
	{#if tooltip.visible}
		<div
			class="graph-tooltip"
			class:edge-tooltip={tooltip.type === 'edge'}
			class:blocked={tooltip.relation === 'blocked'}
			class:suspended={tooltip.relation === 'suspended'}
			class:connectivity-ok={tooltip.relation === 'connectivity-ok'}
			class:connectivity-partial={tooltip.relation === 'connectivity-partial'}
			class:connectivity-ng={tooltip.relation === 'connectivity-ng'}
			style="left: {tooltip.x}px; top: {tooltip.y}px;"
		>
			{#if tooltip.type === 'node'}
				<span class="tooltip-label">{tooltip.label}</span>
				<span class="tooltip-host">{tooltip.host}</span>
			{:else}
				<div class="edge-relation">
					{#if tooltip.relation === 'blocked'}
						<span class="relation-icon">🚫</span>
						<span class="relation-text">{tooltip.isMutual ? '相互ブロック' : 'ブロック'}</span>
					{:else if tooltip.relation === 'suspended'}
						<span class="relation-icon">⏸️</span>
						<span class="relation-text">{tooltip.isMutual ? '相互配信停止' : '配信停止'}</span>
					{:else if tooltip.relation === 'connectivity-ok'}
						<span class="relation-icon">✓</span>
						<span class="relation-text">相互疎通OK</span>
					{:else if tooltip.relation === 'connectivity-partial'}
						<span class="relation-icon">△</span>
						<span class="relation-text">片方向のみ疎通</span>
					{:else if tooltip.relation === 'connectivity-ng'}
						<span class="relation-icon">✗</span>
						<span class="relation-text">相互疎通NG</span>
					{:else}
						<span class="relation-icon">🔗</span>
						<span class="relation-text">連合</span>
					{/if}
				</div>
				{#if tooltip.relation?.startsWith('connectivity')}
					<!-- 疎通チェックは各方向の詳細を表示 -->
					<div class="connectivity-details">
						<div class="connectivity-direction">
							<span class="direction-hosts">{tooltip.source} → {tooltip.target}</span>
							{#if tooltip.forwardOk}
								<span class="direction-status ok">OK</span>
							{:else}
								<span class="direction-status ng">NG</span>
								{#if tooltip.forwardError}
									<span class="direction-error">({tooltip.forwardError})</span>
								{/if}
							{/if}
						</div>
						<div class="connectivity-direction">
							<span class="direction-hosts">{tooltip.target} → {tooltip.source}</span>
							{#if tooltip.backwardOk}
								<span class="direction-status ok">OK</span>
							{:else}
								<span class="direction-status ng">NG</span>
								{#if tooltip.backwardError}
									<span class="direction-error">({tooltip.backwardError})</span>
								{/if}
							{/if}
						</div>
					</div>
				{:else}
					<div class="edge-hosts">
						<span class="edge-source">{tooltip.source}</span>
						<span class="edge-arrow">{tooltip.relation === 'federation' || tooltip.isMutual ? '↔' : '→'}</span>
						<span class="edge-target">{tooltip.target}</span>
					</div>
				{/if}
			{/if}
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
		<div class="legend-item legend-suspended"><span class="legend-key">橙破線</span><span class="legend-val">配信停止</span></div>
		<div class="legend-item legend-connectivity-ok"><span class="legend-key">青点線</span><span class="legend-val">疎通OK</span></div>
		<div class="legend-item legend-connectivity-ng"><span class="legend-key">紫点線</span><span class="legend-val">疎通NG</span></div>
		<div class="legend-item"><span class="legend-key">🔒</span><span class="legend-val">連合非公開</span></div>
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

	/* グラフツールチップ */
	.graph-tooltip {
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

	/* エッジツールチップのスタイル */
	.graph-tooltip.edge-tooltip {
		gap: 0.25rem;
		padding: 0.5rem 0.75rem;
	}

	.graph-tooltip.edge-tooltip.blocked {
		border-color: rgba(255, 71, 87, 0.5);
		background: rgba(255, 71, 87, 0.15);
	}

	.graph-tooltip.edge-tooltip.suspended {
		border-color: rgba(255, 165, 2, 0.5);
		background: rgba(255, 165, 2, 0.15);
	}

	.graph-tooltip.edge-tooltip.connectivity-ok {
		border-color: rgba(0, 217, 255, 0.5);
		background: rgba(0, 217, 255, 0.15);
	}

	.graph-tooltip.edge-tooltip.connectivity-ng {
		border-color: rgba(168, 85, 247, 0.5);
		background: rgba(168, 85, 247, 0.15);
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

	/* エッジツールチップの内容 */
	.edge-relation {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.relation-icon {
		font-size: 0.9rem;
	}

	.relation-text {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--fg-primary);
	}

	.graph-tooltip.blocked .relation-text {
		color: #ff6b6b;
	}

	.graph-tooltip.suspended .relation-text {
		color: #ffbe76;
	}

	.graph-tooltip.connectivity-ok .relation-text {
		color: #00d9ff;
	}

	.graph-tooltip.connectivity-ok .relation-icon {
		color: #00d9ff;
	}

	.graph-tooltip.connectivity-ng .relation-text {
		color: #c084fc;
	}

	.graph-tooltip.connectivity-ng .relation-icon {
		color: #c084fc;
	}

	/* 片方向疎通（オレンジ） */
	.graph-tooltip.edge-tooltip.connectivity-partial {
		border-color: rgba(255, 170, 0, 0.5);
		background: rgba(255, 170, 0, 0.15);
	}

	.graph-tooltip.connectivity-partial .relation-text {
		color: #ffaa00;
	}

	.graph-tooltip.connectivity-partial .relation-icon {
		color: #ffaa00;
	}

	/* 疎通詳細（各方向の状態） */
	.connectivity-details {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-top: 0.25rem;
		padding-top: 0.25rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.connectivity-direction {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.65rem;
	}

	.direction-hosts {
		color: var(--fg-secondary);
		min-width: 8rem;
	}

	.direction-status {
		font-weight: 600;
		padding: 0.0625rem 0.25rem;
		border-radius: 2px;
	}

	.direction-status.ok {
		color: #00d9ff;
		background: rgba(0, 217, 255, 0.15);
	}

	.direction-status.ng {
		color: #c084fc;
		background: rgba(168, 85, 247, 0.15);
	}

	.direction-error {
		font-size: 0.55rem;
		color: var(--fg-muted);
	}

	.connectivity-error {
		font-size: 0.6rem;
		color: var(--fg-muted);
		margin-top: 0.125rem;
	}

	.edge-hosts {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.65rem;
	}

	.edge-source,
	.edge-target {
		color: var(--fg-secondary);
	}

	.edge-arrow {
		color: var(--fg-muted);
	}

	.graph-tooltip.blocked .edge-arrow {
		color: #ff6b6b;
	}

	.graph-tooltip.suspended .edge-arrow {
		color: #ffbe76;
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

	.legend-suspended .legend-key {
		color: #ffa502;
	}

	.legend-suspended .legend-val {
		color: #ffbe76;
	}

	.legend-connectivity-ok .legend-key {
		color: #00d9ff;
	}

	.legend-connectivity-ok .legend-val {
		color: #66e5ff;
	}

	.legend-connectivity-ng .legend-key {
		color: #a855f7;
	}

	.legend-connectivity-ng .legend-val {
		color: #c084fc;
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
