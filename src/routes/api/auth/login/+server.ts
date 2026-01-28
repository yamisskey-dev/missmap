import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { MiAuthSession } from '$lib/types';
import { getAppSecret, setAppSecret, deleteAppSecret } from '$lib/auth';

const APP_NAME = 'missmap';
const APP_DESCRIPTION = 'Fediverse連合マップ - あなたの宇宙を探索しよう';
const PERMISSIONS = ['read:account', 'read:federation'];

// インスタンスがMisskey系かどうかを確認
async function isMisskeyInstance(host: string): Promise<{ isMisskey: boolean; error?: string }> {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒タイムアウト

		const res = await fetch(`https://${host}/api/meta`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
			signal: controller.signal
		});

		clearTimeout(timeoutId);

		if (!res.ok) {
			console.log(`[Login] /api/meta returned ${res.status} for ${host}`);
			return { isMisskey: false, error: `サーバーからエラー応答 (${res.status})` };
		}

		const data = await res.json();
		// Misskey系ならversionが存在する
		if (data.version) {
			console.log(`[Login] Detected Misskey ${data.version} on ${host}`);
			return { isMisskey: true };
		}

		return { isMisskey: false, error: 'Misskey APIが見つかりません' };
	} catch (e) {
		const error = e as Error;
		if (error.name === 'AbortError') {
			console.log(`[Login] Timeout checking ${host}`);
			return { isMisskey: false, error: 'サーバーへの接続がタイムアウトしました' };
		}
		console.log(`[Login] Error checking ${host}:`, error.message);
		return { isMisskey: false, error: `接続エラー: ${error.message}` };
	}
}

export const POST: RequestHandler = async ({ request, url }) => {
	let data: { host: string };

	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	const host = data.host?.toLowerCase().trim();

	if (!host) {
		return json({ error: 'Host is required' }, { status: 400 });
	}

	try {
		// Misskey系インスタンスかチェック
		const checkResult = await isMisskeyInstance(host);
		if (!checkResult.isMisskey) {
			return json(
				{ error: checkResult.error || 'このサーバーはMisskey系ではないようです' },
				{ status: 400 }
			);
		}

		// コールバックURL
		const callbackUrl = `${url.origin}/auth/callback`;

		// キャッシュからアプリシークレットを取得、なければ新規作成
		let appSecret = getAppSecret(host);

		if (!appSecret) {
			// アプリを新規登録
			const appRes = await fetch(`https://${host}/api/app/create`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: APP_NAME,
					description: APP_DESCRIPTION,
					permission: PERMISSIONS,
					callbackUrl
				})
			});

			if (!appRes.ok) {
				const errorText = await appRes.text();
				console.error('Failed to create app:', errorText);
				return json(
					{ error: 'アプリの登録に失敗しました' },
					{ status: 500 }
				);
			}

			const appData = await appRes.json();
			appSecret = appData.secret;
			setAppSecret(host, appSecret!);
		}

		// 認証セッションを生成
		const sessionRes = await fetch(`https://${host}/api/auth/session/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ appSecret })
		});

		if (!sessionRes.ok) {
			// アプリシークレットが無効な場合はキャッシュをクリアしてリトライを促す
			const errorData = await sessionRes.json().catch(() => ({}));
			if (errorData?.error?.code === 'NO_SUCH_APP') {
				deleteAppSecret(host);
				return json(
					{ error: 'アプリ登録が期限切れです。もう一度お試しください。' },
					{ status: 500 }
				);
			}
			return json(
				{ error: '認証セッションの作成に失敗しました' },
				{ status: 500 }
			);
		}

		const session: MiAuthSession = await sessionRes.json();

		return json({
			token: session.token,
			url: session.url,
			host
		});
	} catch (error) {
		console.error('Login error:', error);
		return json(
			{ error: 'ログイン処理中にエラーが発生しました' },
			{ status: 500 }
		);
	}
};
