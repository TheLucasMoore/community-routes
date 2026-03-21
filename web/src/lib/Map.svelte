<script>
	import { onMount, onDestroy } from 'svelte';

	let { routes = [], highlightedRoute = null } = $props();

	let mapContainer;
	let map;
	let maplibre;

	const OPENFREE_STYLE =
		'https://tiles.openfreemap.org/styles/liberty';

	function addRoutesToMap() {
		if (!map || !maplibre) return;

		// Remove existing layers and sources
		routes.forEach((route) => {
			const sourceId = `route-${route.filename}`;
			const lineLayerId = `line-${route.filename}`;
			const pointLayerId = `point-${route.filename}`;

			if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
			if (map.getLayer(pointLayerId)) map.removeLayer(pointLayerId);
			if (map.getSource(sourceId)) map.removeSource(sourceId);
		});

		routes.forEach((route) => {
			const sourceId = `route-${route.filename}`;
			const lineLayerId = `line-${route.filename}`;
			const pointLayerId = `point-${route.filename}`;
			const isHighlighted = highlightedRoute === route.filename;

			map.addSource(sourceId, {
				type: 'geojson',
				data: route.geojson
			});

			// Add line layer for LineString features
			map.addLayer({
				id: lineLayerId,
				type: 'line',
				source: sourceId,
				filter: ['in', '$type', 'LineString', 'MultiLineString'],
				paint: {
					'line-color': isHighlighted ? '#ff6b00' : '#3b82f6',
					'line-width': isHighlighted ? 4 : 2.5,
					'line-opacity': 0.85
				}
			});

			// Add circle layer for Point features
			map.addLayer({
				id: pointLayerId,
				type: 'circle',
				source: sourceId,
				filter: ['==', '$type', 'Point'],
				paint: {
					'circle-radius': isHighlighted ? 8 : 6,
					'circle-color': isHighlighted ? '#ff6b00' : '#3b82f6',
					'circle-stroke-width': 2,
					'circle-stroke-color': '#ffffff'
				}
			});
		});
	}

	function fitToRoutes() {
		if (!map || !maplibre || routes.length === 0) return;

		const bounds = new maplibre.LngLatBounds();
		let hasCoords = false;

		routes.forEach((route) => {
			const geojson = route.geojson;
			const features =
				geojson.type === 'FeatureCollection' ? geojson.features : [geojson];

			features.forEach((feature) => {
				const geom = feature.geometry;
				if (!geom) return;

				if (geom.type === 'Point') {
					bounds.extend(geom.coordinates);
					hasCoords = true;
				} else if (geom.type === 'LineString') {
					geom.coordinates.forEach((c) => {
						bounds.extend(c);
						hasCoords = true;
					});
				} else if (geom.type === 'MultiLineString') {
					geom.coordinates.forEach((line) =>
						line.forEach((c) => {
							bounds.extend(c);
							hasCoords = true;
						})
					);
				}
			});
		});

		if (hasCoords) {
			map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
		}
	}

	onMount(async () => {
		maplibre = await import('maplibre-gl');
		const MapLibre = maplibre.default || maplibre;

		// Import CSS dynamically
		await import('maplibre-gl/dist/maplibre-gl.css');

		map = new MapLibre.Map({
			container: mapContainer,
			style: OPENFREE_STYLE,
			center: [-98.5, 39.5],
			zoom: 4
		});

		map.on('load', () => {
			addRoutesToMap();
			fitToRoutes();
		});
	});

	onDestroy(() => {
		if (map) map.remove();
	});

	$effect(() => {
		if (map && map.loaded()) {
			addRoutesToMap();
		}
	});

	$effect(() => {
		// React to highlightedRoute changes
		void highlightedRoute;
		if (map && map.loaded()) {
			addRoutesToMap();
		}
	});
</script>

<div class="map-container" bind:this={mapContainer}></div>

<style>
	.map-container {
		width: 100%;
		height: 100%;
	}
</style>
