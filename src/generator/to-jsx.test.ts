import { describe, expect, it } from "vitest";
import type { CapturedNode } from "../types";
import { generateComponent, idToComponentName } from "./to-jsx";

const variantClassSuffix = "$" + '{variant === "filled" ? " loaded-bg" : ""}';
const classNamePropSuffix = "$" + '{className ? " " + className : ""}';

describe("idToComponentName", () => {
	it("converts kebab and snake case ids to PascalCase component names", () => {
		expect(idToComponentName("user-card")).toBe("UserCardSkeleton");
		expect(idToComponentName("profile_header")).toBe("ProfileHeaderSkeleton");
	});
});

describe("generateComponent", () => {
	it("generates a component with root variant class, converted styles and masked text", () => {
		const tree: CapturedNode = {
			tag: "section",
			className: "root-shell",
			style: {
				"background-color": "rgb(0, 0, 0)",
				"--custom-width": "12ch",
			},
			attributes: {
				"data-testid": "card-root",
				tabindex: "0",
			},
			children: [
				{
					tag: "p",
					className: "title",
					style: {},
					attributes: {},
					children: [],
					nodeType: "text",
					textContent: "•••••••• ••••",
					textAlign: "center",
				},
			],
			nodeType: "layout",
		};

		const output = generateComponent("user-card", tree);

		expect(output).toContain("export function UserCardSkeleton");
		expect(output).toContain(
			'{ variant = "filled", className, style, dataSkId }',
		);
		expect(output).toContain(
			`className={\`root-shell loaded-skeleton loaded-animate${variantClassSuffix}${classNamePropSuffix}\`}`,
		);
		expect(output).toContain(
			'style={{ ...{ backgroundColor: "rgb(0, 0, 0)", "--custom-width": "12ch" }, ...style } as React.CSSProperties}',
		);
		expect(output).toContain("data-sk-id={dataSkId}");
		expect(output).toContain('tabIndex="0"');
		expect(output).toContain('className="title loaded-text"');
		expect(output).toContain('"--loaded-text-width": "var(--sk-w-t0, auto)"');
		expect(output).toContain('"--loaded-text-height": "var(--sk-h-t0, auto)"');
		expect(output).toContain('"--loaded-text-content": "\\"•••••••• ••••\\""');
		expect(output).toContain('data-loaded-align="center"');
		expect(output).toContain('>{"•••••••• ••••"}</p>');
	});

	it("replaces media tags with div and applies dimensions from rect", () => {
		const tree: CapturedNode = {
			tag: "img",
			className: "",
			style: {},
			attributes: {
				"aria-label": "thumbnail",
			},
			children: [],
			nodeType: "media",
			rect: { width: 320, height: 180 },
		};

		const output = generateComponent("hero-image", tree);

		expect(output).toContain("export function HeroImageSkeleton");
		expect(output).toContain(
			`className={\`loaded-skeleton loaded-animate loaded-media${variantClassSuffix}${classNamePropSuffix}\`}`,
		);
		expect(output).toContain(
			'style={{ ...{ width: "320px", height: "180px" }, ...style } as React.CSSProperties}',
		);
		expect(output).toContain('aria-label="thumbnail"');
		expect(output).toContain("<div");
		expect(output).not.toContain("<img");
	});

	it("falls back to non-breaking space when masked text is missing", () => {
		const tree: CapturedNode = {
			tag: "p",
			className: "",
			style: {},
			attributes: {},
			children: [],
			nodeType: "text",
		};

		const output = generateComponent("zero-width", tree);

		expect(output).toContain('>{"\\u00A0"}</p>');
	});

	it("replaces SVG with div and adds .as-svg class", () => {
		const tree: CapturedNode = {
			tag: "svg",
			className: "icon",
			style: {},
			attributes: {},
			children: [],
			nodeType: "svg",
			rect: { width: 24, height: 24 },
		};

		const output = generateComponent("icon-svg", tree);

		expect(output).toContain("<div");
		expect(output).not.toContain("<svg");
		expect(output).toContain("loaded-svg");
		expect(output).toContain(
			'style={{ ...{ width: "24px", height: "24px" }, ...style } as React.CSSProperties}',
		);
	});

	it("renders interactive nodes with non-breaking space", () => {
		const tree: CapturedNode = {
			tag: "button",
			className: "btn",
			style: {},
			attributes: {},
			children: [],
			nodeType: "interactive",
			rect: { width: 120, height: 40 },
		};

		const output = generateComponent("action-btn", tree);

		expect(output).toContain("loaded-interactive");
		expect(output).toContain("inert");
		expect(output).toContain('>{"\\u00A0"}</button>');
	});

	it("indents nested children correctly", () => {
		const tree: CapturedNode = {
			tag: "div",
			className: "",
			style: {},
			attributes: {},
			nodeType: "layout",
			children: [
				{
					tag: "div",
					className: "",
					style: {},
					attributes: {},
					nodeType: "layout",
					children: [
						{
							tag: "span",
							className: "",
							style: {},
							attributes: {},
							nodeType: "text",
							textContent: "••••",
							children: [],
						},
					],
				},
			],
		};

		const output = generateComponent("nested", tree);
		const lines = output.split("\n");
		const spanLine = lines.find((l) => l.includes("<span"));
		expect(spanLine).toBeDefined();
		// Root is indent 2 (tabs), child 3, grandchild 4
		expect(spanLine?.startsWith("\t\t\t\t")).toBe(true);
	});

	it("omits className attribute when node has no classes", () => {
		const tree: CapturedNode = {
			tag: "div",
			className: "",
			style: {},
			attributes: {},
			children: [
				{
					tag: "span",
					className: "",
					style: {},
					attributes: {},
					nodeType: "text",
					textContent: "•••",
					children: [],
				},
			],
			nodeType: "layout",
		};

		const output = generateComponent("bare", tree);
		const lines = output.split("\n");
		const spanLine = lines.find((l) => l.includes("<span"));
		expect(spanLine).toBeDefined();
		// span should still have as-text class
		expect(spanLine).toContain('className="loaded-text"');
	});

	it("self-closes empty layout root", () => {
		const tree: CapturedNode = {
			tag: "div",
			className: "empty",
			style: {},
			attributes: {},
			children: [],
			nodeType: "layout",
		};

		const output = generateComponent("empty-root", tree);

		expect(output).toContain("<div");
		expect(output).toContain("/>");
		expect(output).not.toContain("</div>");
	});

	it("adds data-as-align for right-aligned text", () => {
		const tree: CapturedNode = {
			tag: "p",
			className: "",
			style: {},
			attributes: {},
			children: [],
			nodeType: "text",
			textContent: "•••••",
			textAlign: "right",
		};

		const output = generateComponent("right-text", tree);

		expect(output).toContain('data-loaded-align="right"');
	});

	it("skips attributes with unsafe keys", () => {
		const tree: CapturedNode = {
			tag: "div",
			className: "",
			style: {},
			attributes: {
				"data-ok": "safe",
				'"><script>': "xss",
				"on click": "bad",
			},
			children: [],
			nodeType: "layout",
		};

		const output = generateComponent("attr-test", tree);

		expect(output).toContain('data-ok="safe"');
		expect(output).not.toContain("script");
		expect(output).not.toContain("on click");
	});

	it("throws on invalid id", () => {
		const tree: CapturedNode = {
			tag: "div",
			className: "",
			style: {},
			attributes: {},
			children: [],
			nodeType: "layout",
		};

		expect(() => generateComponent("../bad", tree)).toThrow(
			"Invalid skeleton id",
		);
	});

	it("renders multiple CSS custom properties with React cast", () => {
		const tree: CapturedNode = {
			tag: "div",
			className: "",
			style: {
				"--color-primary": "blue",
				"--spacing": "8px",
			},
			attributes: {},
			children: [],
			nodeType: "layout",
		};

		const output = generateComponent("custom-props", tree);

		expect(output).toContain('"--color-primary": "blue"');
		expect(output).toContain('"--spacing": "8px"');
		expect(output).toContain("as React.CSSProperties");
	});
});
