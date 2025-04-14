/**
 * Converts geographic coordinates to tile (x, y, z) coordinates.
 * This is useful for converting a latitude, longitude, and zoom level to tile coordinates to receive a tile image.
 *
 * This function will return NaN for the x and y coordinates if the zoom level is negative.
 *
 * @param lat The latitude of the point.
 * @param lng The longitude of the point.
 * @param zoom The zoom level.
 * @returns The tile coordinates.
 * @example
 * ```ts
 * const lat = 0;
 * const lng = 22.5;
 * const zoom = 4;
 * const tileCoords = coordinatesToTile(lat, lng, zoom);
 * console.log(tileCoords); // { x: 9, y: 8 }
 * ```
 * @see https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
 * @see https://wiki.openstreetmap.org/wiki/Zoom_levels
 */
export default function coordinatesToTile(lat: number, lng: number, zoom: number) {
	if (zoom < 0) {
		return {
			x: NaN,
			y: NaN
		};
	}

	const n = Math.pow(2, zoom);
	const x = (n * ((lng + 180) / 360));
	const latRad = lat * Math.PI / 180;
	const y = (n * (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2);

	return {
		x,
		y
	};
}
