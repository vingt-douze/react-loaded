/**
 * Skeleton layout fidelity tests.
 *
 * These tests verify that the skeleton generation pipeline produces DOM
 * structures that preserve the original component's dimensions.  Each test
 * builds a CapturedNode tree (simulating what serialize produces), generates
 * a skeleton component via generateComponent(), dynamically evaluates it,
 * renders it with React Testing Library, and inspects the resulting DOM to
 * assert that the right CSS properties are in place.
 *
 * jsdom does not perform real layout so we cannot measure pixel widths, but
 * we CAN verify:
 *  - inline style properties (width, height, min-width, min-height, CSS vars)
 *  - text content is preserved (not collapsed to empty)
 *  - correct CSS classes are applied
 *  - structural integrity (correct nesting, tag names)
 *
 * These fixtures cover the layouts that are most susceptible to skeleton
 * dimension drift: inline spans, flex containers, block paragraphs, nested
 * structures, mixed text+media, etc.
 */

import { render } from "@testing-library/react";
import React from "react";
import { transform } from "sucrase";
import { describe, expect, it } from "vitest";
import { generateComponent } from "../generator/to-jsx";
import type { CapturedNode } from "../types";
import { requireValue } from "../utils/require-value";

// ---------------------------------------------------------------------------
// Helper: evaluate a generated component source string into a real React
// component function that we can render.
// ---------------------------------------------------------------------------
function evalComponent(source: string): React.ComponentType<{
	variant?: "filled" | "ghost";
	className?: string;
	style?: React.CSSProperties;
	dataSkId?: string;
}> {
	const fnName = source.match(/export function (\w+)/)?.[1];
	if (!fnName) throw new Error("Could not find exported function name");

	// Transpile TSX → JS using sucrase
	const { code } = transform(source, {
		transforms: ["typescript", "jsx", "imports"],
		jsxRuntime: "automatic",
		production: false,
	});

	// sucrase with jsxRuntime: "automatic" produces imports from react/jsx-dev-runtime
	// We need to provide a require function and capture exports
	const exports: Record<string, unknown> = {};
	const module_ = { exports };
	const require_ = (mod: string) => {
		if (mod === "react/jsx-runtime") return require("react/jsx-runtime");
		if (mod === "react/jsx-dev-runtime")
			return require("react/jsx-dev-runtime");
		if (mod === "react") return React;
		throw new Error(`Unexpected require: ${mod}`);
	};

	const fn = new Function("React", "exports", "module", "require", code);
	fn(React, exports, module_, require_);

	return (module_.exports as Record<string, unknown>)[
		fnName
	] as React.ComponentType<{
		variant?: "filled" | "ghost";
		className?: string;
		style?: React.CSSProperties;
		dataSkId?: string;
	}>;
}

// ---------------------------------------------------------------------------
// Helper: render a skeleton component and return the root element.
// ---------------------------------------------------------------------------
function renderSkeleton(
	node: CapturedNode,
	id: string,
	opts: {
		variant?: "filled" | "ghost";
		widths?: Record<string, number>;
		heights?: Record<string, number>;
	} = {},
) {
	const source = generateComponent(id, node);
	const Component = evalComponent(source);

	const style: Record<string, string> = {};
	if (opts.widths) {
		for (const [key, value] of Object.entries(opts.widths)) {
			style[`--sk-w-${key}`] = `${value}px`;
		}
	}
	if (opts.heights) {
		for (const [key, value] of Object.entries(opts.heights)) {
			style[`--sk-h-${key}`] = `${value}px`;
		}
	}

	const { container } = render(
		<Component
			variant={opts.variant ?? "filled"}
			style={style as unknown as React.CSSProperties}
			dataSkId={id}
		/>,
	);

	const root = container.firstElementChild as HTMLElement;
	return { root, container, source };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function textNode(
	tag: string,
	text: string,
	opts: {
		className?: string;
		style?: Record<string, string>;
		textAlign?: "left" | "center" | "right";
	} = {},
): CapturedNode {
	return {
		tag,
		className: opts.className ?? "",
		style: opts.style ?? {},
		attributes: {},
		children: [],
		nodeType: "text",
		textContent: text,
		textAlign: opts.textAlign,
	};
}

function layoutNode(
	tag: string,
	children: CapturedNode[],
	opts: {
		className?: string;
		style?: Record<string, string>;
	} = {},
): CapturedNode {
	return {
		tag,
		className: opts.className ?? "",
		style: opts.style ?? {},
		attributes: {},
		children,
		nodeType: "layout",
	};
}

function mediaNode(
	tag: string,
	width: number,
	height: number,
	opts: { className?: string; style?: Record<string, string> } = {},
): CapturedNode {
	return {
		tag,
		className: opts.className ?? "",
		style: opts.style ?? {},
		attributes: {},
		children: [],
		nodeType: "media",
		rect: { width, height },
	};
}

function svgNode(
	width: number,
	height: number,
	opts: { className?: string } = {},
): CapturedNode {
	return {
		tag: "svg",
		className: opts.className ?? "",
		style: {},
		attributes: {},
		children: [],
		nodeType: "svg",
		rect: { width, height },
	};
}

function interactiveNode(
	tag: string,
	width: number,
	height: number,
	children: CapturedNode[] = [],
	opts: { className?: string; style?: Record<string, string> } = {},
): CapturedNode {
	return {
		tag,
		className: opts.className ?? "",
		style: opts.style ?? {},
		attributes: {},
		children,
		nodeType: "interactive",
		rect: { width, height },
	};
}

// ====================================================================
// TESTS
// ====================================================================

describe("skeleton layout fidelity", () => {
	// ----------------------------------------------------------------
	// 1. Block-level text (<p>, <div>, <h1>)
	// ----------------------------------------------------------------
	describe("block-level text elements", () => {
		it("<p> with text preserves content and has text CSS vars", () => {
			const tree = layoutNode("div", [textNode("p", "••••• •••••")]);

			const { root } = renderSkeleton(tree, "block-text", {
				widths: { t0: 142 },
				heights: { t0: 24 },
			});

			const p = root.querySelector(".loaded-text") as HTMLElement;
			expect(p).not.toBeNull();
			expect(p.tagName).toBe("P");
			expect(p.textContent).toBe("••••• •••••");
			expect(p.style.getPropertyValue("--loaded-text-width")).toBe(
				"var(--sk-w-t0, auto)",
			);
			expect(p.style.getPropertyValue("--loaded-text-height")).toBe(
				"var(--sk-h-t0, auto)",
			);
		});

		it("<h1> text preserves content", () => {
			const tree = textNode("h1", "•••••••••");

			const { root } = renderSkeleton(tree, "heading-text", {
				widths: { t0: 200 },
			});

			expect(root.tagName).toBe("H1");
			expect(root.textContent).toBe("•••••••••");
			expect(root.classList.contains("loaded-text")).toBe(true);
		});

		it("<div> with text content is not collapsed", () => {
			const tree = layoutNode("div", [textNode("div", "•••••••••• •••••••")]);

			const { root } = renderSkeleton(tree, "div-text", {
				widths: { t0: 180 },
			});

			const textEl = root.querySelector(".loaded-text") as HTMLElement;
			expect(textEl).not.toBeNull();
			expect(textEl.textContent).toBe("•••••••••• •••••••");
			expect(
				requireValue(textEl.textContent, "Missing text content for div-text")
					.length,
			).toBeGreaterThan(0);
		});
	});

	// ----------------------------------------------------------------
	// 2. Inline text elements (<span>, <strong>, <em>)
	// ----------------------------------------------------------------
	describe("inline text elements", () => {
		it("<span> text has content and CSS vars", () => {
			const tree = layoutNode("div", [textNode("span", "••••••")]);

			const { root } = renderSkeleton(tree, "span-text", {
				widths: { t0: 65 },
			});

			const span = root.querySelector(".loaded-text") as HTMLElement;
			expect(span).not.toBeNull();
			expect(span.tagName).toBe("SPAN");
			expect(span.textContent).toBe("••••••");
			expect(span.style.getPropertyValue("--loaded-text-width")).toBe(
				"var(--sk-w-t0, auto)",
			);
		});

		it("<strong> inside a <p> preserves text", () => {
			// <p><strong>Bold text</strong></p>
			// After serialize: p is layout (has child elements), strong is text
			const tree = layoutNode("div", [
				layoutNode("p", [textNode("strong", "•••• ••••")]),
			]);

			const { root } = renderSkeleton(tree, "strong-text", {
				widths: { t0: 92 },
			});

			const strong = root.querySelector("strong.loaded-text") as HTMLElement;
			expect(strong).not.toBeNull();
			expect(strong.textContent).toBe("•••• ••••");
		});

		it("<em> text is not collapsed", () => {
			const tree = layoutNode("div", [textNode("em", "••••••••")]);

			const { root } = renderSkeleton(tree, "em-text", {
				widths: { t0: 78 },
			});

			const em = root.querySelector("em.loaded-text") as HTMLElement;
			expect(em).not.toBeNull();
			expect(em.textContent).toBe("••••••••");
			expect(
				requireValue(em.textContent, "Missing text content for em-text").length,
			).toBeGreaterThan(0);
		});

		it("inline elements get display: inline-block + explicit width for exact sizing", () => {
			const inlineTags = [
				"span",
				"strong",
				"em",
				"b",
				"i",
				"a",
				"small",
				"code",
			];
			for (const tag of inlineTags) {
				const tree = layoutNode("div", [textNode(tag, "•••••")]);
				const { root } = renderSkeleton(tree, `inline-${tag}`, {
					widths: { t0: 50 },
				});
				const el = root.querySelector(".loaded-text") as HTMLElement;
				expect(
					el.style.display,
					`${tag} should have display: inline-block`,
				).toBe("inline-block");
				expect(el.style.width, `${tag} should have explicit width`).toBe(
					"var(--loaded-text-width, auto)",
				);
			}
		});

		it("block elements do NOT get forced display", () => {
			const blockTags = ["p", "div", "h1", "h2", "h3", "li"];
			for (const tag of blockTags) {
				const tree = layoutNode("section", [textNode(tag, "•••••")]);
				const { root } = renderSkeleton(tree, `block-${tag}`, {
					widths: { t0: 50 },
				});
				const el = root.querySelector(".loaded-text") as HTMLElement;
				expect(el.style.display, `${tag} should NOT have display forced`).toBe(
					"",
				);
			}
		});
	});

	// ----------------------------------------------------------------
	// 3. Flex containers
	// ----------------------------------------------------------------
	describe("flex containers", () => {
		it("flex row with text + media preserves both children", () => {
			const tree = layoutNode(
				"div",
				[textNode("span", "•••••••• •••••"), mediaNode("img", 48, 48)],
				{ style: { display: "flex", "align-items": "center", gap: "8px" } },
			);

			const { root } = renderSkeleton(tree, "flex-row", {
				widths: { t0: 120 },
			});

			expect(root.style.display).toBe("flex");
			expect(root.style.alignItems).toBe("center");
			expect(root.style.gap).toBe("8px");

			const textEl = root.querySelector(".loaded-text") as HTMLElement;
			const mediaEl = root.querySelector(".loaded-media") as HTMLElement;
			expect(textEl).not.toBeNull();
			expect(mediaEl).not.toBeNull();
			expect(textEl.textContent).toBe("•••••••• •••••");
			expect(mediaEl.style.width).toBe("48px");
			expect(mediaEl.style.height).toBe("48px");
		});

		it("flex column preserves multiple text children", () => {
			const tree = layoutNode(
				"div",
				[
					textNode("p", "•••••"),
					textNode("p", "•••••••••••"),
					textNode("p", "•••••••"),
				],
				{ style: { display: "flex", "flex-direction": "column", gap: "4px" } },
			);

			const { root } = renderSkeleton(tree, "flex-col", {
				widths: { t0: 55, t1: 110, t2: 75 },
			});

			expect(root.style.display).toBe("flex");
			expect(root.style.flexDirection).toBe("column");

			const texts = root.querySelectorAll(".loaded-text");
			expect(texts.length).toBe(3);
			expect(texts[0].textContent).toBe("•••••");
			expect(texts[1].textContent).toBe("•••••••••••");
			expect(texts[2].textContent).toBe("•••••••");
		});

		it("inline-flex with icon (svg) + text", () => {
			const tree = layoutNode(
				"span",
				[svgNode(16, 16), textNode("span", "••••••")],
				{
					style: {
						display: "inline-flex",
						"align-items": "center",
						gap: "4px",
					},
				},
			);

			const { root } = renderSkeleton(tree, "inline-flex", {
				widths: { t0: 52 },
			});

			expect(root.style.display).toBe("inline-flex");
			const svgEl = root.querySelector(".loaded-svg") as HTMLElement;
			const textEl = root.querySelector(".loaded-text") as HTMLElement;
			expect(svgEl).not.toBeNull();
			expect(svgEl.style.width).toBe("16px");
			expect(svgEl.style.height).toBe("16px");
			expect(textEl).not.toBeNull();
			expect(textEl.textContent).toBe("••••••");
		});
	});

	// ----------------------------------------------------------------
	// 4. Width-dependent containers (shrink-to-fit)
	// ----------------------------------------------------------------
	describe("shrink-to-fit containers", () => {
		it("text inside width:auto container has min-width CSS var", () => {
			// A container whose width depends on children — text must carry min-width
			const tree = layoutNode("div", [
				layoutNode("div", [textNode("span", "•••••••••")], {
					style: { display: "inline-block" },
				}),
			]);

			const { root } = renderSkeleton(tree, "shrink-fit", {
				widths: { t0: 100 },
			});

			const span = root.querySelector(".loaded-text") as HTMLElement;
			expect(span).not.toBeNull();
			expect(span.textContent).toBe("•••••••••");
			// The min-width is controlled via CSS variable
			expect(span.style.getPropertyValue("--loaded-text-width")).toBe(
				"var(--sk-w-t0, auto)",
			);
		});

		it("fit-content div with text child preserves text content", () => {
			const tree = layoutNode("div", [textNode("span", "•••••• ••")], {
				style: { width: "fit-content" },
			});

			const { root } = renderSkeleton(tree, "fit-content", {
				widths: { t0: 85 },
			});

			const span = root.querySelector(".loaded-text") as HTMLElement;
			expect(span).not.toBeNull();
			expect(
				requireValue(span.textContent, "Missing text content for fit-content")
					.length,
			).toBeGreaterThan(0);
		});
	});

	// ----------------------------------------------------------------
	// 5. Media and SVG elements
	// ----------------------------------------------------------------
	describe("media and SVG elements", () => {
		it("img is replaced with div and has explicit dimensions", () => {
			const tree = mediaNode("img", 320, 180);

			const { root } = renderSkeleton(tree, "media-img");

			expect(root.tagName).toBe("DIV");
			expect(root.classList.contains("loaded-media")).toBe(true);
			expect(root.style.width).toBe("var(--sk-w-e0, 320px)");
			expect(root.style.height).toBe("var(--sk-h-e0, 180px)");
		});

		it("svg is replaced with div and has explicit dimensions", () => {
			const tree = svgNode(24, 24, { className: "icon" });

			const { root } = renderSkeleton(tree, "svg-icon");

			expect(root.tagName).toBe("DIV");
			expect(root.classList.contains("loaded-svg")).toBe(true);
			expect(root.style.width).toBe("var(--sk-w-e0, 24px)");
			expect(root.style.height).toBe("var(--sk-h-e0, 24px)");
		});

		it("video is replaced with div and has explicit dimensions", () => {
			const tree = mediaNode("video", 640, 360);

			const { root } = renderSkeleton(tree, "media-video");

			expect(root.tagName).toBe("DIV");
			expect(root.classList.contains("loaded-media")).toBe(true);
			expect(root.style.width).toBe("var(--sk-w-e0, 640px)");
			expect(root.style.height).toBe("var(--sk-h-e0, 360px)");
		});
	});

	// ----------------------------------------------------------------
	// 6. Interactive elements
	// ----------------------------------------------------------------
	describe("interactive elements", () => {
		it("button (root, no children) has explicit dimensions and placeholder", () => {
			const tree = interactiveNode("button", 120, 40);

			const { root } = renderSkeleton(tree, "btn-empty");

			expect(root.tagName).toBe("BUTTON");
			expect(root.classList.contains("loaded-interactive")).toBe(true);
			expect(root.style.width).toBe("var(--sk-w-e0, 120px)");
			expect(root.style.height).toBe("var(--sk-h-e0, 40px)");
			// Non-breaking space placeholder
			expect(root.textContent).toBe("\u00A0");
		});

		it("button (root, with children) shows children in ghost mode", () => {
			const tree = interactiveNode("button", 150, 36, [
				svgNode(16, 16),
				textNode("span", "•••• •••••••"),
			]);

			const { root } = renderSkeleton(tree, "btn-ghost", {
				variant: "ghost",
				widths: { t0: 95 },
			});

			expect(root.tagName).toBe("BUTTON");
			const svgEl = root.querySelector(".loaded-svg");
			const textEl = root.querySelector(".loaded-text");
			expect(svgEl).not.toBeNull();
			expect(textEl).not.toBeNull();
			expect(
				requireValue(textEl, "Missing button ghost text element").textContent,
			).toBe("•••• •••••••");
		});

		it("button (root, with children) shows placeholder in filled mode", () => {
			const tree = interactiveNode("button", 150, 36, [
				svgNode(16, 16),
				textNode("span", "•••• •••••••"),
			]);

			const { root } = renderSkeleton(tree, "btn-filled", {
				variant: "filled",
			});

			expect(root.tagName).toBe("BUTTON");
			// In filled mode, children are replaced with \u00A0
			expect(root.textContent).toBe("\u00A0");
			expect(root.querySelector(".loaded-svg")).toBeNull();
		});

		it("link <a> has explicit dimensions", () => {
			const tree = interactiveNode("a", 200, 24);

			const { root } = renderSkeleton(tree, "link-el");

			expect(root.tagName).toBe("A");
			expect(root.classList.contains("loaded-interactive")).toBe(true);
			expect(root.style.width).toBe("var(--sk-w-e0, 200px)");
			expect(root.style.height).toBe("var(--sk-h-e0, 24px)");
		});
	});

	// ----------------------------------------------------------------
	// 7. Complex nested structures
	// ----------------------------------------------------------------
	describe("complex nested structures", () => {
		it("card layout: avatar + flex column of texts", () => {
			// Like UserCard: flex row with img + vertical text stack
			const tree = layoutNode(
				"div",
				[
					mediaNode("img", 56, 56, { className: "avatar" }),
					layoutNode(
						"div",
						[
							textNode("strong", "•••••••"),
							textNode("span", "•••••@•••••.•••"),
							textNode("span", "••••••• •••."),
						],
						{
							style: {
								display: "flex",
								"flex-direction": "column",
								gap: "2px",
							},
						},
					),
				],
				{
					style: {
						display: "flex",
						"align-items": "center",
						gap: "12px",
					},
				},
			);

			const { root } = renderSkeleton(tree, "user-card", {
				widths: { t0: 80, t1: 140, t2: 95 },
				heights: { t0: 20, t1: 18, t2: 18 },
			});

			// Root is flex
			expect(root.style.display).toBe("flex");
			expect(root.style.gap).toBe("12px");

			// Avatar placeholder
			const avatar = root.querySelector(".loaded-media") as HTMLElement;
			expect(avatar).not.toBeNull();
			expect(avatar.style.width).toBe("56px");
			expect(avatar.style.height).toBe("56px");

			// Text column
			const texts = root.querySelectorAll(".loaded-text");
			expect(texts.length).toBe(3);
			expect(texts[0].tagName).toBe("STRONG");
			expect(texts[0].textContent).toBe("•••••••");
			expect(texts[1].textContent).toBe("•••••@•••••.•••");
			expect(texts[2].textContent).toBe("••••••• •••.");

			// Each text has its CSS var
			for (let i = 0; i < 3; i++) {
				const el = texts[i] as HTMLElement;
				expect(el.style.getPropertyValue("--loaded-text-width")).toBe(
					`var(--sk-w-t${i}, auto)`,
				);
			}
		});

		it("post layout: title + paragraph + meta", () => {
			const tree = layoutNode(
				"div",
				[
					textNode("h3", "••••• ••••• ••••"),
					textNode("p", "•••••••• •••••• ••••••• •••• ••• ••••• ••••• ••"),
					textNode("span", "•• •••• •"),
				],
				{
					style: {
						display: "flex",
						"flex-direction": "column",
						gap: "8px",
					},
				},
			);

			const { root } = renderSkeleton(tree, "post-card", {
				widths: { t0: 180, t1: 350, t2: 65 },
				heights: { t0: 28, t1: 40, t2: 16 },
			});

			const h3 = root.querySelector("h3.loaded-text") as HTMLElement;
			const p = root.querySelector("p.loaded-text") as HTMLElement;
			const span = root.querySelector("span.loaded-text") as HTMLElement;

			expect(h3).not.toBeNull();
			expect(p).not.toBeNull();
			expect(span).not.toBeNull();

			expect(h3.textContent).toBe("••••• ••••• ••••");
			expect(
				requireValue(p.textContent, "Missing post-card paragraph content")
					.length,
			).toBeGreaterThan(0);
			expect(span.textContent).toBe("•• •••• •");
		});

		it("grid-like structure with mixed elements", () => {
			const tree = layoutNode(
				"div",
				[
					layoutNode(
						"div",
						[textNode("span", "•••• •"), textNode("h2", "•,•••")],
						{ style: { display: "flex", "flex-direction": "column" } },
					),
					layoutNode("div", [svgNode(20, 20), textNode("span", "+••.•%")], {
						style: { display: "flex", "align-items": "center", gap: "4px" },
					}),
				],
				{ style: { display: "flex", "flex-direction": "column", gap: "8px" } },
			);

			const { root } = renderSkeleton(tree, "stat-card", {
				widths: { t0: 60, t1: 45, t2: 55 },
			});

			const texts = root.querySelectorAll(".loaded-text");
			expect(texts.length).toBe(3);
			expect(texts[0].textContent).toBe("•••• •");
			expect(texts[1].textContent).toBe("•,•••");
			expect(texts[2].textContent).toBe("+••.•%");

			const svgEl = root.querySelector(".loaded-svg") as HTMLElement;
			expect(svgEl).not.toBeNull();
			expect(svgEl.style.width).toBe("20px");
			expect(svgEl.style.height).toBe("20px");
		});
	});

	// ----------------------------------------------------------------
	// 8. Root-level elements of different types
	// ----------------------------------------------------------------
	describe("root-level element types", () => {
		it("root <section> preserves skeleton classes", () => {
			const tree = layoutNode("section", [textNode("p", "•••••")], {
				className: "card-root",
			});

			const { root } = renderSkeleton(tree, "section-root");

			expect(root.tagName).toBe("SECTION");
			expect(root.classList.contains("loaded-skeleton")).toBe(true);
			expect(root.classList.contains("loaded-animate")).toBe(true);
			expect(root.classList.contains("card-root")).toBe(true);
		});

		it("root text element is both skeleton and text", () => {
			const tree = textNode("p", "••••••••• ••••");

			const { root } = renderSkeleton(tree, "root-text", {
				widths: { t0: 120 },
			});

			expect(root.tagName).toBe("P");
			expect(root.classList.contains("loaded-skeleton")).toBe(true);
			expect(root.classList.contains("loaded-text")).toBe(true);
			expect(root.textContent).toBe("••••••••• ••••");
		});
	});

	// ----------------------------------------------------------------
	// 9. CSS variable propagation
	// ----------------------------------------------------------------
	describe("CSS variable propagation", () => {
		it("root element receives --sk-w-* and --sk-h-* from style prop", () => {
			const tree = layoutNode("div", [
				textNode("p", "•••••"),
				textNode("span", "••••••••"),
			]);

			const { root } = renderSkeleton(tree, "var-prop", {
				widths: { t0: 55, t1: 90 },
				heights: { t0: 20, t1: 16 },
			});

			expect(root.style.getPropertyValue("--sk-w-t0")).toBe("55px");
			expect(root.style.getPropertyValue("--sk-w-t1")).toBe("90px");
			expect(root.style.getPropertyValue("--sk-h-t0")).toBe("20px");
			expect(root.style.getPropertyValue("--sk-h-t1")).toBe("16px");
		});

		it("text elements reference var(--sk-w-tN) in --loaded-text-width", () => {
			const tree = layoutNode("div", [
				textNode("p", "•••"),
				textNode("p", "••••••"),
				textNode("p", "•••••••••"),
			]);

			const { root } = renderSkeleton(tree, "multi-text");

			const texts = root.querySelectorAll(".loaded-text");
			expect(texts.length).toBe(3);
			for (let i = 0; i < 3; i++) {
				const el = texts[i] as HTMLElement;
				expect(el.style.getPropertyValue("--loaded-text-width")).toBe(
					`var(--sk-w-t${i}, auto)`,
				);
				expect(el.getAttribute("data-sk-key")).toBe(`t${i}`);
			}
		});
	});

	// ----------------------------------------------------------------
	// 10. Edge cases
	// ----------------------------------------------------------------
	describe("edge cases", () => {
		it("empty text node renders non-breaking space (not empty)", () => {
			const tree = textNode("span", "");

			const { root } = renderSkeleton(tree, "empty-text");

			expect(root.textContent).toBe("\u00A0");
		});

		it("deeply nested text is preserved", () => {
			const tree = layoutNode("div", [
				layoutNode("div", [
					layoutNode("div", [layoutNode("div", [textNode("span", "••••")])]),
				]),
			]);

			const { root } = renderSkeleton(tree, "deep-nest", {
				widths: { t0: 40 },
			});

			const span = root.querySelector(".loaded-text") as HTMLElement;
			expect(span).not.toBeNull();
			expect(span.textContent).toBe("••••");
		});

		it("multiple text nodes at same level get sequential keys", () => {
			const tree = layoutNode("ul", [
				textNode("li", "•••"),
				textNode("li", "••••••"),
				textNode("li", "•••••••••"),
				textNode("li", "••"),
			]);

			const { root } = renderSkeleton(tree, "list-items");

			const items = root.querySelectorAll(".loaded-text");
			expect(items.length).toBe(4);
			expect(items[0].getAttribute("data-sk-key")).toBe("t0");
			expect(items[1].getAttribute("data-sk-key")).toBe("t1");
			expect(items[2].getAttribute("data-sk-key")).toBe("t2");
			expect(items[3].getAttribute("data-sk-key")).toBe("t3");
		});

		it("text with only whitespace renders non-breaking space", () => {
			const tree: CapturedNode = {
				tag: "span",
				className: "",
				style: {},
				attributes: {},
				children: [],
				nodeType: "text",
				textContent: "",
			};

			const { root } = renderSkeleton(tree, "ws-only");

			expect(root.textContent).toBe("\u00A0");
		});
	});
});
