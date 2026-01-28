import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface ConnectivityResult {
	source: string;
	target: string;
	reachable: boolean;
	error?: string;
	latency?: number;
}

// サーバーAからサーバーBへの疎通確認
async function checkConnectivity(
	source: string,
	target: string,
	timeout: number = 5000
): Promise<ConnectivityResult> {
	const startTime = Date.now();

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		// Misskey API: federation/show-instance を使用
		// sourceサーバーがtargetサーバーの情報を持っているか確認
		const res = await fetch(`https://${source}/api/federation/show-instance`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': 'Missmap/1.0 (https://missmap.pages.dev)'
			},
			body: JSON.stringify({ host: target }),
			signal: controller.signal
		});

		clearTimeout(timeoutId);
		const latency = Date.now() - startTime;

		if (!res.ok) {
			const errorText = await res.text();
			let errorData: { error?: { code?: string; message?: string } } = {};
			try {
				errorData = JSON.parse(errorText);
			} catch {
				// ignore parse error
			}

			// エラーコードに応じた処理
			if (errorData?.error?.code === 'NO_SUCH_OBJECT') {
				// サーバーが対象を知らない = 連合していない
				return {
					source,
					target,
					reachable: false,
					error: 'NOT_FEDERATED',
					latency
				};
			}

			if (errorData?.error?.code === 'CREDENTIAL_REQUIRED') {
				// 認証必要 = APIが非公開
				return {
					source,
					target,
					reachable: false,
					error: 'CREDENTIAL_REQUIRED',
					latency
				};
			}

			return {
				source,
				target,
				reachable: false,
				error: `API_ERROR: ${res.status}`,
				latency
			};
		}

		// 正常に情報を取得できた = 疎通している
		const instanceInfo = await res.json();

		// isBlocked/isSuspended をチェック
		if (instanceInfo.isBlocked) {
			return {
				source,
				target,
				reachable: false,
				error: 'BLOCKED',
				latency
			};
		}

		if (instanceInfo.isSuspended) {
			return {
				source,
				target,
				reachable: false,
				error: 'SUSPENDED',
				latency
			};
		}

		return {
			source,
			target,
			reachable: true,
			latency
		};
	} catch (e) {
		const latency = Date.now() - startTime;

		if (e instanceof Error && e.name === 'AbortError') {
			return {
				source,
				target,
				reachable: false,
				error: 'TIMEOUT',
				latency
			};
		}

		return {
			source,
			target,
			reachable: false,
			error: 'CONNECTION_FAILED',
			latency
		};
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as {
		source: string;
		target: string;
		bidirectional?: boolean;
	};
	const { source, target, bidirectional = false } = body;

	if (!source || !target || typeof source !== 'string' || typeof target !== 'string') {
		return json({ error: 'source and target are required' }, { status: 400 });
	}

	if (source === target) {
		return json({ error: 'source and target must be different' }, { status: 400 });
	}

	try {
		if (bidirectional) {
			// 双方向チェック（並列実行）
			const [forwardResult, backwardResult] = await Promise.all([
				checkConnectivity(source, target),
				checkConnectivity(target, source)
			]);

			return json({
				forward: forwardResult,
				backward: backwardResult,
				mutuallyReachable: forwardResult.reachable && backwardResult.reachable
			});
		} else {
			// 単方向チェック
			const result = await checkConnectivity(source, target);
			return json(result);
		}
	} catch (e) {
		console.error('Connectivity check failed:', e);
		return json(
			{
				error: 'CHECK_FAILED',
				message: '疎通確認に失敗しました'
			},
			{ status: 500 }
		);
	}
};
