import { json } from '@sveltejs/kit';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const filePath = () => join(process.cwd(), '..', 'routes', 'pois.geojson');

export async function GET() {
	try {
		const content = await readFile(filePath(), 'utf-8');
		const geojson = JSON.parse(content);
		return json(geojson.features ?? []);
	} catch {
		return json([]);
	}
}

export async function POST({ request }) {
	const feature = await request.json();

	let geojson;
	try {
		const content = await readFile(filePath(), 'utf-8');
		geojson = JSON.parse(content);
	} catch {
		geojson = { type: 'FeatureCollection', features: [] };
	}

	geojson.features.push(feature);
	await writeFile(filePath(), JSON.stringify(geojson, null, 2));

	return json(feature, { status: 201 });
}
