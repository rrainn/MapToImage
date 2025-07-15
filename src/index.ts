import * as sharp from "sharp";
import * as axios from "axios";
import * as Jimp from "jimp";
import downloadTileURL from "./downloadTileURL";
import coordinatesToTile from "./coordinatesToTile";

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
	"times": 0,
	"delay": 0
};
interface RetryOptions {
	/**
	 * The number of times to retry the request if it fails.
	 * Defaults to 0 (no retries).
	 */
	"times"?: number,
	/**
	 * The delay between retries in milliseconds.
	 * Defaults to 0.
	 */
	"delay"?: number
}

type Layer = string | {
	"url": string,
	"opacity"?: number,
	"fallback"?: ((z: number, x: number, y: number) => Buffer | Promise<Buffer>),
	"retry"?: RetryOptions
} | ((z: number, x: number, y: number) => Buffer | Promise<Buffer>);

export interface MapToImageSettings {
	/**
	 * The image settings.
	 */
	"image": {
		/**
		 * The dimensions of the image.
		 */
		"dimensions": {
			/**
			 * The width of the image.
			 */
			"width": number,
			/**
			 * The height of the image.
			 */
			"height": number
		}
	},
	/**
	 * The map settings.
	 */
	"map": {
		/**
		 * The center of the map.
		 */
		"center": {
			/**
			 * The latitude of the center of the map.
			 */
			"lat": number,
			/**
			 * The longitude of the center of the map.
			 */
			"lng": number
		},
		/**
		 * The zoom level of the map.
		 *
		 * Please ensure that your layers support the zoom level you are using.
		 *
		 * @see https://wiki.openstreetmap.org/wiki/Zoom_levels
		 */
		"zoom": number,
		/**
		 * An array of map layers to use.
		 *
		 * The system will replace `{z}`, `{x}`, and `{y}` with the zoom level, x coordinate, and y coordinate respectively.
		 *
		 * The layers will be layered on top of each other in the order they are in the array. Meaning the first layer in the array will be on the bottom, and the last layer in the array will be on the top.
		 *
		 * You can also pass in an array of objects with each object containing a `url` (string) & `opacity` (number) property. The `url` property will be the URL of the tile server, and the `opacity` property will be the opacity of the layer. The opacity property is optional and defaults to `1`.
		 *
		 * @example ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"]
		 */
		"layers": Layer[]
	}
}

async function timeout(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadTile(url: string, opacity: number, retry: RetryOptions) {
	console.log("Fetching tile: " + url);
	async function run(url: string, opacity: number) {
		const result = await axios.default.get(url, {
			"responseType": "arraybuffer"
		});
		let buffer: Buffer = Buffer.from(result.data, "binary");
		if (opacity !== 1) {
			const image = await Jimp.read(buffer);
			image.opacity(opacity);
			buffer = await image.getBufferAsync(Jimp.MIME_PNG);
		}
		return buffer;
	}

	let totalAttempts = 0;
	const maxAttempts = 1 + (retry.times || 0); // We always want to try at least once.

	while (totalAttempts < maxAttempts) {
		try {
			const buffer = await run(url, opacity);
			return buffer;
		} catch (error) {
			totalAttempts++;
			if (retry.delay) {
				await timeout(retry.delay);
			}
		}
	}

	console.error("Failed to download tile after " + totalAttempts + " attempts: " + url);
	throw new Error("Failed to download tile after " + totalAttempts + " attempts: " + url);
}

export async function mapToImage(settings: MapToImageSettings) {
	let image = sharp({
		"create": {
			"width": settings.image.dimensions.width,
			"height": settings.image.dimensions.height,
			"channels": 4,
			"background": {
				"r": 0,
				"g": 0,
				"b": 0,
				"alpha": 0
			}
		}
	});

	const imageCenter = {
		"x": settings.image.dimensions.width / 2,
		"y": settings.image.dimensions.height / 2
	};

	let images: ({ input: (() => Buffer | Promise<Buffer>), left: number, top: number, opacity: number, layerIndex: number, fallback: (() => Buffer | Promise<Buffer>) | undefined } | { input: string, left: number, top: number, opacity: number, layerIndex: number, retry: RetryOptions, fallback: (() => Buffer | Promise<Buffer>) | undefined })[] = [];

	for (const index in settings.map.layers) {
		const layer = settings.map.layers[index];
		const layerNumber = parseInt(index);
		const tile = coordinatesToTile(settings.map.center.lat, settings.map.center.lng, settings.map.zoom);
		const offsetOfCoordinates = {
			"x": (tile.x - Math.floor(tile.x)) * 256,
			"y": (tile.y - Math.floor(tile.y)) * 256
		};

		function createImageObject(x: number, y: number, zoom: number, left: number, top: number) {
			if (typeof layer === "function") {
				return {
					"input": (): Buffer | Promise<Buffer> => layer(zoom, Math.floor(x), Math.floor(y)),
					"left": left,
					"top": top,
					"opacity": 1,
					"layerIndex": layerNumber,
					"fallback": undefined
				}
			} else {
				const layerURL = typeof layer === "string" ? layer : layer.url;
				const layerOpacity = typeof layer === "string" ? 1 : (layer.opacity ?? 1);
				const fallbackFunction = typeof layer === "object" ? layer.fallback : undefined;
				return {
					"input": downloadTileURL(layerURL, Math.floor(x), Math.floor(y), zoom),
					"left": left,
					"top": top,
					"opacity": layerOpacity,
					"layerIndex": layerNumber,
					"retry": typeof layer === "object" ? (layer.retry ?? DEFAULT_RETRY_OPTIONS) : DEFAULT_RETRY_OPTIONS,
					"fallback": fallbackFunction ? ((): Buffer | Promise<Buffer> => fallbackFunction(zoom, Math.floor(x), Math.floor(y))) : undefined
				};
			}
		}

		const img = createImageObject(tile.x, tile.y, settings.map.zoom, Math.round((imageCenter.x - (256 / 2))) + Math.round((256 / 2) - offsetOfCoordinates.x), Math.round((imageCenter.y - (256 / 2))) + Math.round((256 / 2) - offsetOfCoordinates.y));
		images.push(img);

		// We now have the primary tile that the user asked for.
		// We now need to fill in the rest of the image with surrounding tiles.
		// To do this we create two functions to move in the Y and X directions. The X direction will call the Y direction.
		// The pattern looks like this:
		// Right -> Down -> Up
		// Left -> Down -> Up
		// So it'll go to the right one tile, then go down all the way, then up all the way. Then it'll continue by going to the right one more tile, then down all the way, then up all the way. And so on until the end of the image.
		// After that it'll repeat the same thing but for the left side of the image.
		function moveInDirectionY(tile: { x: number, y: number }, zoom: number, img: any, currentBorder: number, x: number, direction: "down" | "up") {
			let currentDownBorder: number = img.top;
			let numB = 0;
			while (direction === "down" ? currentDownBorder < settings.image.dimensions.height : currentDownBorder > -256) {
				images.push(createImageObject(x, Math.floor(tile.y) + (direction === "down" ? numB : -numB), settings.map.zoom, currentBorder, currentDownBorder));
				currentDownBorder += direction === "down" ? 256 : -256;
				numB++;
			}
		}
		function moveInDirectionX(tile: { x: number, y: number }, zoom: number, img: any, direction: "right" | "left") {
			let currentRightBorder: number = img.left;
			let numA = 0;
			while (direction === "right" ? currentRightBorder < settings.image.dimensions.width : currentRightBorder > -256) {
				const x = Math.floor(tile.x) + (direction === "right" ? numA : -numA);
				images.push(createImageObject(x, Math.floor(tile.y), settings.map.zoom, currentRightBorder, img.top));

				// Down
				moveInDirectionY(tile, settings.map.zoom, img, currentRightBorder, x, "down");

				// Up
				moveInDirectionY(tile, settings.map.zoom, img, currentRightBorder, x, "up");

				currentRightBorder += direction === "right" ? 256 : -256;
				numA++;
			}
		}
		moveInDirectionX(tile, settings.map.zoom, img, "right");
		moveInDirectionX(tile, settings.map.zoom, img, "left");
	}

	image = image.composite(await Promise.all(images.filter((img, _index, array) => {
		return array.findIndex((img2) => {
			// If we are getting the same layer at the same position, filter it out.
			return img2.layerIndex == img.layerIndex && img2.top == img.top && img2.left == img.left;
		}) === _index;
	}).map(async (img) => {
		let buffer: Buffer;
		try {
			if (typeof img.input === "string") {
				const retryOptions = "retry" in img ? img.retry : DEFAULT_RETRY_OPTIONS;
				buffer = await downloadTile(img.input, img.opacity, retryOptions);
			} else {
				buffer = await img.input();
			}
		} catch (error) {
			buffer = await img.fallback?.() ?? await (await Jimp.read(Buffer.alloc(256 * 256 * 4, 0))).getBufferAsync(Jimp.MIME_PNG);
		}
		return {
			...img,
			"input": buffer
		}
	})));

	return image;
}
