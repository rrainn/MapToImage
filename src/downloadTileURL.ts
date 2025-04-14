/**
 * This function replaces the `{x}`, `{y}`, and `{z}` placeholders in a URL string with the provided x, y, and z coordinates.
 *
 * @param url The string of the URL to replace the `{x}`, `{y}`, and `{z}` with the x, y, and z coordinates.
 * @param x The x coordinate of the tile as a number.
 * @param y The y coordinate of the tile as a number.
 * @param z The zoom level of the tile as a number.
 * @returns The modified URL with the coordinates replaced as a string.
 * @example
 * ```ts
 * const url = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
 * const x = 1;
 * const y = 2;
 * const z = 3;
 * const modifiedUrl = downloadTileURL(url, x, y, z);
 * console.log(modifiedUrl); // "https://tile.openstreetmap.org/3/1/2.png"
 * ```
 */
export default function (url: string, x: number, y: number, z: number) {
	return url.replace("{x}", x.toString()).replace("{y}", y.toString()).replace("{z}", z.toString());
}
