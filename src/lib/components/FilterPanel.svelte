<script lang="ts">
	import { DEFAULT_FILTER, type ServerFilter, type ServerScale, type RegistrationStatus, type EmailRequirement, type AgeRestriction } from '$lib/types';

	let {
		filter = $bindable(DEFAULT_FILTER),
		isMobile = false,
		defaultOpen = true
	}: {
		filter: ServerFilter;
		isMobile?: boolean;
		defaultOpen?: boolean;
	} = $props();

	let isExpanded = $state(defaultOpen);

	const scaleOptions: { value: ServerScale; label: string }[] = [
		{ value: 'large', label: '大' },
		{ value: 'medium', label: '中' },
		{ value: 'small', label: '小' }
	];

	const registrationOptions: { value: RegistrationStatus; label: string }[] = [
		{ value: 'open', label: '受付中' },
		{ value: 'approval', label: '承認制' },
		{ value: 'invite', label: '招待制' },
		{ value: 'closed', label: '停止中' }
	];

	const emailOptions: { value: EmailRequirement; label: string }[] = [
		{ value: null, label: 'すべて' },
		{ value: 'required', label: '必須' },
		{ value: 'notRequired', label: '不要' }
	];

	const ageOptions: { value: AgeRestriction | null; label: string }[] = [
		{ value: null, label: 'なし' },
		{ value: '13+', label: '小学生不可' },
		{ value: '18+', label: '未成年不可' }
	];

	function toggleScale(value: ServerScale) {
		if (filter.scale.includes(value)) {
			filter.scale = filter.scale.filter((s) => s !== value);
		} else {
			filter.scale = [...filter.scale, value];
		}
	}

	function toggleRegistration(value: RegistrationStatus) {
		if (filter.registrationStatus.includes(value)) {
			filter.registrationStatus = filter.registrationStatus.filter((s) => s !== value);
		} else {
			filter.registrationStatus = [...filter.registrationStatus, value];
		}
	}
</script>

<aside class="filter-panel">
	<button class="panel-header-toggle" onclick={() => isExpanded = !isExpanded}>
		<svg class="panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
		</svg>
		<h3>フィルター</h3>
		<svg class="toggle-icon" class:expanded={isExpanded} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<polyline points="6 9 12 15 18 9" />
		</svg>
	</button>

	{#if isExpanded}
	<section>
		<h4>新規登録</h4>
		<div class="chip-group">
			{#each registrationOptions as { value, label }}
				<button
					class="filter-chip"
					class:active={filter.registrationStatus.includes(value)}
					onclick={() => toggleRegistration(value)}
				>
					{label}
				</button>
			{/each}
		</div>
	</section>

	<section>
		<h4>メールアドレス</h4>
		<div class="chip-group">
			{#each emailOptions as { value, label }}
				<button
					class="filter-chip"
					class:active={filter.emailRequirement === value}
					onclick={() => (filter.emailRequirement = value)}
				>
					{label}
				</button>
			{/each}
		</div>
	</section>

	<section>
		<h4>年齢制限</h4>
		<div class="chip-group">
			{#each ageOptions as { value, label }}
				<button
					class="filter-chip"
					class:active={filter.ageRestriction === value}
					onclick={() => (filter.ageRestriction = value)}
				>
					{label}
				</button>
			{/each}
		</div>
	</section>

	<section>
		<h4>規模</h4>
		<div class="chip-group">
			{#each scaleOptions as { value, label }}
				<button
					class="filter-chip"
					class:active={filter.scale.includes(value)}
					onclick={() => toggleScale(value)}
				>
					{label}
				</button>
			{/each}
		</div>
	</section>

	<section>
		<h4>つながり</h4>
		<div class="chip-group">
			<button
				class="filter-chip edge-chip federation"
				class:active={filter.edgeVisibility.showFederation}
				onclick={() => filter.edgeVisibility = { ...filter.edgeVisibility, showFederation: !filter.edgeVisibility.showFederation }}
			>
				連合
			</button>
			<button
				class="filter-chip edge-chip blocked"
				class:active={filter.edgeVisibility.showBlocked}
				onclick={() => filter.edgeVisibility = { ...filter.edgeVisibility, showBlocked: !filter.edgeVisibility.showBlocked }}
			>
				ブロック
			</button>
			<button
				class="filter-chip edge-chip suspended"
				class:active={filter.edgeVisibility.showSuspended}
				onclick={() => filter.edgeVisibility = { ...filter.edgeVisibility, showSuspended: !filter.edgeVisibility.showSuspended }}
			>
				配信停止
			</button>
			<button
				class="filter-chip edge-chip connectivity-ok"
				class:active={filter.edgeVisibility.showConnectivityOk}
				onclick={() => filter.edgeVisibility = { ...filter.edgeVisibility, showConnectivityOk: !filter.edgeVisibility.showConnectivityOk }}
			>
				疎通OK
			</button>
			<button
				class="filter-chip edge-chip connectivity-ng"
				class:active={filter.edgeVisibility.showConnectivityNg}
				onclick={() => filter.edgeVisibility = { ...filter.edgeVisibility, showConnectivityNg: !filter.edgeVisibility.showConnectivityNg }}
			>
				疎通NG
			</button>
		</div>
	</section>
	{/if}
</aside>

<style>
	.filter-panel {
		padding: 0.5rem 0.625rem;
	}

	.panel-header-toggle {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		width: 100%;
		padding: 0;
		margin-bottom: 0.375rem;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
	}

	.panel-header-toggle h3 {
		flex: 1;
		margin: 0;
		font-size: 0.85rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		color: var(--fg-primary);
	}

	.toggle-icon {
		width: 14px;
		height: 14px;
		color: var(--fg-muted);
		transition: transform var(--transition-fast);
	}

	.toggle-icon.expanded {
		transform: rotate(180deg);
	}

	.panel-icon {
		width: 16px;
		height: 16px;
		color: var(--accent-500);
	}

	h3 {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	h4 {
		margin: 0.5rem 0 0.25rem;
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	section:first-of-type h4 {
		margin-top: 0;
	}

	/* Chip group styles */
	.chip-group {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.filter-chip {
		padding: 0.25rem 0.5rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		font-size: 0.7rem;
		color: var(--fg-secondary);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.filter-chip:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: var(--border-color-hover);
	}

	.filter-chip.active {
		background: rgba(134, 179, 0, 0.15);
		border-color: var(--accent-600);
		color: var(--accent-400);
	}

	/* Edge chips - 色付きのアクティブ状態 */
	.edge-chip.federation.active {
		background: rgba(134, 179, 0, 0.15);
		border-color: var(--accent-600);
		color: var(--accent-400);
	}

	.edge-chip.blocked.active {
		background: rgba(255, 71, 87, 0.15);
		border-color: #ff4757;
		color: #ff6b6b;
	}

	.edge-chip.suspended.active {
		background: rgba(255, 165, 2, 0.15);
		border-color: #ffa502;
		color: #ffbe76;
	}

	.edge-chip.connectivity-ok.active {
		background: rgba(59, 130, 246, 0.15);
		border-color: #3b82f6;
		color: #60a5fa;
	}

	.edge-chip.connectivity-ng.active {
		background: rgba(168, 85, 247, 0.15);
		border-color: #a855f7;
		color: #c084fc;
	}

	/* 非アクティブ時は薄く */
	.edge-chip:not(.active) {
		opacity: 0.5;
	}
</style>
