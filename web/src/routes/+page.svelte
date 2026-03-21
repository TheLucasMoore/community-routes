<script>
	import { onMount } from 'svelte';
	import RouteList from '$lib/RouteList.svelte';
	import Map from '$lib/Map.svelte';

	let routes = $state([]);
	let highlightedRoute = $state(null);
	let loading = $state(true);
	let error = $state(null);

	onMount(async () => {
		try {
			const res = await fetch('/api/routes');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			routes = await res.json();
		} catch (err) {
			console.error('Failed to load routes:', err);
			error = err.message;
		} finally {
			loading = false;
		}
	});
</script>

<div class="page-layout">
	<aside class="sidebar">
		{#if loading}
			<div class="sidebar-loading">Loading routes...</div>
		{:else if error}
			<div class="sidebar-error">Error: {error}</div>
		{:else}
			<RouteList {routes} bind:highlightedRoute />
		{/if}
	</aside>

	<main class="map-area">
		<Map {routes} {highlightedRoute} />
	</main>
</div>

<style>
	.page-layout {
		display: flex;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.sidebar {
		width: 280px;
		flex-shrink: 0;
		background: #ffffff;
		border-right: 1px solid #e5e7eb;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.map-area {
		flex: 1;
		overflow: hidden;
		position: relative;
	}

	.sidebar-loading,
	.sidebar-error {
		padding: 20px 16px;
		font-size: 0.9rem;
		color: #6b7280;
		text-align: center;
	}

	.sidebar-error {
		color: #dc2626;
	}
</style>
