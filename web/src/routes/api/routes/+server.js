import { json } from '@sveltejs/kit';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

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
				return { filename, name, geojson };
			})
		);
	} catch (err) {
		console.error('Error reading routes:', err);
	}

	return json(routes);
}
