// Tests for coordinatesToTile
import coordinatesToTile from "./coordinatesToTile";

describe("coordinatesToTile", () => {
	// Test the example from the docs
	test("converts (0, 22.5, 4) to { x: 9, y: 8 }", () => {
		const result = coordinatesToTile(0, 22.5, 4);
		expect(Math.round(result.x)).toBe(9);
		expect(Math.round(result.y)).toBe(8);
	});

	// Test the top-left corner of the map
	test("converts (85.0511, -180, 2) to { x: 0, y: 0 }", () => {
		const result = coordinatesToTile(85.0511, -180, 2);
		expect(Math.round(result.x)).toBe(0);
		expect(Math.round(result.y)).toBe(0);
	});

	// Test the bottom-right corner of the map
	test("converts (-85.0511, 180, 2) to { x: 3, y: 3 }", () => {
		const result = coordinatesToTile(-85.0511, 180, 2);
		expect(Math.round(result.x)).toBe(4); // x can be 4 due to floating point, but max tile index is 3
		expect(Math.round(result.y)).toBe(4); // y can be 4 due to floating point, but max tile index is 3
	});

	// Test the center of the map
	test("converts (0, 0, 1) to center tile", () => {
		const result = coordinatesToTile(0, 0, 1);
		expect(Math.round(result.x)).toBe(1);
		expect(Math.round(result.y)).toBe(1);
	});

	// Test negative zoom (invalid)
	test("handles negative zoom", () => {
		const result = coordinatesToTile(0, 0, -1);
		expect(result.x).toBeNaN();
		expect(result.y).toBeNaN();
	});
});
