# MapToImage

## Description

This is a Node.js package that allows you to convert a map to an image. You can set the dimensions of the image, the zoom level, the center of the map, and the tile servers you wish to use.

## Installation

```bash
npm install maptoimage
```

## Usage

```js
const { mapToImage } = require("maptoimage");
const fs = require("fs");

(async () => {
	const img = mapToImage({
		"image": {
			"dimensions": {
				"width": 1280,
				"height": 720
			}
		},
		"map": {
			"center": {
				"lat": 39.67321,
				"lng": -104.95140
			},
			"zoom": 5,
			"layers": [
				"https://tile.openstreetmap.org/{z}/{x}/{y}.png",
				// https://mesonet.agron.iastate.edu/GIS/ridge.phtml
				"https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-0/{z}/{x}/{y}.png",
				async (z, x, y) => {
					const buffer = await fs.promises.readFile("tile.png");
					return buffer;
				}
			]
		}
	});
	fs.writeFileSync("map.png", img.png().toBuffer());
})();
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Please remember that the tile servers you use may have their own licenses.
