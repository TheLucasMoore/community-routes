import { json } from '@sveltejs/kit';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

// Haversine distance between two [lng, lat] points, returns km
function haversine([lng1, lat1], [lng2, lat2]) {
	const R = 6371;
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Collect all coordinate arrays from a GeoJSON feature collection
function collectCoords(geojson) {
	const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
	const segments = [];
	for (const f of features) {
		const geom = f.geometry;
		if (!geom) continue;
		if (geom.type === 'LineString') segments.push(geom.coordinates);
		else if (geom.type === 'MultiLineString') segments.push(...geom.coordinates);
	}
	return segments;
}

function computeStats(geojson) {
	const segments = collectCoords(geojson);
	if (segments.length === 0) return { distanceKm: 0, elevationGainM: 0, elevationProfile: [] };

	let totalKm = 0;
	let elevGain = 0;
	const rawProfile = []; // {d, ele}

	for (const coords of segments) {
		for (let i = 0; i < coords.length; i++) {
			const c = coords[i];
			if (i > 0) {
				const prev = coords[i - 1];
				totalKm += haversine(prev, c);
				const dEle = (c[2] ?? 0) - (prev[2] ?? 0);
				if (dEle > 0) elevGain += dEle;
			}
			if (c[2] != null) rawProfile.push({ d: totalKm, ele: c[2] });
		}
	}

	// Downsample profile to ≤200 points
	const MAX = 200;
	let profile = rawProfile;
	if (rawProfile.length > MAX) {
		const step = rawProfile.length / MAX;
		profile = Array.from({ length: MAX }, (_, i) => rawProfile[Math.round(i * step)]);
	}

	return {
		distanceKm: Math.round(totalKm * 10) / 10,
		elevationGainM: Math.round(elevGain),
		elevationProfile: profile
	};
}

export async function GET() {
	const routesDir = join(process.cwd(), '..', 'routes');
	let routes = [];

	try {
		const files = await readdir(routesDir);
		const geojsonFiles = files.filter((f) => f.endsWith('.geojson'));

		routes = await Promise.all(
			geojsonFiles.map(async (filename) => {
				const filePath = join(routesDir, filename);
				const content = await readFile(filePath, 'utf-8');
				const geojson = JSON.parse(content);
				const name = filename.replace('.geojson', '').replace(/-/g, ' ');
				const stats = computeStats(geojson);
				return { filename, name, geojson, ...stats };
			})
		);
	} catch (err) {
		console.error('Error reading routes:', err);
	}

	return json(routes);
}
