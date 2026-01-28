import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseSession } from '$lib/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const sessionCookie = cookies.get('missmap_session');
	const session = parseSession(sessionCookie);

	if (!session) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const { token, host } = session;

	try {
		const body = await request.json();
		const { text, imageBase64, uploadOnly } = body as {
			text?: string;
			imageBase64?: string;
			uploadOnly?: boolean;
		};

		let fileId: string | null = null;

		// 画像がある場合はドライブにアップロード
		if (imageBase64) {
			// base64データURLからBlobを作成
			const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

			// base64をバイナリに変換（Cloudflare Workers互換）
			let blob: Blob;
			try {
				// Uint8Arrayを使用してBlobを作成
				const binaryString = atob(base64Data);
				const bytes = new Uint8Array(binaryString.length);
				for (let i = 0; i < binaryString.length; i++) {
					bytes[i] = binaryString.charCodeAt(i);
				}
				// ArrayBufferからBlobを作成（CF Workers互換性向上）
				blob = new Blob([bytes.buffer], { type: 'image/png' });
			} catch (decodeError) {
				console.error('Base64 decode failed:', decodeError);
				return json({ error: 'Invalid image data' }, { status: 400 });
			}

			// Misskeyのドライブにアップロード
			const formData = new FormData();
			formData.append('i', token);
			formData.append('file', blob, 'missmap.png');
			formData.append('name', `missmap-${Date.now()}.png`);
			formData.append('comment', 'Missmap Federation Graph');

			const uploadRes = await fetch(`https://${host}/api/drive/files/create`, {
				method: 'POST',
				body: formData
			});

			if (!uploadRes.ok) {
				const errorText = await uploadRes.text();
				console.error('Drive upload failed:', errorText);
				// アップロード失敗しても続行（画像なしで共有）
				if (uploadOnly) {
					return json({ error: 'Failed to upload image' }, { status: 500 });
				}
			} else {
				const uploadData = await uploadRes.json();
				fileId = uploadData.id;
			}
		}

		// uploadOnlyモードの場合はファイルIDのみ返す
		if (uploadOnly) {
			return json({
				success: true,
				fileId
			});
		}

		// ノートを作成（ホーム公開 = フォロワーに公開、連合しない）
		const noteBody: Record<string, unknown> = {
			i: token,
			text,
			visibility: 'home'
		};

		if (fileId) {
			noteBody.fileIds = [fileId];
		}

		const noteRes = await fetch(`https://${host}/api/notes/create`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(noteBody)
		});

		if (!noteRes.ok) {
			const errorText = await noteRes.text();
			console.error('Note creation failed:', errorText);
			return json({ error: 'Failed to create note' }, { status: 500 });
		}

		const noteData = await noteRes.json();

		return json({
			success: true,
			noteId: noteData.createdNote?.id,
			noteUrl: `https://${host}/notes/${noteData.createdNote?.id}`
		});
	} catch (error) {
		console.error('Share error:', error);
		// エラーの詳細をレスポンスに含める（デバッグ用）
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
	}
};
