<script lang="ts">
</script>

<aside class="legend-panel">
	<div class="legend-grid">
		<div class="legend-item">
			<span class="legend-label">色</span>
			<span class="legend-value">ソフトウェア</span>
		</div>
		<div class="legend-item">
			<span class="legend-label">大きさ</span>
			<span class="legend-value">ユーザー数</span>
		</div>
		<div class="legend-item">
			<span class="legend-label">線の太さ</span>
			<span class="legend-value">やり取りの量</span>
		</div>
		<div class="legend-item">
			<span class="legend-label">中心に近い</span>
			<span class="legend-value">繋がりが多い</span>
		</div>
	</div>
</aside>

<style>
	.legend-panel {
		padding: 0.75rem;
	}

	.legend-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.375rem 0.75rem;
	}

	.legend-item {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.legend-label {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.legend-value {
		font-size: 0.75rem;
		color: var(--fg-secondary);
	}
</style>
