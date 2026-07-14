import type { CapturedNode } from "../types";
import { isValidId } from "../utils/validate-id";

function idToComponentName(id: string): string {
	return `${id
		.split(/[-_]/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("")}Skeleton`;
}

function cssPropToCamelCase(prop: string): string {
	if (prop.startsWith("--")) return prop;
	return prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function formatStyleObject(style: Record<string, string>): string {
	const entries = Object.entries(style);
	if (entries.length === 0) return "";

	const parts = entries.map(([key, value]) => {
		const camelKey = cssPropToCamelCase(key);
		const quotedKey =
			camelKey.startsWith("--") || camelKey.includes("-")
				? `"${camelKey}"`
				: camelKey;
		return `${quotedKey}: ${JSON.stringify(value)}`;
	});

	return `{ ${parts.join(", ")} }`;
}

function escapeJsx(str: string): string {
	return str.replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function toCssStringLiteral(value: string): string {
	const escaped = value
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\A ");
	return `"${escaped}"`;
}

/**
 * HTML elements that are `display: inline` by default.
 * These need `display: inline-block` in skeleton mode so that
 * `min-width` (from --loaded-text-width) is respected.
 */
/**
 * HTML void elements that cannot have children or a closing tag.
 */
const VOID_TAGS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);

const INLINE_TAGS = new Set([
	"a",
	"abbr",
	"b",
	"cite",
	"code",
	"del",
	"dfn",
	"em",
	"i",
	"ins",
	"kbd",
	"label",
	"mark",
	"q",
	"s",
	"samp",
	"small",
	"span",
	"strong",
	"sub",
	"sup",
	"time",
	"u",
	"var",
]);

type Counter = { value: number };

function nodeToJsx(
	node: CapturedNode,
	indent: number,
	isRoot: boolean,
	textCounter: Counter,
): string {
	const pad = "\t".repeat(indent);
	let tag = node.tag;

	// Build className
	const classes: string[] = [];
	if (node.className) classes.push(node.className);
	if (isRoot) classes.push("loaded-skeleton", "loaded-animate");
	const needsDynamicBg = isRoot;

	switch (node.nodeType) {
		case "text":
			classes.push("loaded-text");
			break;
		case "media":
			classes.push("loaded-media");
			tag = "div"; // Replace img/video/canvas with div
			break;
		case "svg":
			classes.push("loaded-svg");
			tag = "div"; // Replace svg with div
			break;
		case "interactive":
			classes.push("loaded-interactive");
			break;
	}

	const className = classes.join(" ");

	const style: Record<string, string> = { ...node.style };
	const textKey = node.nodeType === "text" ? `t${textCounter.value}` : null;

	if (node.nodeType === "text") {
		style["--loaded-text-width"] = `var(--sk-w-${textKey}, auto)`;
		style["--loaded-text-height"] = `var(--sk-h-${textKey}, auto)`;
		if (node.textContent?.length) {
			style["--loaded-text-content"] = toCssStringLiteral(node.textContent);
		}
		// Inline elements ignore min-width/width — force inline-block so
		// --loaded-text-width actually controls the element width.
		// Set explicit width so the • text (which may be wider or narrower
		// than the original) doesn't determine the element's intrinsic size.
		// The masked • string can be longer than the measured width; .loaded-text
		// clips the overflow (overflow: clip) so it never leaks into the layout.
		if (INLINE_TAGS.has(tag)) {
			style.display = "inline-block";
			style.width = `var(--loaded-text-width, auto)`;
		}
	}

	if (
		(node.nodeType === "media" ||
			node.nodeType === "svg" ||
			node.nodeType === "interactive") &&
		node.rect
	) {
		// The root box adapts to the previous render: its width/height are
		// overridable at runtime via --sk-w-e0 / --sk-h-e0 (measured from the
		// live element), mirroring how text adapts via --sk-w-tN. The captured
		// rect is the fallback. Nested boxes keep their captured size.
		if (isRoot) {
			if (!style.width) style.width = `var(--sk-w-e0, ${node.rect.width}px)`;
			if (!style.height) style.height = `var(--sk-h-e0, ${node.rect.height}px)`;
		} else {
			if (!style.width) style.width = `${node.rect.width}px`;
			if (!style.height) style.height = `${node.rect.height}px`;
		}
	}

	// Build JSX attributes
	const attrs: string[] = [];

	if (className && needsDynamicBg) {
		attrs.push(
			`className={\`${escapeJsx(className)}\${variant === "filled" ? " loaded-bg" : ""}\${className ? " " + className : ""}\`}`,
		);
	} else if (className) {
		attrs.push(`className="${escapeJsx(className)}"`);
	}

	if (Object.keys(style).length > 0) {
		if (isRoot) {
			attrs.push(
				`style={{ ...${formatStyleObject(style)}, ...style } as React.CSSProperties}`,
			);
		} else {
			const hasCustomProps = Object.keys(style).some((k) => k.startsWith("--"));
			const cast = hasCustomProps ? " as React.CSSProperties" : "";
			attrs.push(`style={${formatStyleObject(style)}${cast}}`);
		}
	} else if (isRoot) {
		attrs.push("style={style}");
	}

	for (const [key, value] of Object.entries(node.attributes)) {
		if (!SAFE_ATTR_KEY.test(key)) continue;
		const reactKey = key === "tabindex" ? "tabIndex" : key;
		attrs.push(`${reactKey}="${escapeJsx(value)}"`);
	}

	if (textKey) {
		attrs.push(`data-sk-key="${textKey}"`);
		textCounter.value += 1;
		if (node.textAlign && node.textAlign !== "left") {
			attrs.push(`data-loaded-align="${node.textAlign}"`);
		}
	}

	if (isRoot) {
		attrs.push("data-sk-id={dataSkId}");
		attrs.push('aria-hidden="true"');
		attrs.push("inert");
	}

	const attrString = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";

	// Text nodes render masked content so width follows character count.
	if (node.nodeType === "text") {
		const maskedText = node.textContent;
		if (!maskedText?.length) {
			return `${pad}<${tag}${attrString}>{"\\u00A0"}</${tag}>`;
		}
		return `${pad}<${tag}${attrString}>{${JSON.stringify(maskedText)}}</${tag}>`;
	}

	// Interactive nodes: root with children renders conditionally (ghost shows children,
	// filled shows placeholder). Non-root interactive always shows a placeholder.
	if (node.nodeType === "interactive") {
		if (VOID_TAGS.has(tag)) {
			return `${pad}<${tag}${attrString} />`;
		}
		// React reads a textarea's content from defaultValue and errors when it
		// is passed as children, unlike every other non-void interactive tag.
		if (tag === "textarea") {
			return `${pad}<${tag}${attrString} defaultValue={"\\u00A0"} />`;
		}
		if (isRoot && node.children.length > 0) {
			const childrenJsx = node.children
				.map((child) => nodeToJsx(child, indent + 2, false, textCounter))
				.join("\n");
			return (
				`${pad}<${tag}${attrString}>\n` +
				`${pad}\t{variant !== "filled" ? (\n` +
				`${pad}\t\t<>\n` +
				`${childrenJsx}\n` +
				`${pad}\t\t</>\n` +
				`${pad}\t) : "\\u00A0"}\n` +
				`${pad}</${tag}>`
			);
		}
		return `${pad}<${tag}${attrString}>{"\\u00A0"}</${tag}>`;
	}

	// Self-closing for leaf nodes (media, svg, empty layout)
	const isLeaf =
		node.children.length === 0 ||
		node.nodeType === "svg" ||
		node.nodeType === "media";

	if (isLeaf) {
		return `${pad}<${tag}${attrString} />`;
	}

	const childrenJsx = node.children
		.map((child) => nodeToJsx(child, indent + 1, false, textCounter))
		.join("\n");

	return `${pad}<${tag}${attrString}>\n${childrenJsx}\n${pad}</${tag}>`;
}

const SAFE_ATTR_KEY = /^[a-zA-Z][a-zA-Z0-9-]*$/;

export function generateComponent(id: string, tree: CapturedNode): string {
	if (!isValidId(id)) {
		throw new Error(`Invalid skeleton id: "${id}"`);
	}
	const componentName = idToComponentName(id);
	const jsx = nodeToJsx(tree, 2, true, { value: 0 });

	return `// Auto-generated by autoskeleton — do not edit manually
import type React from "react";

export function ${componentName}({ variant = "filled", className, style, dataSkId }: { variant?: "filled" | "ghost"; className?: string; style?: React.CSSProperties; dataSkId?: string }) {
	return (
${jsx}
	);
}
`;
}

export { idToComponentName };
