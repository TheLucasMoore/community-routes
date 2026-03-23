/**
 * Convert a GeoJSON FeatureCollection (from maplibre-gl-draw) to a GPX XML string.
 * Each LineString/MultiLineString segment becomes a <trkseg>.
 */
export function geojsonToGpx(geojson, name = 'route') {
	const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];

	// Collect coordinate arrays per segment
	const segments = [];
	for (const f of features) {
		const geom = f.geometry;
		if (!geom) continue;
		if (geom.type === 'LineString') segments.push(geom.coordinates);
		else if (geom.type === 'MultiLineString') segments.push(...geom.coordinates);
	}

	const trksegs = segments
		.map((coords) => {
			const trkpts = coords
				.map(([lng, lat, ele]) => {
					const elTag = ele != null ? `\n        <ele>${ele.toFixed(1)}</ele>` : '';
					return `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">${elTag}\n      </trkpt>`;
				})
				.join('\n');
			return `    <trkseg>\n${trkpts}\n    </trkseg>`;
		})
		.join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="community-routes"
     xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
${trksegs}
  </trk>
</gpx>`;
}
