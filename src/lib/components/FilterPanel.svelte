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
		{ value: 'large', label: '大規模 (1000人以上)' },
		{ value: 'medium', label: '中規模 (100〜1000人)' },
		{ value: 'small', label: '小規模 (100人以下)' }
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
	{#if isMobile}
		<button class="panel-header-toggle" onclick={() => isExpanded = !isExpanded}>
			<svg class="panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
			</svg>
			<h3>フィルター</h3>
			<svg class="toggle-icon" class:expanded={isExpanded} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="6 9 12 15 18 9" />
			</svg>
		</button>
	{:else}
		<div class="panel-header">
			<svg class="panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
			</svg>
			<h3>フィルター</h3>
		</div>
	{/if}

	{#if !isMobile || isExpanded}
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
		<div class="scale-buttons">
			{#each scaleOptions as { value, label }}
				<button
					class="scale-btn"
					class:active={filter.scale.includes(value)}
					onclick={() => toggleScale(value)}
				>
					{label}
				</button>
			{/each}
		</div>
	</section>
	{/if}
</aside>

<style>
	.filter-panel {
		padding: 0.5rem 0.75rem;
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-bottom: 0.375rem;
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

	/* Scale buttons */
	.scale-buttons {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.scale-btn {
		width: 100%;
		padding: 0.375rem 0.625rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		color: var(--fg-secondary);
		text-align: left;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.scale-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: var(--border-color-hover);
	}

	.scale-btn.active {
		background: rgba(134, 179, 0, 0.15);
		border-color: var(--accent-600);
		color: var(--accent-400);
	}
</style>
