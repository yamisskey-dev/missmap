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
			// base64データURLからBlobを作成（Cloudflare Workers互換）
			const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

			// Cloudflare Workers互換のbase64デコード
			let binaryData: Uint8Array;
			try {
				const binaryString = atob(base64Data);
				binaryData = new Uint8Array(binaryString.length);
				for (let i = 0; i < binaryString.length; i++) {
					binaryData[i] = binaryString.charCodeAt(i);
				}
			} catch (decodeError) {
				console.error('Base64 decode failed:', decodeError);
				return json({ error: 'Invalid image data' }, { status: 400 });
			}

			const blob = new Blob([binaryData], { type: 'image/png' });

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
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
