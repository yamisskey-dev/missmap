<script lang="ts">
	import { startLogin } from '$lib/stores/auth.svelte';
	import { fade, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';

	let {
		isOpen = false,
		onClose
	}: {
		isOpen: boolean;
		onClose: () => void;
	} = $props();

	let host = $state('');
	let isLoading = $state(false);
	let error = $state('');

	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (!host.trim()) {
			error = 'サーバーを入力してください';
			return;
		}

		isLoading = true;
		error = '';

		const result = await startLogin(host.trim());

		if (result.success && result.url) {
			window.location.href = result.url;
		} else {
			error = result.error || 'ログインに失敗しました';
			isLoading = false;
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}

	$effect(() => {
		if (isOpen) {
			host = '';
			error = '';
			isLoading = false;
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={handleBackdropClick} transition:fade={{ duration: 150 }}>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="login-title"
			transition:scale={{ duration: 200, start: 0.95, easing: backOut }}
		>
			<button class="close-btn" onclick={onClose} aria-label="閉じる">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>

			<h2 id="login-title">ログイン</h2>

			<form onsubmit={handleSubmit}>
				<div class="input-group">
					<div class="input-wrapper" class:error>
						<span class="prefix">https://</span>
						<input
							id="host-input"
							type="text"
							bind:value={host}
							placeholder="misskey.io"
							disabled={isLoading}
							autocomplete="off"
							autocapitalize="none"
							spellcheck="false"
						/>
					</div>
					{#if error}
						<p class="error-text" transition:fade={{ duration: 100 }}>{error}</p>
					{/if}
				</div>

				<button type="submit" class="submit-btn" disabled={isLoading}>
					{#if isLoading}
						<span class="spinner"></span>
						<span>接続中...</span>
					{:else}
						<span>ログイン</span>
					{/if}
				</button>
			</form>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal {
		background: linear-gradient(180deg, rgba(30, 25, 55, 0.98) 0%, rgba(18, 14, 35, 0.98) 100%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 1rem;
		padding: 1.5rem;
		max-width: 320px;
		width: 100%;
		position: relative;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
	}

	.close-btn {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.4);
		cursor: pointer;
		transition: all 0.15s;
	}

	.close-btn svg {
		width: 16px;
		height: 16px;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.8);
	}

	h2 {
		margin: 0 0 1rem;
		font-size: 1.125rem;
		font-weight: 600;
		color: white;
	}

	.input-group {
		margin-bottom: 1rem;
	}

	.input-wrapper {
		display: flex;
		align-items: center;
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.5rem;
		overflow: hidden;
		transition: all 0.15s;
	}

	.input-wrapper:focus-within {
		border-color: var(--accent-500, #86b300);
		box-shadow: 0 0 0 2px rgba(134, 179, 0, 0.15);
	}

	.input-wrapper.error {
		border-color: rgba(255, 100, 100, 0.5);
	}

	.prefix {
		padding: 0.625rem 0.375rem 0.625rem 0.75rem;
		color: rgba(255, 255, 255, 0.3);
		font-size: 0.875rem;
		font-family: ui-monospace, monospace;
		user-select: none;
	}

	input {
		flex: 1;
		padding: 0.625rem 0.75rem 0.625rem 0;
		background: none;
		border: none;
		color: white;
		font-size: 0.9rem;
		outline: none;
		min-width: 0;
	}

	input::placeholder {
		color: rgba(255, 255, 255, 0.25);
	}

	input:disabled {
		opacity: 0.5;
	}

	.error-text {
		color: #ff6b6b;
		font-size: 0.75rem;
		margin: 0.375rem 0 0;
	}

	.submit-btn {
		width: 100%;
		padding: 0.75rem 1rem;
		background: linear-gradient(135deg, var(--accent-500, #86b300), var(--accent-600, #6a9000));
		color: white;
		border: none;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		transition: all 0.2s;
	}

	.submit-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(134, 179, 0, 0.3);
	}

	.submit-btn:disabled {
		opacity: 0.7;
		cursor: not-allowed;
		transform: none;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
