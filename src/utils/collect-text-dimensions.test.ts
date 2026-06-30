import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectTextDimensions } from "./collect-text-dimensions";

// Helper: create a DOM tree, mock Range + getBoundingClientRect
function createElement(
	tag: string,
	options?: {
		text?: string;
		children?: HTMLElement[];
		width?: number;
		height?: number;
		role?: string;
	},
): HTMLElement {
	const el = document.createElement(tag);

	if (options?.role) {
		el.setAttribute("role", options.role);
	}

	if (options?.text && (!options?.children || options.children.length === 0)) {
		el.textContent = options.text;
	}

	if (options?.children) {
		for (const child of options.children) {
			el.appendChild(child);
		}
	}

	const w = options?.width ?? 100;
	const h = options?.height ?? 20;
	el.getBoundingClientRect = () => ({
		width: w,
		height: h,
		top: 0,
		left: 0,
		right: w,
		bottom: h,
		x: 0,
		y: 0,
		toJSON: () => {},
	});

	return el;
}

// Mock Range.selectNodeContents + getBoundingClientRect
beforeEach(() => {
	let mockWidth = 80;
	vi.spyOn(document, "createRange").mockImplementation(() => {
		const range = {
			selectNodeContents: (node: Node) => {
				// Use parent element's mock width for text nodes
				if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
					const el = node.parentElement;
					const rect = el.getBoundingClientRect();
					mockWidth = rect.width * 0.9; // Simulate text being slightly narrower
				} else if (node instanceof HTMLElement) {
					mockWidth = node.getBoundingClientRect().width * 0.9;
				}
			},
			getBoundingClientRect: () => ({
				width: mockWidth,
				height: 20,
				top: 0,
				left: 0,
				right: mockWidth,
				bottom: 20,
				x: 0,
				y: 0,
				toJSON: () => {},
			}),
		};
		return range as unknown as Range;
	});
});

describe("collectTextDimensions", () => {
	it("collects widths and heights from a leaf text element", () => {
		const el = createElement("span", { text: "Hello", width: 100, height: 20 });
		const result = collectTextDimensions(el);

		expect(result.widths.t0).toBeDefined();
		expect(result.heights.t0).toBe(20);
		expect(typeof result.widths.t0).toBe("number");
	});

	it("assigns sequential keys to multiple text nodes", () => {
		const child1 = createElement("span", {
			text: "First",
			width: 80,
			height: 16,
		});
		const child2 = createElement("span", {
			text: "Second",
			width: 120,
			height: 18,
		});
		const root = createElement("div", { children: [child1, child2] });

		const result = collectTextDimensions(root);

		expect(result.widths.t0).toBeDefined();
		expect(result.widths.t1).toBeDefined();
		expect(result.heights.t0).toBe(16);
		expect(result.heights.t1).toBe(18);
	});

	it("skips SCRIPT elements", () => {
		const script = createElement("script", { text: "var x = 1;" });
		const span = createElement("span", {
			text: "Visible",
			width: 50,
			height: 14,
		});
		const root = createElement("div", { children: [script, span] });

		const result = collectTextDimensions(root);

		// Only one text key (the span), script is skipped
		expect(Object.keys(result.widths)).toEqual(["t0"]);
	});

	it("skips IMG elements", () => {
		const img = createElement("img");
		const span = createElement("span", { text: "Text", width: 60, height: 14 });
		const root = createElement("div", { children: [img, span] });

		const result = collectTextDimensions(root);

		expect(Object.keys(result.widths)).toEqual(["t0"]);
	});

	it("skips SVG elements", () => {
		const root = createElement("div");
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		root.appendChild(svg);
		const span = createElement("span", { text: "Text", width: 60, height: 14 });
		root.appendChild(span);

		const result = collectTextDimensions(root);

		expect(Object.keys(result.widths)).toEqual(["t0"]);
	});

	it("skips bare text inside BUTTON elements", () => {
		const btn = createElement("button", { text: "Click me" });
		const span = createElement("span", { text: "Label" });
		const root = createElement("div", { children: [btn, span] });

		const result = collectTextDimensions(root);

		expect(Object.keys(result.widths)).toEqual(["t0"]);
	});

	it("skips bare text inside elements with role=button", () => {
		const roleBtn = createElement("div", { text: "Clickable", role: "button" });
		const span = createElement("span", { text: "Normal" });
		const root = createElement("div", { children: [roleBtn, span] });

		const result = collectTextDimensions(root);

		expect(Object.keys(result.widths)).toEqual(["t0"]);
	});

	it("measures text inside interactive element children (button > span)", () => {
		const span = createElement("span", {
			text: "Click me",
			width: 70,
			height: 16,
		});
		const btn = createElement("button", { children: [span] });
		const root = createElement("div", { children: [btn] });

		const result = collectTextDimensions(root);

		expect(Object.keys(result.widths)).toEqual(["t0"]);
		expect(result.heights.t0).toBe(16);
	});

	it("measures text when root is an interactive element with child elements", () => {
		const span = createElement("span", {
			text: "Submit",
			width: 60,
			height: 14,
		});
		const root = createElement("button", {
			children: [span],
			width: 100,
			height: 40,
		});

		const result = collectTextDimensions(root);

		expect(Object.keys(result.widths).sort()).toEqual(["e0", "t0"]);
		expect(result.widths.e0).toBe(100);
		expect(result.heights.e0).toBe(40);
		expect(result.heights.t0).toBe(14);
	});

	it("measures the root box (e0) for an interactive/media/svg root", () => {
		const root = createElement("button", { width: 100, height: 40 });

		const result = collectTextDimensions(root);

		expect(result.widths.e0).toBe(100);
		expect(result.heights.e0).toBe(40);
	});

	it("does not emit a root box key for a non-box root (div)", () => {
		const span = createElement("span", { text: "Hi", width: 30, height: 12 });
		const root = createElement("div", { children: [span] });

		const result = collectTextDimensions(root);

		expect(result.widths.e0).toBeUndefined();
		expect(Object.keys(result.widths)).toEqual(["t0"]);
	});

	it("does not measure bare text nodes inside interactive elements", () => {
		const btn = createElement("button", { width: 100, height: 30 });
		btn.appendChild(document.createTextNode("Click"));
		const root = createElement("div", { children: [btn] });

		const result = collectTextDimensions(root);

		expect(result.widths).toEqual({});
		expect(result.heights).toEqual({});
	});

	it("handles bare text nodes in a layout element", () => {
		const root = createElement("div", { width: 200, height: 30 });
		root.appendChild(document.createTextNode("Bare text"));

		const result = collectTextDimensions(root);

		expect(result.widths.t0).toBeDefined();
		expect(result.heights.t0).toBe(30); // parent height
	});

	it("handles deeply nested text", () => {
		const inner = createElement("span", {
			text: "Deep",
			width: 40,
			height: 12,
		});
		const mid = createElement("div", { children: [inner] });
		const root = createElement("div", { children: [mid] });

		const result = collectTextDimensions(root);

		expect(result.widths.t0).toBeDefined();
		expect(result.heights.t0).toBe(12);
	});

	it("returns empty records for an element with no text", () => {
		const root = createElement("div");

		const result = collectTextDimensions(root);

		expect(result.widths).toEqual({});
		expect(result.heights).toEqual({});
	});

	it("skips empty text nodes (whitespace only)", () => {
		const root = createElement("div");
		root.appendChild(document.createTextNode("   "));

		const result = collectTextDimensions(root);

		expect(result.widths).toEqual({});
		expect(result.heights).toEqual({});
	});

	it("handles mixed text nodes and element children", () => {
		const root = createElement("div", { width: 300, height: 40 });
		root.appendChild(document.createTextNode("Text "));
		const span = createElement("span", { text: "more", width: 60, height: 16 });
		root.appendChild(span);
		root.appendChild(document.createTextNode(" end"));

		const result = collectTextDimensions(root);

		// t0 = "Text " (bare text node), t1 = "more" (span leaf), t2 = " end" (bare text node)
		expect(Object.keys(result.widths).length).toBe(3);
		expect(result.widths.t0).toBeDefined();
		expect(result.widths.t1).toBeDefined();
		expect(result.widths.t2).toBeDefined();
	});
});
