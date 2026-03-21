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

	function formatDistance(km) {
		return km >= 1 ? `${km.toLocaleString()} km` : `${Math.round(km * 1000)} m`;
	}

	function formatElevation(m) {
		return `↑ ${m.toLocaleString()} m`;
	}

	// Build an SVG polyline path from elevationProfile array
	function buildSparklinePath(profile, width, height) {
		if (!profile || profile.length < 2) return '';
		const minEle = Math.min(...profile.map((p) => p.ele));
		const maxEle = Math.max(...profile.map((p) => p.ele));
		const maxD = profile[profile.length - 1].d || 1;
		const eleRange = maxEle - minEle || 1;
		const pad = 4;

		const points = profile.map((p) => {
			const x = pad + ((p.d / maxD) * (width - pad * 2));
			const y = height - pad - ((p.ele - minEle) / eleRange) * (height - pad * 2);
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		});

		// Closed area path: go along the profile, then back along the bottom
		const first = profile[0];
		const last = profile[profile.length - 1];
		const x0 = (pad + ((first.d / maxD) * (width - pad * 2))).toFixed(1);
		const xN = (pad + ((last.d / maxD) * (width - pad * 2))).toFixed(1);
		const bottom = (height - pad).toFixed(1);

		return `M ${x0},${bottom} L ${points.join(' L ')} L ${xN},${bottom} Z`;
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
				{@const isSelected = highlightedRoute === route.filename}
				<li>
					<button
						class="route-item"
						class:active={isSelected}
						onclick={() => selectRoute(route.filename)}
					>
						<div class="route-main">
							<span class="route-icon">🗺</span>
							<span class="route-name">{formatName(route.name)}</span>
						</div>
						{#if route.distanceKm != null || route.elevationGainM != null}
							<div class="route-stats">
								{#if route.distanceKm != null}
									<span class="stat">{formatDistance(route.distanceKm)}</span>
								{/if}
								{#if route.elevationGainM != null && route.elevationGainM > 0}
									<span class="stat">{formatElevation(route.elevationGainM)}</span>
								{/if}
							</div>
						{/if}
					</button>

					{#if isSelected && route.elevationProfile && route.elevationProfile.length > 1}
						<div class="elevation-chart">
							<svg width="100%" viewBox="0 0 260 80" preserveAspectRatio="none">
								<path
									d={buildSparklinePath(route.elevationProfile, 260, 80)}
									fill="#ff6b00"
									fill-opacity="0.25"
									stroke="#ff6b00"
									stroke-width="1.5"
									stroke-linejoin="round"
								/>
							</svg>
							<div class="chart-labels">
								<span>0 km</span>
								<span>Elevation profile</span>
								<span>{route.distanceKm} km</span>
							</div>
						</div>
					{/if}
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
		flex-shrink: 0;
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
		flex-direction: column;
		gap: 4px;
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
		background: #fff7ed;
		color: #c2410c;
	}

	.route-main {
		display: flex;
		align-items: center;
		gap: 10px;
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

	.route-stats {
		display: flex;
		gap: 10px;
		padding-left: 26px;
	}

	.stat {
		font-size: 0.78rem;
		color: #6b7280;
	}

	.route-item.active .stat {
		color: #9a3412;
	}

	.elevation-chart {
		padding: 0 8px 10px;
	}

	.elevation-chart svg {
		display: block;
		width: 100%;
		height: 80px;
		border-radius: 4px;
		background: #fff7ed;
	}

	.chart-labels {
		display: flex;
		justify-content: space-between;
		font-size: 0.68rem;
		color: #9a3412;
		padding: 2px 2px 0;
	}
</style>
