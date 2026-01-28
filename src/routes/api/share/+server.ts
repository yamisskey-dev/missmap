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
			// base64データURLからBlobを作成（JPEG/PNG両対応）
			const mimeMatch = imageBase64.match(/^data:(image\/[a-z]+);base64,/);
			const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
			const extension = mimeType === 'image/png' ? 'png' : 'jpg';
			const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

			console.log('Image upload: mimeType=', mimeType, 'base64Length=', base64Data.length);

			// base64をバイナリに変換（Cloudflare Workers互換）
			let bytes: Uint8Array;
			try {
				const binaryString = atob(base64Data);
				bytes = new Uint8Array(binaryString.length);
				for (let i = 0; i < binaryString.length; i++) {
					bytes[i] = binaryString.charCodeAt(i);
				}
				console.log('Decoded bytes length:', bytes.length);
			} catch (decodeError) {
				console.error('Base64 decode failed:', decodeError);
				return json({ error: 'Invalid image data' }, { status: 400 });
			}

			// Misskeyのドライブにアップロード
			// CF Workers互換: Uint8ArrayからFileを作成
			const fileName = `missmap-${Date.now()}.${extension}`;
			const file = new File([bytes as BlobPart], fileName, { type: mimeType });
			const formData = new FormData();
			formData.append('i', token);
			formData.append('file', file);
			formData.append('name', fileName);
			formData.append('comment', 'Missmap Federation Graph');

			console.log('Uploading to:', `https://${host}/api/drive/files/create`);

			const uploadRes = await fetch(`https://${host}/api/drive/files/create`, {
				method: 'POST',
				headers: {
					'User-Agent': 'Missmap/1.0 (https://missmap.pages.dev)'
				},
				body: formData
			});

			console.log('Upload response status:', uploadRes.status);

			if (!uploadRes.ok) {
				const errorText = await uploadRes.text();
				console.error('Drive upload failed:', uploadRes.status, errorText);
				// アップロード失敗しても続行（画像なしで共有）
				if (uploadOnly) {
					return json({ error: `Failed to upload image: ${errorText}` }, { status: 500 });
				}
			} else {
				const uploadData = await uploadRes.json();
				fileId = uploadData.id;
				console.log('Upload success, fileId:', fileId);
			}
		}

		// uploadOnlyモードの場合はファイルIDのみ返す
		if (uploadOnly) {
			return json({
				success: true,
				fileId
			});
		}

		// ノートを作成
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
				'Content-Type': 'application/json',
				'User-Agent': 'Missmap/1.0 (https://missmap.pages.dev)'
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
