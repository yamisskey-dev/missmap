<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let error = $state('');

	onMount(async () => {
		const urlParams = new URLSearchParams(window.location.search);
		const token = urlParams.get('token');
		const host = localStorage.getItem('missmap_auth_host');

		if (!token || !host) {
			error = '認証情報が見つかりません';
			return;
		}

		try {
			const res = await fetch('/api/auth/callback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token, host })
			});

			const data = await res.json();

			if (!res.ok) {
				error = data.error || '認証に失敗しました';
				return;
			}

			localStorage.removeItem('missmap_auth_host');
			goto('/', { replaceState: true });
		} catch {
			error = '通信エラーが発生しました';
		}
	});
</script>

<svelte:head>
	<title>認証中... | missmap</title>
</svelte:head>

<div class="callback-container">
	{#if error}
		<div class="error-box">
			<p>{error}</p>
			<a href="/">マップに戻る</a>
		</div>
	{:else}
		<div class="loading">
			<div class="spinner"></div>
			<p>認証中...</p>
		</div>
	{/if}
</div>

<style>
	.callback-container {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-primary, #0c0818);
	}

	.loading {
		text-align: center;
	}

	.spinner {
		width: 32px;
		height: 32px;
		margin: 0 auto 1rem;
		border: 3px solid rgba(255, 255, 255, 0.15);
		border-top-color: #86b300;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.loading p {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.9rem;
		margin: 0;
	}

	.error-box {
		text-align: center;
		padding: 1.5rem 2rem;
		background: rgba(255, 100, 100, 0.1);
		border: 1px solid rgba(255, 100, 100, 0.3);
		border-radius: 0.75rem;
		max-width: 300px;
	}

	.error-box p {
		margin: 0 0 1rem;
		color: #fca5a5;
		font-size: 0.9rem;
	}

	.error-box a {
		color: #86b300;
		text-decoration: none;
		font-size: 0.85rem;
	}

	.error-box a:hover {
		text-decoration: underline;
	}
</style>
