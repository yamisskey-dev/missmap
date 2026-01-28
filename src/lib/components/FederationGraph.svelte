<script lang="ts">
	import { onMount } from 'svelte';
	import type { ServerInfo } from '$lib/collector';
	import { getRepositoryColor, blendColors } from '$lib/collector';
	import { DEFAULT_EDGE_VISIBILITY, type EdgeVisibility } from '$lib/types';

	// Cytoscapeの動的インポートをメモ化（パフォーマンス最適化）
	let cytoscapePromise: Promise<typeof import('cytoscape').default> | null = null;
	async function getCytoscape() {
		if (!cytoscapePromise) {
			cytoscapePromise = import('cytoscape').then(m => m.default);
		}
		return cytoscapePromise;
	}

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
		userHost = '',
		edgeVisibility = DEFAULT_EDGE_VISIBILITY,
		initialSelection = null,
		onSelectServer,
		onSelectEdge,
		onClearSelection,
		onReady
	}: {
		servers: ServerInfo[];
		federations: Federation[];
		focusHost?: string;
		viewpointServers?: string[];
		privateServers?: Set<string>;
		userHost?: string;
		edgeVisibility?: EdgeVisibility;
		initialSelection?: { type: 'node' | 'edge'; value: string } | null;
		onSelectServer?: (server: ServerInfo | null, position: { x: number; y: number } | null) => void;
		onSelectEdge?: (sourceHost: string, targetHost: string) => void;
		onClearSelection?: () => void;
		onReady?: (exportFn: () => Promise<string | null>) => void;
	} = $props();

	// グラフをPNG画像としてエクスポート（凡例付き）
	// Cloudflare Workers互換のため、画像サイズを制限
	async function exportGraphImage(): Promise<string | null> {
		if (!cy) return null;
		try {
			const bgColor = '#130e26';
			const scale = 1; // CF Workers対応: サイズ削減

			// Cytoscapeグラフを画像として取得
			const graphDataUrl = cy.png({
				output: 'base64uri',
				bg: bgColor,
				full: false,
				scale,
				maxWidth: 1200, // CF Workers対応: サイズ削減
				maxHeight: 900  // CF Workers対応: サイズ削減
			});

			// Canvas上でグラフと凡例を合成
			const img = new Image();
			img.src = graphDataUrl;

			// 同期的に処理するため、canvasを直接作成
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			if (!ctx) return graphDataUrl;

			// コンテナサイズを基準にキャンバスサイズを決定
			const graphWidth = container?.clientWidth ? container.clientWidth * scale : 1200;
			const graphHeight = container?.clientHeight ? container.clientHeight * scale : 800;
			const legendHeight = 80 * scale;
			const padding = 16 * scale;

			canvas.width = graphWidth;
			canvas.height = graphHeight + legendHeight;

			// 背景を塗りつぶし
			ctx.fillStyle = bgColor;
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			// グラフ画像を描画（同期的に処理）
			// base64を直接描画するため、Image.onloadを待つ必要がある
			return new Promise<string | null>((resolve) => {
				img.onload = () => {
					// グラフを上部に描画
					ctx.drawImage(img, 0, 0, graphWidth, graphHeight);

					// 凡例の背景
					const legendY = graphHeight;
					ctx.fillStyle = 'rgba(10, 10, 20, 0.85)';
					ctx.fillRect(0, legendY, canvas.width, legendHeight);

					// 凡例の上部ボーダー
					ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
					ctx.lineWidth = 1 * scale;
					ctx.beginPath();
					ctx.moveTo(0, legendY);
					ctx.lineTo(canvas.width, legendY);
					ctx.stroke();

					// フォント設定
					const fontSize = 11 * scale;
					const smallFontSize = 10 * scale;
					ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
					ctx.textBaseline = 'middle';

					// 凡例アイテムの描画
					const items = [
						{ type: 'dot', color: '#86b300', key: '色', val: 'ソフトウェア' },
						{ type: 'size', color: '#86b300', key: '大きさ', val: 'ユーザー数' },
						{ type: 'line', color: 'rgba(255,255,255,0.4)', key: '線の太さ', val: 'やり取り量' },
						{ type: 'center', color: 'rgba(255,255,255,0.8)', key: '中心', val: '繋がり多' },
						{ type: 'dashed', color: '#f87171', key: '赤破線', val: 'ブロック' },
						{ type: 'dashed', color: '#fb923c', key: '橙破線', val: '配信停止' },
						{ type: 'dotted', color: '#60a5fa', key: '青点線', val: '疎通OK' },
						{ type: 'dotted', color: '#a78bfa', key: '紫点線', val: '疎通NG' },
						{ type: 'emoji', emoji: '🔒', val: '連合非公開' }
					];

					let x = padding;
					const y = legendY + legendHeight / 2;
					const itemGap = 24 * scale;

					for (const item of items) {
						// アイコン/線を描画
						if (item.type === 'dot') {
							ctx.beginPath();
							ctx.arc(x + 6 * scale, y, 5 * scale, 0, Math.PI * 2);
							ctx.fillStyle = item.color!;
							ctx.fill();
							x += 16 * scale;
						} else if (item.type === 'size') {
							// 大小のドット
							ctx.beginPath();
							ctx.arc(x + 4 * scale, y, 3 * scale, 0, Math.PI * 2);
							ctx.fillStyle = 'rgba(255,255,255,0.5)';
							ctx.fill();
							ctx.beginPath();
							ctx.arc(x + 12 * scale, y, 5 * scale, 0, Math.PI * 2);
							ctx.fillStyle = 'rgba(255,255,255,0.7)';
							ctx.fill();
							x += 20 * scale;
						} else if (item.type === 'line') {
							ctx.strokeStyle = item.color!;
							ctx.lineWidth = 2 * scale;
							ctx.beginPath();
							ctx.moveTo(x, y);
							ctx.lineTo(x + 16 * scale, y);
							ctx.stroke();
							x += 20 * scale;
						} else if (item.type === 'center') {
							ctx.beginPath();
							ctx.arc(x + 6 * scale, y, 5 * scale, 0, Math.PI * 2);
							const gradient = ctx.createRadialGradient(
								x + 6 * scale, y, 0,
								x + 6 * scale, y, 5 * scale
							);
							gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
							gradient.addColorStop(1, 'rgba(255,255,255,0.3)');
							ctx.fillStyle = gradient;
							ctx.fill();
							x += 16 * scale;
						} else if (item.type === 'dashed') {
							ctx.strokeStyle = item.color!;
							ctx.lineWidth = 2 * scale;
							ctx.setLineDash([4 * scale, 2 * scale]);
							ctx.beginPath();
							ctx.moveTo(x, y);
							ctx.lineTo(x + 16 * scale, y);
							ctx.stroke();
							ctx.setLineDash([]);
							x += 20 * scale;
						} else if (item.type === 'dotted') {
							ctx.strokeStyle = item.color!;
							ctx.lineWidth = 2 * scale;
							ctx.setLineDash([2 * scale, 3 * scale]);
							ctx.beginPath();
							ctx.moveTo(x, y);
							ctx.lineTo(x + 16 * scale, y);
							ctx.stroke();
							ctx.setLineDash([]);
							x += 20 * scale;
						} else if (item.type === 'emoji') {
							ctx.font = `${fontSize}px serif`;
							ctx.fillStyle = '#fff';
							ctx.fillText(item.emoji!, x, y);
							x += 18 * scale;
							ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
						}

						// テキストを描画
						if (item.key) {
							ctx.fillStyle = 'rgba(255,255,255,0.6)';
							ctx.font = `${smallFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
							ctx.fillText(item.key, x, y);
							x += ctx.measureText(item.key).width + 4 * scale;
						}

						ctx.fillStyle = 'rgba(255,255,255,0.85)';
						ctx.font = `${smallFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
						ctx.fillText(item.val, x, y);
						x += ctx.measureText(item.val).width + itemGap;
					}

					// JPEG形式で圧縮（CF Workers対応: サイズ削減）
					resolve(canvas.toDataURL('image/jpeg', 0.85));
				};

				img.onerror = () => {
					// 画像読み込み失敗時は元の画像を返す
					resolve(graphDataUrl);
				};
			});
		} catch (error) {
			console.error('Failed to export graph image:', error);
			return null;
		}
	}

	let container: HTMLDivElement;
	let cy = $state<import('cytoscape').Core | null>(null);

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
	let isLayoutRunning = $state(false);
	let focusHighlightTimeout: ReturnType<typeof setTimeout> | null = null;
	let currentFocusedNode: import('cytoscape').NodeSingular | null = null;

	let prevServersLength = 0;
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

	// viewportイベントのスロットリング用
	let viewportThrottleId: number | null = null;

	// initGraphのデバウンス用
	let initGraphTimeoutId: ReturnType<typeof setTimeout> | null = null;
	const INIT_GRAPH_DEBOUNCE_MS = 100;

	// checkViewpointConnectivityのデバウンス用
	let connectivityCheckTimeoutId: ReturnType<typeof setTimeout> | null = null;
	const CONNECTIVITY_CHECK_DEBOUNCE_MS = 300;

	// コンテナイベントリスナーのクリーンアップ用
	let containerListenerCleanups: Array<() => void> = [];

	function destroyCy() {
		if (cy && !isDestroying) {
			isDestroying = true;
			isLayoutRunning = false; // レイアウトフラグもリセット
			const cyInstance = cy;
			cy = null; // 先にnullにして他の処理がアクセスしないようにする

			// コンテナイベントリスナーをクリーンアップ
			for (const cleanup of containerListenerCleanups) {
				try {
					cleanup();
				} catch {
					// クリーンアップ中のエラーは無視
				}
			}
			containerListenerCleanups = [];

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
		if (!cy || isDestroying || viewpointServers.length < 2) return;

		try {
			// 既存の疎通エッジを削除
			cy.elements('edge[?isConnectivity]').remove();
		} catch (e) {
			// グラフが破棄中の場合はエラーを無視
			console.debug('Error removing connectivity edges:', e);
			return;
		}

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
			try {
				cy.add(connectivityEdges);
			} catch (e) {
				// グラフが破棄中の場合はエラーを無視
				console.debug('Error adding connectivity edges:', e);
			}
		}
	}

	onMount(() => {
		prevServersLength = servers.length;
		prevFocusHost = focusHost;

		// 初期化時のハッシュを設定
		prevFederationHash = federations
			.map(f => `${f.sourceHost}-${f.targetHost}`)
			.sort()
			.join('|');

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
			if (focusTimeoutId) {
				clearTimeout(focusTimeoutId);
			}
			if (viewportThrottleId !== null) {
				cancelAnimationFrame(viewportThrottleId);
			}
			if (initGraphTimeoutId) {
				clearTimeout(initGraphTimeoutId);
			}
			if (connectivityCheckTimeoutId) {
				clearTimeout(connectivityCheckTimeoutId);
			}
			stopInertia();
			destroyCy();
		};
	});

	// 連合データの内容を表すハッシュを生成（配列の長さだけでなく中身も考慮）
	let prevFederationHash = '';

	// デバウンス付きinitGraph
	function debouncedInitGraph() {
		if (initGraphTimeoutId) {
			clearTimeout(initGraphTimeoutId);
		}
		initGraphTimeoutId = setTimeout(() => {
			initGraphTimeoutId = null;
			destroyCy();
			initGraph();
		}, INIT_GRAPH_DEBOUNCE_MS);
	}

	// デバウンス付き疎通チェック
	function debouncedCheckConnectivity() {
		if (connectivityCheckTimeoutId) {
			clearTimeout(connectivityCheckTimeoutId);
		}
		connectivityCheckTimeoutId = setTimeout(() => {
			connectivityCheckTimeoutId = null;
			checkViewpointConnectivity();
		}, CONNECTIVITY_CHECK_DEBOUNCE_MS);
	}

	// サーバー/連合データが変更されたらグラフを再描画
	// viewpointServers変更時はグラフ全体を再描画せず、ハイライトのみ更新
	$effect(() => {
		const serversChanged = servers.length !== prevServersLength;

		// 連合データの内容ハッシュを生成（sourceHost-targetHostのセットで判定）
		// パフォーマンス最適化: 配列を直接結合せず、Set経由で重複除去
		const fedSet = new Set<string>();
		for (const f of federations) {
			fedSet.add(`${f.sourceHost}-${f.targetHost}`);
		}
		const currentFederationHash = Array.from(fedSet).sort().join('|');
		const federationsChanged = currentFederationHash !== prevFederationHash;

		if ((serversChanged || federationsChanged) && container) {
			prevServersLength = servers.length;
			prevFederationHash = currentFederationHash;

			// データ変更時のみ再描画（デバウンス付き）
			debouncedInitGraph();
		}
	});

	// 視点サーバー変更時はハイライトのみ更新（グラフ再描画なし）
	let prevViewpointHash = '';
	$effect(() => {
		// 視点サーバーの変更を検出（JSON.stringify→join比較に最適化）
		const currentHash = viewpointServers.slice().sort().join(',');

		if (currentHash !== prevViewpointHash && cy && !isDestroying) {
			prevViewpointHash = currentHash;

			try {
				// Set化してO(1)ルックアップに最適化
				const viewpointSet = new Set(viewpointServers);

				// バッチ処理でスタイル更新をまとめる
				cy.startBatch();
				cy.nodes().forEach((node: import('cytoscape').NodeSingular) => {
					const isViewpoint = viewpointSet.has(node.id());
					if (isViewpoint) {
						node.data('isViewpoint', true);
						node.style({
							'border-width': 3,
							'border-color': '#86b300',
							'border-style': 'solid'
						});
					} else {
						node.data('isViewpoint', false);
						const nodeColor = node.data('color');
						const borderWidth = node.data('borderWidth');
						node.style({
							'border-width': borderWidth,
							'border-color': nodeColor,
							'border-style': 'solid'
						});
					}
				});
				cy.endBatch();

				// 疎通チェックを再実行（デバウンス付き）
				debouncedCheckConnectivity();
			} catch (e) {
				// グラフが破棄中の場合はエラーを無視
				console.debug('Error updating viewpoint highlights:', e);
			}
		}
	});

	// focusHost用のタイムアウトID
	let focusTimeoutId: ReturnType<typeof setTimeout> | null = null;

	// focusHostが変更されたらカメラ移動＋一時ハイライト
	$effect(() => {
		// focusHostとcyを読み取ることで依存関係を作成
		const currentFocus = focusHost;
		const cyInstance = cy;

		// cyが初期化されていない、またはfocusHostが空の場合はスキップ
		if (!cyInstance || !currentFocus || isDestroying) {
			return;
		}

		// 同じホストでも再フォーカス可能にするため、prevFocusHostが空の場合も実行
		if (currentFocus !== prevFocusHost || prevFocusHost === '') {
			prevFocusHost = currentFocus;

			// 前のフォーカスタイムアウトをキャンセル
			if (focusTimeoutId) {
				clearTimeout(focusTimeoutId);
			}

			// 少し遅延を入れてレイアウト完了を待つ
			focusTimeoutId = setTimeout(() => {
				focusTimeoutId = null;
				if (!isDestroying) {
					focusOnNode(currentFocus);
				}
			}, 150);
		}
	});

	// エッジ表示設定を適用する関数
	function applyEdgeVisibility() {
		if (!cy || isDestroying) return;

		const { showFederation, showBlocked, showSuspended, showConnectivityOk, showConnectivityNg } = edgeVisibility;

		try {
			// バッチ処理でスタイル更新をまとめる（パフォーマンス最適化）
			cy.startBatch();

			// 通常の連合エッジの表示/非表示（isFederationがtrueでisBlocked/isSuspendedがfalse）
			cy.edges('[?isFederation][!isBlocked][!isSuspended]').style('display', showFederation ? 'element' : 'none');

			// ブロックエッジの表示/非表示
			cy.edges('[?isBlocked][!isSuspended]').style('display', showBlocked ? 'element' : 'none');

			// 配信停止エッジの表示/非表示
			cy.edges('[?isSuspended]').style('display', showSuspended ? 'element' : 'none');

			// 疎通エッジの表示/非表示（セレクタで効率化）
			cy.edges('[?isConnectivity][?isMutualOk]').style('display', showConnectivityOk ? 'element' : 'none');
			cy.edges('[?isConnectivity][!isMutualOk]').style('display', showConnectivityNg ? 'element' : 'none');

			// 孤立ノードの処理（表示中のエッジに接続しているノードを収集）
			const visibleEdges = cy.edges().filter((edge: import('cytoscape').EdgeSingular) => {
				return edge.style('display') !== 'none';
			});

			// 表示中のエッジに接続しているノードのIDを収集
			const connectedNodeIds = new Set<string>();
			visibleEdges.forEach((edge: import('cytoscape').EdgeSingular) => {
				connectedNodeIds.add(edge.data('source'));
				connectedNodeIds.add(edge.data('target'));
			});

			// 全ノードの表示/非表示を一括設定
			cy.nodes().forEach((node: import('cytoscape').NodeSingular) => {
				const isConnected = connectedNodeIds.has(node.id());
				node.style('display', isConnected ? 'element' : 'none');
			});

			cy.endBatch();
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
		// 安全性チェック
		if (!cy || isDestroying || isLayoutRunning) return;

		try {
			const node = cy.getElementById(host);
			if (node.length === 0) return;

			// ノードが非表示の場合はスキップ
			if (node.style('display') === 'none') return;

			// 前のハイライトタイマーをクリア
			if (focusHighlightTimeout) {
				clearTimeout(focusHighlightTimeout);
				focusHighlightTimeout = null;
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
				if (!isDestroying) {
					clearFocusHighlight(node);
				}
				currentFocusedNode = null;
			}, 3000);
		} catch (e) {
			// グラフ操作中のエラーは無視
			console.debug('Error focusing on node:', e);
		}
	}

	// フォーカスハイライトを解除
	function clearFocusHighlight(node: import('cytoscape').NodeSingular) {
		if (!cy || isDestroying) return;

		try {
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
		} catch (e) {
			// グラフ操作中のエラーは無視
			console.debug('Error clearing focus highlight:', e);
		}
	}


	async function initGraph() {
		// コンテナが準備されていない場合は中断
		if (!container) {
			console.debug('Container not ready, skipping initGraph');
			return;
		}

		// コンテナがDOMに接続されているか確認
		if (!container.isConnected) {
			console.debug('Container not connected to DOM, skipping initGraph');
			return;
		}

		// コンテナの高さが0の場合は少し待ってリトライ
		if (container.clientHeight === 0) {
			console.debug('Container has no height, will retry');
			setTimeout(() => {
				if (container && container.clientHeight > 0 && !isLayoutRunning) {
					initGraph();
				}
			}, 100);
			return;
		}

		// レイアウト計算中は再実行を防ぐ
		if (isLayoutRunning) {
			console.debug('Layout already running, skipping initGraph');
			return;
		}
		isLayoutRunning = true;

		const cytoscape = await getCytoscape();

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
			hostA: string;
			hostB: string;
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
			const key = `${hostA}|${hostB}`;

			const existing = blockRelationMap.get(key) || {
				hostA,
				hostB,
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
			const { hostA, hostB } = relation;
			const isMutual = relation.forward && relation.backward;
			const edgeColor = relation.isSuspended ? '#ffa502' : '#ff4757';

			blockedEdges.push({
				data: {
					id: `blk_${key.replace(/\./g, '_')}`,
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
				// 12-70pxの範囲にマッピング（コンパクトに）
				size = 12 + normalized * 58;

				label = server.name ?? server.host;
				repositoryUrl = server.repositoryUrl;
				// メディアプロキシ経由でアイコンを取得（CORSを回避）
				// iconUrlがない場合はfaviconをフォールバック
				const originalIconUrl = server.iconUrl || `https://${host}/favicon.ico`;
				iconUrl = proxyIconUrl(originalIconUrl);
				hasIcon = true;
			} else {
				// 未知のサーバー（連合先）- faviconを試す
				size = 10;
				label = host;
				repositoryUrl = null;
				iconUrl = proxyIconUrl(`https://${host}/favicon.ico`);
				hasIcon = true; // faviconがあると仮定
			}

			const isViewpoint = viewpointServers.includes(host);
			const isPrivate = privateServers.has(host);
			const isUserHome = userHost === host;
			// 非公開サーバーには鍵マークを追加、ユーザーのホームには星マークを追加
			let displayLabel = label;
			if (isUserHome) {
				displayLabel = `⭐ ${label}`;
			} else if (isPrivate) {
				displayLabel = `🔒 ${label}`;
			}
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
					isPrivate,
					isUserHome
				}
			});
		}

		// ノードサイズに応じたフォントサイズを計算
		for (const node of nodes) {
			const size = node.data.size as number;
			// サイズに比例したフォントサイズ（6px〜12px）
			node.data.fontSize = Math.min(Math.max(size / 6, 6), 12);
			// ボーダー幅もサイズに応じて
			node.data.borderWidth = Math.min(Math.max(size / 15, 1.5), 4);
		}

		// ローカル変数にcytoscapeインスタンスを保持（TypeScriptのnullチェック対策）
		const cyInstance = cytoscape({
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
					// ユーザーのホームサーバー: ゴールドの特別なスタイル
					selector: 'node[?isUserHome]',
					style: {
						'border-width': 4,
						'border-color': '#ffd700',
						'border-style': 'double',
						'overlay-opacity': 0.15,
						'overlay-color': '#ffd700'
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
				// アニメーション無効化（ローディング画面表示中に計算を完了）
				animate: false,
				// ランダム初期配置
				randomize: true,
				// パディング
				padding: 50,

				// === クラスタリング極限調整 ===

				// ノード反発力（最大化してクラスタ分離を強化）
				nodeRepulsion: (node: { data: (key: string) => number }) => {
					const size = node.data('size') || 30;
					// 基底値を大幅増加、サイズ依存も強化
					return 80000 + (size / 70) * 120000;
				},

				// エッジの理想的な長さ（より極端な非線形スケール）
				idealEdgeLength: (edge: { data: (key: string) => number }) => {
					const weight = edge.data('weight') || 1;
					const normalized = Math.min(1, (weight - 1) / 29);
					// より急峻な曲線（0.3乗）で強い関係を極端に近くする
					const curve = Math.pow(normalized, 0.3);
					// length: 300-15（レンジを拡大、強い関係は極近接）
					return 300 - curve * 285;
				},

				// 重力（弱めてクラスタの自然な広がりを許容）
				gravity: 0.12,

				// === 焼きなまし法パラメータ（収束品質向上） ===

				// 初期温度（高いほど初期探索が広範囲）
				initialTemp: 2000,
				// 冷却係数（1に近いほどゆっくり冷却→より良い解）
				coolingFactor: 0.995,
				// 最小温度（低いほど長く計算→精度向上）
				minTemp: 0.1,

				// イテレーション数（大幅増加）
				numIter: 2500,

				// フィット設定
				fit: true,
				// ノード重複回避（強化）
				nodeOverlap: 30,
				// 分離コンポーネント間の距離（拡大）
				componentSpacing: 120,
				// ネスト係数（クラスタ内密度）
				nestingFactor: 1.2
			},
			// インタラクティブ設定
			minZoom: 0.3,
			maxZoom: 3,
			boxSelectionEnabled: true,
			selectionType: 'single'
		});

		// グローバル変数に代入
		cy = cyInstance;

		// ノードのハイライト関数（宇宙空間のグロー効果）
		function highlightNode(node: import('cytoscape').NodeSingular) {
			const nodeSize = node.data('size') || 30;
			// サイズに応じた強調効果
			node.animate({
				style: {
					'border-width': 5,
					'border-color': '#fff',
					'overlay-opacity': 0.25,
					'width': nodeSize * 1.15,
					'height': nodeSize * 1.15
				},
				duration: 200,
				easing: 'ease-out-cubic'
			});
			// 接続エッジをハイライト（パルス効果）
			node.connectedEdges().animate({
				style: {
					'line-color': 'rgba(255, 255, 255, 0.85)',
					opacity: 1,
					'width': 'mapData(weight, 1, 30, 3, 35)'
				},
				duration: 200,
				easing: 'ease-out-cubic'
			});
		}

		function unhighlightNode(node: import('cytoscape').NodeSingular) {
			const isViewpoint = node.data('isViewpoint');
			const nodeColor = node.data('color');
			const borderWidth = node.data('borderWidth');
			const nodeSize = node.data('size') || 30;

			if (isViewpoint) {
				node.animate({
					style: {
						'border-width': 3,
						'border-color': '#86b300',
						'border-style': 'solid',
						'overlay-opacity': 0,
						'width': nodeSize,
						'height': nodeSize
					},
					duration: 200,
					easing: 'ease-out-cubic'
				});
			} else {
				node.animate({
					style: {
						'border-width': borderWidth,
						'border-color': nodeColor,
						'border-style': 'solid',
						'overlay-opacity': 0,
						'width': nodeSize,
						'height': nodeSize
					},
					duration: 200,
					easing: 'ease-out-cubic'
				});
			}
			// エッジは元に戻す（アニメーション付き）
			node.connectedEdges().forEach((edge: { data: (key: string) => string | number; animate: (opts: Record<string, unknown>) => void }) => {
				edge.animate({
					style: {
						'line-color': edge.data('color'),
						opacity: edge.data('opacity'),
						'width': edge.data('weight')
					},
					duration: 200,
					easing: 'ease-out-cubic'
				});
			});
		}

		// サーバー情報のマップを作成（タップ時に使用）
		const serverInfoMap = new Map(servers.map((s) => [s.host, s]));

		// 現在選択中のノード
		let selectedNode: import('cytoscape').NodeSingular | null = null;

		// タップでサーバー情報表示、選択中に再タップでサーバー遷移
		cyInstance.on('tap', 'node', (evt) => {
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
				// ツールチップも非表示
				tooltip.visible = false;
			} else {
				// 新しいノードをタップ → サーバー情報を表示
				if (selectedNode) {
					unhighlightNode(selectedNode);
				}

				highlightNode(node);
				selectedNode = node;

				// モバイル: タップ時にツールチップも表示
				const renderedPos = node.renderedPosition();
				tooltip = {
					visible: true,
					x: renderedPos.x,
					y: renderedPos.y - node.renderedHeight() / 2 - 8,
					type: 'node',
					label: node.data('label'),
					host: node.id()
				};

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
						ageRestriction: 'unknown',
						dru15: null,
						npd15: null
					}, position);
				}
			}
		});

		// 背景タップで選択解除
		cyInstance.on('tap', (evt) => {
			if (evt.target === cy) {
				if (selectedNode) {
					unhighlightNode(selectedNode);
					selectedNode = null;
				}
				// ツールチップも非表示
				tooltip.visible = false;
				onClearSelection?.();
			}
		});

		// デスクトップ: マウスホバーでもハイライト表示 + ツールチップ
		cyInstance.on('mouseover', 'node', (evt) => {
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

		cyInstance.on('mouseout', 'node', (evt) => {
			if (!selectedNode || selectedNode.id() !== evt.target.id()) {
				unhighlightNode(evt.target);
			}
			// ツールチップ非表示
			tooltip.visible = false;
		});

		// エッジのマウスホバーでツールチップ表示
		cyInstance.on('mouseover', 'edge', (evt) => {
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

		cyInstance.on('mouseout', 'edge', (evt) => {
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
		cyInstance.on('tap', 'edge', (evt) => {
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

			if (isConnectivity) {
				if (isMutualOk) {
					relation = 'connectivity-ok';
				} else if (forwardOk || backwardOk) {
					relation = 'connectivity-partial';
				} else {
					relation = 'connectivity-ng';
				}
			} else if (isSuspended) {
				relation = 'suspended';
			} else if (isBlocked) {
				relation = 'blocked';
			}

			// モバイル: タップ時にエッジツールチップも表示
			const sourcePos = cyInstance.getElementById(sourceId).renderedPosition();
			const targetPos = cyInstance.getElementById(targetId).renderedPosition();
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
				forwardOk: isConnectivity ? forwardOk : undefined,
				backwardOk: isConnectivity ? backwardOk : undefined,
				forwardError: isConnectivity ? forwardError : undefined,
				backwardError: isConnectivity ? backwardError : undefined
			};

			// 前のノード選択を解除
			if (selectedNode) {
				unhighlightNode(selectedNode);
				selectedNode = null;
			}

			// エッジ選択を通知
			onSelectEdge?.(sourceId, targetId);
		});

		// ドラッグは無効化（連合関係の距離感を維持）
		cyInstance.nodes().ungrabify();

		// 宇宙空間の慣性パン + パララックス効果（スロットリング付き）
		cyInstance.on('viewport', () => {
			if (isPanning && cy) {
				// スロットリング: 前回のリクエストがあればスキップ
				if (viewportThrottleId !== null) return;

				viewportThrottleId = requestAnimationFrame(() => {
					viewportThrottleId = null;
					if (!cy || !isPanning) return;

					const pan = cy.pan();
					const deltaX = pan.x - lastPanPosition.x;
					const deltaY = pan.y - lastPanPosition.y;
					panVelocity = { x: deltaX, y: deltaY };
					lastPanPosition = { x: pan.x, y: pan.y };

					// ドラッグ中もパララックス効果
					updateParallax(deltaX, deltaY);
				});
			}
		});

		cyInstance.on('grab', () => {
			stopInertia();
		});

		// パン開始
		const handleMousedown = (e: MouseEvent) => {
			if (e.button === 0) { // 左クリックのみ
				isPanning = true;
				stopInertia();
				if (cy) {
					const pan = cy.pan();
					lastPanPosition = { x: pan.x, y: pan.y };
				}
			}
		};

		const handleTouchstart = () => {
			isPanning = true;
			stopInertia();
			if (cy) {
				const pan = cy.pan();
				lastPanPosition = { x: pan.x, y: pan.y };
			}
		};

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

		// イベントリスナー登録（passiveオプションでパフォーマンス向上）
		container.addEventListener('mousedown', handleMousedown);
		container.addEventListener('touchstart', handleTouchstart, { passive: true });
		container.addEventListener('mouseup', handlePanEnd);
		container.addEventListener('mouseleave', handlePanEnd);
		container.addEventListener('touchend', handlePanEnd, { passive: true });

		// クリーンアップ関数を登録
		containerListenerCleanups.push(
			() => container.removeEventListener('mousedown', handleMousedown),
			() => container.removeEventListener('touchstart', handleTouchstart),
			() => container.removeEventListener('mouseup', handlePanEnd),
			() => container.removeEventListener('mouseleave', handlePanEnd),
			() => container.removeEventListener('touchend', handlePanEnd)
		);

		// animate: false を使用しているため、layoutstop イベントは cytoscape() コンストラクタ内で
		// 同期的に発火する。そのため、イベントリスナー登録後に直接初期化完了処理を呼び出す。
		const handleLayoutComplete = () => {
			// レイアウト計算完了フラグをリセット
			isLayoutRunning = false;

			// レイアウト完了後は全体表示
			if (cy) {
				// シンプルなフィットアニメーション
				cy.animate({
					fit: { eles: cy.elements(), padding: 50 },
					duration: 400,
					easing: 'ease-out-cubic'
				});

				// グラフが準備完了したことを通知（エクスポート機能を渡す）
				onReady?.(exportGraphImage);
			}
			// 視点サーバー間の疎通チェックを開始（デバウンス付き）
			debouncedCheckConnectivity();

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
								ageRestriction: 'unknown',
								dru15: null,
								npd15: null
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
		};

		// animate: false なのでレイアウトは既に完了している。直接初期化完了処理を呼び出す。
		handleLayoutComplete();
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
				<div class="node-tooltip-content">
					<div class="node-info">
						<span class="tooltip-label">{tooltip.label}</span>
						<span class="tooltip-host">{tooltip.host}</span>
					</div>
				</div>
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

	<!-- ローディングオーバーレイ -->
	{#if isLayoutRunning}
		<div class="loading-overlay">
			<div class="loading-content">
				<div class="loading-spinner"></div>
				<div class="loading-text">マップを描画中...</div>
				<div class="loading-bar">
					<div class="loading-bar-fill"></div>
				</div>
			</div>
		</div>
	{/if}

	<!-- 宇宙空間の星（パララックス効果付き） -->
	<div class="stars-layer" bind:this={starsLayer} aria-hidden="true">
		<!-- 通常の星（パフォーマンス最適化: 60→35に削減） -->
		{#each { length: 35 } as _, i}
			{@const starType = i % 5}
			<div
				class="star"
				class:star-accent={starType === 0}
				class:star-purple={starType === 1}
				class:star-bright={starType === 2}
				style="
					left: {Math.random() * 100}%;
					top: {Math.random() * 100}%;
					--size: {0.5 + Math.random() * 2.5}px;
					--delay: {Math.random() * 4}s;
					--duration: {2 + Math.random() * 4}s;
				"
			></div>
		{/each}

		<!-- 宇宙塵/パーティクル（パフォーマンス最適化: 25→12に削減） -->
		{#each { length: 12 } as _, i}
			<div
				class="space-dust"
				style="
					left: {Math.random() * 100}%;
					top: {Math.random() * 100}%;
					--size: {1 + Math.random() * 2}px;
					--drift-x: {-20 + Math.random() * 40}px;
					--drift-y: {-20 + Math.random() * 40}px;
					--delay: {Math.random() * 8}s;
					--duration: {8 + Math.random() * 6}s;
				"
			></div>
		{/each}
	</div>
	<div class="graph" class:hidden={isLayoutRunning} bind:this={container}></div>

	<!-- Graph controls overlay -->
	<div class="graph-controls">
		<button class="control-btn" onclick={() => cy?.animate({ fit: { eles: cy.elements(), padding: 50 }, duration: 400, easing: 'ease-out-cubic' })} title="全体表示" aria-label="グラフ全体を表示">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
			</svg>
		</button>
		<button class="control-btn" onclick={() => cy?.animate({ zoom: cy.zoom() * 1.4, duration: 300, easing: 'ease-out-cubic' })} title="拡大" aria-label="グラフを拡大">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<circle cx="11" cy="11" r="8" />
				<line x1="21" y1="21" x2="16.65" y2="16.65" />
				<line x1="11" y1="8" x2="11" y2="14" />
				<line x1="8" y1="11" x2="14" y2="11" />
			</svg>
		</button>
		<button class="control-btn" onclick={() => cy?.animate({ zoom: cy.zoom() * 0.65, duration: 300, easing: 'ease-out-cubic' })} title="縮小" aria-label="グラフを縮小">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<circle cx="11" cy="11" r="8" />
				<line x1="21" y1="21" x2="16.65" y2="16.65" />
				<line x1="8" y1="11" x2="14" y2="11" />
			</svg>
		</button>
		<button class="control-btn pulse-hint" onclick={() => cy?.animate({ fit: { eles: cy.elements(), padding: 50 }, duration: 500, easing: 'ease-out-cubic' })} title="リセット" aria-label="グラフを全体表示に戻す">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<circle cx="12" cy="12" r="10" />
				<circle cx="12" cy="12" r="3" />
			</svg>
		</button>
	</div>

	<!-- Legend overlay (左下) -->
	<div class="graph-legend">
		<div class="legend-section">
			<div class="legend-item"><span class="legend-dot node-dot"></span><span class="legend-key">色</span><span class="legend-val">ソフトウェア</span></div>
			<div class="legend-item"><span class="legend-dot size-dot"></span><span class="legend-key">大きさ</span><span class="legend-val">ユーザー数</span></div>
			<div class="legend-item"><span class="legend-dot edge-dot"></span><span class="legend-key">線の太さ</span><span class="legend-val">やり取り量</span></div>
			<div class="legend-item"><span class="legend-dot center-dot"></span><span class="legend-key">中心</span><span class="legend-val">繋がり多</span></div>
		</div>
		<div class="legend-divider"></div>
		<div class="legend-section">
			<div class="legend-item legend-blocked"><span class="legend-line blocked-line"></span><span class="legend-key">赤破線</span><span class="legend-val">ブロック</span></div>
			<div class="legend-item legend-suspended"><span class="legend-line suspended-line"></span><span class="legend-key">橙破線</span><span class="legend-val">配信停止</span></div>
			<div class="legend-item legend-connectivity-ok"><span class="legend-line connectivity-ok-line"></span><span class="legend-key">青点線</span><span class="legend-val">疎通OK</span></div>
			<div class="legend-item legend-connectivity-ng"><span class="legend-line connectivity-ng-line"></span><span class="legend-key">紫点線</span><span class="legend-val">疎通NG</span></div>
		</div>
		<div class="legend-divider"></div>
		<div class="legend-section">
			<div class="legend-item"><span class="legend-icon">🔒</span><span class="legend-val">連合非公開</span></div>
		</div>
	</div>
</div>

<style>
	/* ローディングオーバーレイ */
	.loading-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(10, 10, 20, 0.95);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		z-index: 200;
	}

	.loading-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.loading-spinner {
		width: 48px;
		height: 48px;
		border: 3px solid rgba(134, 179, 0, 0.2);
		border-top-color: var(--accent-400, #86b300);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.loading-text {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.8);
		letter-spacing: 0.02em;
	}

	.loading-bar {
		width: 200px;
		height: 4px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		overflow: hidden;
	}

	.loading-bar-fill {
		height: 100%;
		width: 30%;
		background: linear-gradient(90deg, var(--accent-500, #6a8f00), var(--accent-400, #86b300));
		border-radius: 2px;
		animation: loading-bar 1.5s ease-in-out infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes loading-bar {
		0% {
			width: 0%;
			margin-left: 0%;
		}
		50% {
			width: 60%;
			margin-left: 20%;
		}
		100% {
			width: 0%;
			margin-left: 100%;
		}
	}

	/* グラフ表示/非表示 */
	.graph {
		transition: opacity 0.4s ease-out;
	}

	.graph.hidden {
		opacity: 0;
		pointer-events: none;
	}

	.graph-wrapper {
		position: relative;
		flex: 1;
		min-height: 0;
		height: 100%;
		/* 宇宙空間の背景 - より深みのあるグラデーション */
		background:
			/* 星雲のような色彩 */
			radial-gradient(ellipse 80% 50% at 20% 30%, rgba(134, 179, 0, 0.04) 0%, transparent 50%),
			radial-gradient(ellipse 60% 40% at 75% 70%, rgba(163, 116, 255, 0.06) 0%, transparent 45%),
			radial-gradient(ellipse 70% 60% at 50% 50%, rgba(214, 85, 214, 0.04) 0%, transparent 50%),
			/* 中央の微かな光源 */
			radial-gradient(circle at 50% 50%, rgba(134, 179, 0, 0.03) 0%, transparent 40%),
			/* ベースグラデーション */
			linear-gradient(180deg, rgba(12, 8, 24, 1) 0%, rgba(19, 14, 38, 1) 50%, rgba(15, 10, 30, 1) 100%);
		overflow: hidden;
		cursor: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><text y='24' font-size='24'>🚀</text></svg>") 4 4, auto;
	}

	/* グラフツールチップ - 常にダークテーマ（宇宙空間用） */
	.graph-tooltip {
		position: absolute;
		transform: translate(-50%, -100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.5rem 0.75rem;
		background: rgba(10, 10, 20, 0.9);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: var(--radius-lg);
		pointer-events: none;
		z-index: 100;
		white-space: nowrap;
		animation: tooltip-fade-in 0.2s var(--ease-out-back);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.06);
		/* ダークテーマ固定のテキスト色 */
		--tooltip-fg-primary: #fff;
		--tooltip-fg-muted: rgba(255, 255, 255, 0.5);
		--tooltip-fg-secondary: rgba(255, 255, 255, 0.75);
	}

	/* ツールチップの三角形インジケーター */
	.graph-tooltip::after {
		content: '';
		position: absolute;
		bottom: -6px;
		left: 50%;
		transform: translateX(-50%);
		width: 0;
		height: 0;
		border-left: 6px solid transparent;
		border-right: 6px solid transparent;
		border-top: 6px solid rgba(10, 10, 20, 0.9);
	}

	/* エッジツールチップのスタイル */
	.graph-tooltip.edge-tooltip {
		gap: 0.375rem;
		padding: 0.625rem 0.875rem;
	}

	.graph-tooltip.edge-tooltip.blocked {
		border-color: rgba(255, 71, 87, 0.4);
		background: linear-gradient(135deg, rgba(255, 71, 87, 0.2), rgba(10, 10, 20, 0.9));
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 71, 87, 0.2);
	}

	.graph-tooltip.edge-tooltip.blocked::after {
		border-top-color: rgba(255, 71, 87, 0.3);
	}

	.graph-tooltip.edge-tooltip.suspended {
		border-color: rgba(255, 165, 2, 0.4);
		background: linear-gradient(135deg, rgba(255, 165, 2, 0.2), rgba(10, 10, 20, 0.9));
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 165, 2, 0.2);
	}

	.graph-tooltip.edge-tooltip.suspended::after {
		border-top-color: rgba(255, 165, 2, 0.3);
	}

	.graph-tooltip.edge-tooltip.connectivity-ok {
		border-color: rgba(0, 217, 255, 0.4);
		background: linear-gradient(135deg, rgba(0, 217, 255, 0.2), rgba(10, 10, 20, 0.9));
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 217, 255, 0.2);
	}

	.graph-tooltip.edge-tooltip.connectivity-ok::after {
		border-top-color: rgba(0, 217, 255, 0.3);
	}

	.graph-tooltip.edge-tooltip.connectivity-ng {
		border-color: rgba(168, 85, 247, 0.4);
		background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(10, 10, 20, 0.9));
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(168, 85, 247, 0.2);
	}

	.graph-tooltip.edge-tooltip.connectivity-ng::after {
		border-top-color: rgba(168, 85, 247, 0.3);
	}

	@keyframes tooltip-fade-in {
		from {
			opacity: 0;
			transform: translate(-50%, -90%) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -100%) scale(1);
		}
	}

	.tooltip-label {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--tooltip-fg-primary);
		letter-spacing: -0.01em;
	}

	.tooltip-host {
		font-size: 0.7rem;
		color: var(--tooltip-fg-muted);
		font-weight: 500;
	}

	/* ノードツールチップ */
	.node-tooltip-content {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.node-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.125rem;
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
		color: var(--tooltip-fg-primary);
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
		border-color: rgba(255, 170, 0, 0.4);
		background: linear-gradient(135deg, rgba(255, 170, 0, 0.2), rgba(10, 10, 20, 0.9));
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 170, 0, 0.2);
	}

	.graph-tooltip.edge-tooltip.connectivity-partial::after {
		border-top-color: rgba(255, 170, 0, 0.3);
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
		gap: 0.375rem;
		margin-top: 0.375rem;
		padding-top: 0.375rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.connectivity-direction {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
	}

	.direction-hosts {
		color: var(--tooltip-fg-secondary);
		min-width: 8rem;
		font-family: ui-monospace, monospace;
		font-size: 0.65rem;
	}

	.direction-status {
		font-weight: 700;
		padding: 0.125rem 0.375rem;
		border-radius: var(--radius-sm);
		font-size: 0.6rem;
		letter-spacing: 0.02em;
	}

	.direction-status.ok {
		color: #00d9ff;
		background: rgba(0, 217, 255, 0.2);
		box-shadow: 0 0 8px rgba(0, 217, 255, 0.3);
	}

	.direction-status.ng {
		color: #c084fc;
		background: rgba(168, 85, 247, 0.2);
		box-shadow: 0 0 8px rgba(168, 85, 247, 0.3);
	}

	.direction-error {
		font-size: 0.55rem;
		color: var(--tooltip-fg-muted);
		font-style: italic;
	}

	.connectivity-error {
		font-size: 0.6rem;
		color: var(--tooltip-fg-muted);
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
		inset: -20%;
		width: 140%;
		height: 140%;
		pointer-events: none;
		z-index: 0;
	}

	.star {
		position: absolute;
		width: var(--size);
		height: var(--size);
		background: white;
		border-radius: 50%;
		opacity: 0.5;
		animation: twinkle var(--duration) ease-in-out var(--delay) infinite;
		box-shadow: 0 0 calc(var(--size) * 2) rgba(255, 255, 255, 0.3);
	}

	/* 色のバリエーション */
	.star.star-accent {
		background: #86b300;
		box-shadow: 0 0 calc(var(--size) * 3) rgba(134, 179, 0, 0.5);
	}

	.star.star-purple {
		background: #a374ff;
		box-shadow: 0 0 calc(var(--size) * 3) rgba(163, 116, 255, 0.5);
	}

	.star.star-bright {
		background: #fff;
		box-shadow: 0 0 calc(var(--size) * 4) rgba(255, 255, 255, 0.6);
		animation: twinkle-bright var(--duration) ease-in-out var(--delay) infinite;
	}

	@keyframes twinkle {
		0%, 100% {
			opacity: 0.3;
			transform: scale(1);
		}
		50% {
			opacity: 0.7;
			transform: scale(1.15);
		}
	}

	@keyframes twinkle-bright {
		0%, 100% {
			opacity: 0.4;
			transform: scale(1);
		}
		50% {
			opacity: 1;
			transform: scale(1.3);
		}
	}

	/* 宇宙塵/パーティクル */
	.space-dust {
		position: absolute;
		width: var(--size);
		height: var(--size);
		background: rgba(255, 255, 255, 0.4);
		border-radius: 50%;
		animation: drift var(--duration) ease-in-out var(--delay) infinite;
	}

	@keyframes drift {
		0%, 100% {
			opacity: 0.2;
			transform: translate(0, 0);
		}
		50% {
			opacity: 0.6;
			transform: translate(var(--drift-x), var(--drift-y));
		}
	}

	.graph {
		position: relative;
		width: 100%;
		height: 100%;
		z-index: 1;
	}

	/* Controls - 常にダークテーマ（宇宙空間用） */
	.graph-controls {
		position: absolute;
		top: 1rem;
		right: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		z-index: 10;
		padding: 0.375rem;
		background: rgba(0, 0, 0, 0.35);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-lg);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
	}

	.control-btn {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md);
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		transition: all var(--transition-bounce);
	}

	.control-btn:hover {
		background: rgba(134, 179, 0, 0.2);
		border-color: rgba(134, 179, 0, 0.4);
		color: #fff;
		transform: translateY(-1px);
		box-shadow: 0 4px 16px rgba(134, 179, 0, 0.25), 0 0 20px rgba(134, 179, 0, 0.15);
	}

	.control-btn:active {
		transform: scale(0.95) translateY(0);
		box-shadow: none;
	}

	.control-btn svg {
		width: 18px;
		height: 18px;
		transition: transform var(--transition-bounce);
	}

	.control-btn:hover svg {
		transform: scale(1.1);
	}

	/* リセットボタンの微かなパルス効果 */
	.control-btn.pulse-hint {
		animation: pulse-hint 3s ease-in-out infinite;
	}

	.control-btn.pulse-hint:hover {
		animation: none;
	}

	@keyframes pulse-hint {
		0%, 100% {
			box-shadow: none;
		}
		50% {
			box-shadow: 0 0 12px rgba(134, 179, 0, 0.3);
		}
	}

	/* Legend overlay - 常にダークテーマ（宇宙空間用） */
	.graph-legend {
		position: absolute;
		bottom: 1rem;
		left: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.625rem 0.75rem;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-lg);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
		z-index: 10;
		/* ダークテーマ固定のテキスト色 */
		--legend-fg-muted: rgba(255, 255, 255, 0.5);
		--legend-fg-secondary: rgba(255, 255, 255, 0.75);
	}

	.legend-section {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.legend-divider {
		height: 1px;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
		margin: 0.125rem 0;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.65rem;
	}

	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.legend-dot.node-dot {
		background: linear-gradient(135deg, #86b300, #a374ff, #d655d6);
		box-shadow: 0 0 6px rgba(134, 179, 0, 0.5);
	}

	.legend-dot.size-dot {
		background: rgba(255, 255, 255, 0.6);
		box-shadow: 0 0 4px rgba(255, 255, 255, 0.3);
	}

	.legend-dot.edge-dot {
		width: 12px;
		height: 3px;
		border-radius: 2px;
		background: linear-gradient(90deg, #86b300, #a374ff);
	}

	.legend-dot.center-dot {
		background: radial-gradient(circle, rgba(255, 255, 255, 0.8), transparent);
		box-shadow: 0 0 8px rgba(255, 255, 255, 0.4);
	}

	.legend-line {
		width: 16px;
		height: 2px;
		flex-shrink: 0;
		border-radius: 1px;
	}

	.legend-line.blocked-line {
		background: repeating-linear-gradient(90deg, #ff4757, #ff4757 4px, transparent 4px, transparent 6px);
	}

	.legend-line.suspended-line {
		background: repeating-linear-gradient(90deg, #ffa502, #ffa502 4px, transparent 4px, transparent 6px);
	}

	.legend-line.connectivity-ok-line {
		background: repeating-linear-gradient(90deg, #00d9ff, #00d9ff 2px, transparent 2px, transparent 4px);
	}

	.legend-line.connectivity-ng-line {
		background: repeating-linear-gradient(90deg, #a855f7, #a855f7 2px, transparent 2px, transparent 4px);
	}

	.legend-icon {
		font-size: 0.75rem;
		width: 16px;
		text-align: center;
	}

	.legend-key {
		color: var(--legend-fg-muted);
		min-width: 3rem;
		font-weight: 500;
	}

	.legend-val {
		color: var(--legend-fg-secondary);
		font-weight: 500;
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
			padding: 0.25rem;
			gap: 0.25rem;
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
			padding: 0.5rem 0.625rem;
			gap: 0.375rem;
		}

		.legend-section {
			gap: 0.1875rem;
		}

		.legend-item {
			font-size: 0.6rem;
			gap: 0.375rem;
		}

		.legend-key {
			min-width: 2.5rem;
		}

		.legend-dot {
			width: 6px;
			height: 6px;
		}

		.legend-dot.edge-dot {
			width: 10px;
			height: 2px;
		}

		.legend-line {
			width: 12px;
		}

		.legend-icon {
			font-size: 0.65rem;
			width: 12px;
		}

		/* モバイルではツールチップをより目立たせる */
		.graph-tooltip {
			padding: 0.625rem 0.875rem;
		}

		.tooltip-label {
			font-size: 0.9rem;
		}

		.tooltip-host {
			font-size: 0.75rem;
		}
	}
</style>
