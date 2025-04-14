// Tests for downloadTileURL
import downloadTileURL from "./downloadTileURL";

describe("downloadTileURL", () => {
	// Test basic replacement
	test("replaces {x}, {y}, {z} with numbers", () => {
		const url = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
		const result = downloadTileURL(url, 1, 2, 3);
		expect(result).toBe("https://tile.openstreetmap.org/3/1/2.png");
	});

	// Test with multiple occurrences
	test("replaces only the first occurrence of each placeholder", () => {
		const url = "{z}/{z}/{x}/{y}/{x}/{y}";
		const result = downloadTileURL(url, 5, 6, 7);
		expect(result).toBe("7/{z}/5/6/{x}/{y}");
	});

	// Test with missing placeholders
	test("returns the same string if no placeholders", () => {
		const url = "no/placeholders/here.png";
		const result = downloadTileURL(url, 1, 2, 3);
		expect(result).toBe("no/placeholders/here.png");
	});

	// Test with negative numbers
	test("works with negative coordinates", () => {
		const url = "tiles/{z}/{x}/{y}.png";
		const result = downloadTileURL(url, -1, -2, -3);
		expect(result).toBe("tiles/-3/-1/-2.png");
	});

	// Test with zero values
	test("works with zero coordinates", () => {
		const url = "tiles/{z}/{x}/{y}.png";
		const result = downloadTileURL(url, 0, 0, 0);
		expect(result).toBe("tiles/0/0/0.png");
	});
});
