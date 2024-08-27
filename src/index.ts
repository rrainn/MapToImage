import * as sharp from "sharp";
import * as axios from "axios";
import * as Jimp from "jimp";

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
		"layers": (string | {"url": string, "opacity"?: number} | ((z: number, x: number, y: number) => Buffer | Promise<Buffer>))[]
	}
}

function downloadTileURL(url: string, x: number, y: number, z: number) {
	return url.replace("{x}", x.toString()).replace("{y}", y.toString()).replace("{z}", z.toString());
}
async function downloadTile(url: string, opacity: number) {
	console.log("Fetching tile: " + url);
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

function coordinatesToTile(lat: number, lng: number, zoom: number) {
	const n = Math.pow(2, zoom);
	const x = (n * ((lng + 180) / 360));
	const latRad = lat * Math.PI / 180;
	const y = (n * (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2);

	return {
		x,
		y
	};
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

	let images: { input: string | (() => Buffer | Promise<Buffer>), left: number, top: number, opacity: number }[] = [];

	for (const layer of settings.map.layers) {
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
					"opacity": 1
				}
			} else {
				const layerURL = typeof layer === "string" ? layer : layer.url;
				const layerOpacity = typeof layer === "string" ? 1 : (layer.opacity ?? 1);
				return {
					"input": downloadTileURL(layerURL, Math.floor(x), Math.floor(y), zoom),
					"left": left,
					"top": top,
					"opacity": layerOpacity,
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
			return img2.input === img.input;
		}) === _index;
	}).map(async (img) => {
		return {
			...img,
			"input": typeof img.input === "string" ? await downloadTile(img.input, img.opacity) : await img.input()
		}
	})));

	return image;
}
