<script>
	import { onMount, onDestroy } from 'svelte';
	import { geojsonToGpx } from '$lib/gpxExport.js';

	let {
		routes = [],
		pois = [],
		highlightedRoute = null,
		editingRoute = $bindable(null),
		editMode = $bindable(false),
		onpoiadded = () => {}
	} = $props();

	let mapContainer;
	let map;
	let maplibre;
	let mapLoaded = $state(false);
	let draw = $state(null);
	let DrawControl = null;
	let fitted = false;
	let poiMarkers = [];

	// POI editor state
	let addPoiMode = $state(false);
	let pendingCoords = $state(null);
	let pendingMarker = null;
	let pendingPopup = null;
	let poiForm = $state({ name: '', type: 'other', description: '', url: '' });
	let saving = $state(false);

	const OPENFREE_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

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
			// Skip route currently in draw edit mode
			if (route.filename === editingRoute) return;

			const sourceId = `route-${route.filename}`;
			const lineLayerId = `line-${route.filename}`;
			const pointLayerId = `point-${route.filename}`;
			const isHighlighted = highlightedRoute === route.filename;

			map.addSource(sourceId, { type: 'geojson', data: route.geojson });

			map.addLayer({
				id: lineLayerId,
				type: 'line',
				source: sourceId,
				filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
				paint: {
					'line-color': isHighlighted ? '#ff6b00' : '#3b82f6',
					'line-width': isHighlighted ? 4 : 2.5,
					'line-opacity': 0.85
				}
			});

			map.addLayer({
				id: pointLayerId,
				type: 'circle',
				source: sourceId,
				filter: ['==', ['geometry-type'], 'Point'],
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
			const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];

			features.forEach((feature) => {
				const geom = feature.geometry;
				if (!geom) return;

				if (geom.type === 'Point') {
					bounds.extend([geom.coordinates[0], geom.coordinates[1]]);
					hasCoords = true;
				} else if (geom.type === 'LineString') {
					geom.coordinates.forEach((c) => {
						bounds.extend([c[0], c[1]]);
						hasCoords = true;
					});
				} else if (geom.type === 'MultiLineString') {
					geom.coordinates.forEach((line) =>
						line.forEach((c) => {
							bounds.extend([c[0], c[1]]);
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

	async function enterEditMode(route) {
		const targetFilename = route.filename;

		if (!DrawControl) {
			const [mod] = await Promise.all([
				import('maplibre-gl-draw'),
				import('maplibre-gl-draw/dist/mapbox-gl-draw.css')
			]);
			DrawControl = mod.default;
		}

		// Guard: editingRoute may have changed while we were loading the module
		if (editingRoute !== targetFilename) return;

		if (draw) map.removeControl(draw);

		const newDraw = new DrawControl({
			displayControlsDefault: false,
			controls: { line_string: true, trash: true },
			styles: drawStyles()
		});

		map.addControl(newDraw, 'top-right');
		newDraw.add(route.geojson);
		draw = newDraw;
	}

	function exitRouteEditMode() {
		if (draw) {
			map.removeControl(draw);
			draw = null;
		}
	}

	function exitAllEditing() {
		editMode = false;
		editingRoute = null;
		cancelAddPoi();
		exitRouteEditMode();
	}

	function exportGeoJSON() {
		if (!draw) return;
		const data = draw.getAll();
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		triggerDownload(blob, editingRoute || 'route.geojson');
	}

	function exportGPX() {
		if (!draw) return;
		const data = draw.getAll();
		const name = (editingRoute || 'route').replace('.geojson', '');
		const gpx = geojsonToGpx(data, name);
		const blob = new Blob([gpx], { type: 'application/gpx+xml' });
		triggerDownload(blob, `${name}.gpx`);
	}

	function triggerDownload(blob, filename) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	// Draw styles matching the app's color scheme
	function drawStyles() {
		return [
			{
				id: 'gl-draw-line',
				type: 'line',
				filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
				paint: { 'line-color': '#ff6b00', 'line-width': 3 }
			},
			{
				id: 'gl-draw-vertex-active',
				type: 'circle',
				filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
				paint: {
					'circle-radius': 6,
					'circle-color': '#ff6b00',
					'circle-stroke-width': 2,
					'circle-stroke-color': '#ffffff'
				}
			},
			{
				id: 'gl-draw-midpoint',
				type: 'circle',
				filter: ['all', ['==', 'meta', 'midpoint'], ['==', '$type', 'Point']],
				paint: { 'circle-radius': 4, 'circle-color': '#ff6b00', 'circle-opacity': 0.6 }
			}
		];
	}

	function addPoisToMap() {
		if (!map || !maplibre) return;

		poiMarkers.forEach((m) => m.remove());
		poiMarkers = [];

		const MapLibre = maplibre.default || maplibre;

		pois.forEach((poi) => {
			const [lng, lat] = poi.geometry.coordinates;
			const props = poi.properties ?? {};

			const el = document.createElement('div');
			el.className = 'poi-marker';
			el.textContent = poiIcon(props.type);
			el.title = props.name ?? '';

			const popup = new MapLibre.Popup({ offset: 16, closeButton: false })
				.setHTML(poiPopupHTML(props));

			const marker = new MapLibre.Marker({ element: el })
				.setLngLat([lng, lat])
				.setPopup(popup)
				.addTo(map);

			poiMarkers.push(marker);
		});
	}

	function poiIcon(type) {
		const icons = { hut: '🛖', camp: '⛺', viewpoint: '👁', water: '💧' };
		return icons[type] ?? '📍';
	}

	function poiPopupHTML(props) {
		const elev = props.elevation_m ? `<span class="poi-elev">${props.elevation_m.toLocaleString()} m</span>` : '';
		const desc = props.description ? `<p class="poi-desc">${props.description}</p>` : '';
		const link = props.url ? `<a href="${props.url}" target="_blank" rel="noopener">More info ↗</a>` : '';
		return `<div class="poi-popup"><strong>${props.name ?? 'POI'}</strong>${elev}${desc}${link}</div>`;
	}

	function handleMapClick(e) {
		if (!addPoiMode) return;
		const { lng, lat } = e.lngLat;
		pendingCoords = [parseFloat(lng.toFixed(5)), parseFloat(lat.toFixed(5))];

		if (pendingMarker) pendingMarker.remove();
		const MapLibre = maplibre.default || maplibre;
		const el = document.createElement('div');
		el.className = 'pending-marker-dot';

		pendingPopup = new MapLibre.Popup({ closeButton: false, closeOnClick: false, offset: 12 })
			.setHTML(`<span class="pending-pin-popup">${poiIcon(poiForm.type)}</span>`);

		pendingMarker = new MapLibre.Marker({ element: el, draggable: true })
			.setLngLat([lng, lat])
			.setPopup(pendingPopup)
			.addTo(map);

		pendingMarker.togglePopup();

		pendingMarker.on('dragend', () => {
			const pos = pendingMarker.getLngLat();
			pendingCoords = [parseFloat(pos.lng.toFixed(5)), parseFloat(pos.lat.toFixed(5))];
		});
	}

	function toggleAddPoiMode() {
		if (addPoiMode || pendingCoords) {
			cancelAddPoi();
		} else {
			addPoiMode = true;
		}
	}

	function cancelAddPoi() {
		addPoiMode = false;
		pendingCoords = null;
		if (pendingMarker) {
			pendingMarker.remove();
			pendingMarker = null;
		}
		pendingPopup = null;
		poiForm = { name: '', type: 'other', description: '', url: '' };
	}

	async function savePoi() {
		if (!pendingCoords || !poiForm.name.trim()) return;
		saving = true;

		const feature = {
			type: 'Feature',
			properties: {
				name: poiForm.name.trim(),
				type: poiForm.type,
				...(poiForm.description.trim() && { description: poiForm.description.trim() }),
				...(poiForm.url.trim() && { url: poiForm.url.trim() })
			},
			geometry: { type: 'Point', coordinates: pendingCoords }
		};

		try {
			const res = await fetch('/api/pois', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(feature)
			});
			if (res.ok) {
				onpoiadded(feature);
				cancelAddPoi();
			}
		} finally {
			saving = false;
		}
	}

	$effect(() => {
		const icon = poiIcon(poiForm.type);
		if (pendingPopup) {
			pendingPopup.setHTML(`<span class="pending-pin-popup">${icon}</span>`);
		}
	});

	// When edit mode is turned off externally, clean up
	$effect(() => {
		if (!editMode) {
			cancelAddPoi();
			exitRouteEditMode();
		}
	});

	onMount(async () => {
		maplibre = await import('maplibre-gl');
		const MapLibre = maplibre.default || maplibre;

		await import('maplibre-gl/dist/maplibre-gl.css');

		map = new MapLibre.Map({
			container: mapContainer,
			style: OPENFREE_STYLE,
			center: [-98.5, 39.5],
			zoom: 4
		});

		map.on('load', () => {
			mapLoaded = true;
		});

		map.on('click', handleMapClick);
	});

	onDestroy(() => {
		if (map) map.remove();
	});

	// Re-render routes when routes, highlight, or edit mode changes
	$effect(() => {
		void routes;
		void highlightedRoute;
		void editingRoute;
		if (mapLoaded) addRoutesToMap();
	});

	// Render POI markers
	$effect(() => {
		void pois;
		if (mapLoaded) addPoisToMap();
	});

	// Fit to bounds once when routes first load
	$effect(() => {
		if (mapLoaded && routes.length > 0 && !fitted) {
			fitted = true;
			fitToRoutes();
		}
	});

	// Manage draw control lifecycle
	$effect(() => {
		if (!mapLoaded) return;
		const route = routes.find((r) => r.filename === editingRoute);
		if (route) {
			enterEditMode(route);
		} else {
			exitRouteEditMode();
		}
	});
</script>

<div class="map-wrapper" class:crosshair={editMode && addPoiMode && !pendingCoords}>
	<div class="map-container" bind:this={mapContainer}></div>

	<!-- Entry button: only visible in view mode -->
	{#if !editMode}
		<button class="edit-entry-btn" onclick={() => (editMode = true)} title="Enter edit mode">
			✏️ Edit
		</button>
	{/if}

	<!-- Unified edit toolbar: visible in edit mode -->
	{#if editMode}
		<div class="edit-toolbar">
			<span class="toolbar-label">Edit Mode</span>

			<div class="toolbar-tools">
				<button
					class="toolbar-btn"
					class:active={addPoiMode || !!pendingCoords}
					onclick={toggleAddPoiMode}
				>
					{addPoiMode || pendingCoords ? '✕ Cancel POI' : '＋ Add POI'}
				</button>

				{#if highlightedRoute && !draw && !addPoiMode}
					<button class="toolbar-btn" onclick={() => (editingRoute = highlightedRoute)}>
						🗺 Edit Route
					</button>
				{/if}

				{#if draw}
					<button class="toolbar-btn" onclick={exportGeoJSON}>⬇ GeoJSON</button>
					<button class="toolbar-btn" onclick={exportGPX}>⬇ GPX</button>
				{/if}
			</div>

			<button class="toolbar-btn toolbar-done" onclick={exitAllEditing}>✕ Done</button>
		</div>
	{/if}

	<!-- POI placement hint -->
	{#if editMode && addPoiMode && !pendingCoords}
		<div class="map-hint">Click the map to place a pin</div>
	{/if}

	<!-- POI form panel -->
	{#if pendingCoords}
		<div class="poi-form-panel">
			<h3>New Point of Interest</h3>
			<div class="form-row">
				<label>
					Name <span class="required">*</span>
					<input bind:value={poiForm.name} placeholder="e.g. Skinner Hut" />
				</label>
			</div>
			<div class="form-row">
				<label>
					Type
					<select bind:value={poiForm.type}>
						<option value="other">📍 Pin</option>
						<option value="hut">🛖 Hut</option>
						<option value="camp">⛺ Camp</option>
						<option value="viewpoint">👁 Viewpoint</option>
						<option value="water">💧 Water</option>
					</select>
				</label>
			</div>
			<div class="form-row">
				<label>
					Description
					<input bind:value={poiForm.description} placeholder="Optional" />
				</label>
			</div>
			<div class="form-row">
				<label>
					URL
					<input bind:value={poiForm.url} placeholder="https://..." type="url" />
				</label>
			</div>
			<div class="form-coords">
				{pendingCoords[1]}, {pendingCoords[0]} — drag pin to adjust
			</div>
			<div class="form-actions">
				<button class="btn-save" onclick={savePoi} disabled={!poiForm.name.trim() || saving}>
					{saving ? 'Saving…' : 'Save POI'}
				</button>
				<button class="btn-cancel" onclick={cancelAddPoi}>Cancel</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.map-wrapper {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.map-container {
		width: 100%;
		height: 100%;
	}

	.crosshair :global(.maplibregl-canvas) {
		cursor: crosshair !important;
	}

	/* Entry button — bottom right, view mode only */
	.edit-entry-btn {
		position: absolute;
		bottom: 32px;
		right: 10px;
		padding: 7px 14px;
		background: #ffffff;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.82rem;
		font-weight: 500;
		cursor: pointer;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
		z-index: 10;
		transition: background 0.15s, border-color 0.15s;
	}

	.edit-entry-btn:hover {
		background: #f9fafb;
		border-color: #9ca3af;
	}

	/* Unified edit toolbar — top of map */
	.edit-toolbar {
		position: absolute;
		top: 10px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 6px;
		background: #1f2937;
		color: #f9fafb;
		padding: 7px 10px;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		font-size: 0.82rem;
		z-index: 10;
		white-space: nowrap;
	}

	.toolbar-label {
		font-weight: 600;
		color: #ff6b00;
		padding-right: 6px;
		border-right: 1px solid #374151;
		margin-right: 2px;
	}

	.toolbar-tools {
		display: flex;
		gap: 5px;
	}

	.toolbar-btn {
		padding: 5px 11px;
		border: 1px solid #4b5563;
		border-radius: 5px;
		background: #374151;
		color: #f9fafb;
		cursor: pointer;
		font-size: 0.8rem;
		transition: background 0.15s;
	}

	.toolbar-btn:hover {
		background: #4b5563;
	}

	.toolbar-btn.active {
		background: #7c2d12;
		border-color: #ff6b00;
		color: #fed7aa;
	}

	.toolbar-done {
		border-color: #6b7280;
		color: #d1d5db;
		margin-left: 4px;
	}

	.map-hint {
		position: absolute;
		top: 54px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.7);
		color: #fff;
		font-size: 0.78rem;
		padding: 5px 12px;
		border-radius: 5px;
		pointer-events: none;
		z-index: 10;
		white-space: nowrap;
	}

	.poi-form-panel {
		position: absolute;
		top: 10px;
		left: 10px;
		width: 260px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 14px 16px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
		z-index: 20;
	}

	.poi-form-panel h3 {
		margin: 0 0 12px;
		font-size: 0.9rem;
		font-weight: 600;
		color: #111827;
	}

	.form-row {
		margin-bottom: 9px;
	}

	.form-row label {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 0.75rem;
		font-weight: 500;
		color: #6b7280;
	}

	.form-row input,
	.form-row select {
		padding: 6px 8px;
		border: 1px solid #d1d5db;
		border-radius: 5px;
		font-size: 0.83rem;
		color: #111827;
		background: #fff;
		outline: none;
		transition: border-color 0.15s;
	}

	.form-row input:focus,
	.form-row select:focus {
		border-color: #ff6b00;
	}

	.required {
		color: #ef4444;
	}

	.form-coords {
		font-size: 0.7rem;
		color: #9ca3af;
		margin: 6px 0 10px;
	}

	.form-actions {
		display: flex;
		gap: 7px;
	}

	.btn-save {
		flex: 1;
		padding: 7px;
		background: #ff6b00;
		color: #fff;
		border: none;
		border-radius: 5px;
		font-size: 0.83rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-save:hover:not(:disabled) {
		background: #ea5c00;
	}

	.btn-save:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-cancel {
		padding: 7px 12px;
		background: none;
		border: 1px solid #d1d5db;
		border-radius: 5px;
		font-size: 0.83rem;
		color: #6b7280;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-cancel:hover {
		background: #f3f4f6;
	}

	:global(.pending-marker-dot) {
		width: 12px;
		height: 12px;
		background: #ff6b00;
		border: 2px solid #fff;
		border-radius: 50%;
		box-shadow: 0 0 0 2px #ff6b00;
		animation: pending-pulse 1.2s ease-in-out infinite;
	}

	@keyframes -global-pending-pulse {
		0%, 100% { box-shadow: 0 0 0 2px #ff6b00; }
		50% { box-shadow: 0 0 0 5px rgba(255, 107, 0, 0.3); }
	}

	:global(.pending-pin-popup) {
		font-size: 1.4rem;
		line-height: 1;
		display: block;
	}

	:global(.poi-marker) {
		font-size: 1.4rem;
		cursor: pointer;
		filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.4));
		transition: transform 0.15s;
	}

	:global(.poi-marker:hover) {
		transform: scale(1.2);
	}

	:global(.poi-popup) {
		font-size: 0.82rem;
		line-height: 1.4;
		min-width: 160px;
	}

	:global(.poi-popup strong) {
		display: block;
		font-size: 0.9rem;
		margin-bottom: 3px;
		color: #111827;
	}

	:global(.poi-elev) {
		display: inline-block;
		font-size: 0.75rem;
		color: #6b7280;
		margin-bottom: 5px;
	}

	:global(.poi-desc) {
		margin: 4px 0;
		color: #374151;
	}

	:global(.poi-popup a) {
		color: #ff6b00;
		text-decoration: none;
		font-size: 0.78rem;
	}

	:global(.poi-popup a:hover) {
		text-decoration: underline;
	}
</style>
