<script>
	let { routes = [], highlightedRoute = $bindable(null) } = $props();

	function selectRoute(filename) {
		highlightedRoute = highlightedRoute === filename ? null : filename;
	}

	function formatName(name) {
		return name
			.split(' ')
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
			.join(' ');
	}
</script>

<div class="route-list">
	<div class="route-list-header">
		<h2>Routes</h2>
		<span class="route-count">{routes.length} route{routes.length !== 1 ? 's' : ''}</span>
	</div>

	{#if routes.length === 0}
		<p class="empty-state">No routes found.</p>
	{:else}
		<ul>
			{#each routes as route (route.filename)}
				<li>
					<button
						class="route-item"
						class:active={highlightedRoute === route.filename}
						onclick={() => selectRoute(route.filename)}
					>
						<span class="route-icon">🗺</span>
						<span class="route-name">{formatName(route.name)}</span>
						{#if highlightedRoute === route.filename}
							<span class="route-badge">Selected</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.route-list {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.route-list-header {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 16px 16px 8px;
		border-bottom: 1px solid #e5e7eb;
	}

	.route-list-header h2 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: #111827;
	}

	.route-count {
		font-size: 0.8rem;
		color: #6b7280;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 8px 0;
		overflow-y: auto;
		flex: 1;
	}

	li {
		margin: 0;
		padding: 0 8px;
	}

	.route-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		border: none;
		border-radius: 6px;
		background: none;
		cursor: pointer;
		text-align: left;
		font-size: 0.9rem;
		color: #374151;
		transition: background 0.15s;
	}

	.route-item:hover {
		background: #f3f4f6;
	}

	.route-item.active {
		background: #eff6ff;
		color: #1d4ed8;
	}

	.route-icon {
		font-size: 1rem;
		flex-shrink: 0;
	}

	.route-name {
		flex: 1;
		font-weight: 500;
		line-height: 1.3;
	}

	.route-badge {
		font-size: 0.7rem;
		background: #dbeafe;
		color: #1d4ed8;
		padding: 2px 6px;
		border-radius: 9999px;
		font-weight: 500;
		flex-shrink: 0;
	}

	.empty-state {
		padding: 16px;
		color: #9ca3af;
		font-size: 0.9rem;
		text-align: center;
	}
</style>
