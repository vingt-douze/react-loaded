import {
	Children,
	type CSSProperties,
	cloneElement,
	Fragment,
	isValidElement,
	type ReactNode,
	type RefCallback,
	version as reactVersion,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { sendCapture } from "../capture/client";
import { serializeElement } from "../capture/serialize";
import { usePersistedHeights } from "../hooks/usePersistedHeights";
import { usePersistedWidths } from "../hooks/usePersistedWidths";
import { collectTextDimensions } from "../utils/collect-text-widths";
import { mergeRefs } from "../utils/mergeRefs";
import {
	useInitialHeightSnapshot,
	useInitialWidthSnapshot,
	useRegistry,
} from "./LoadedProvider";
import { SkeletonContext } from "./SkeletonContext";

const isDev = process.env.NODE_ENV !== "production";

const useIsomorphicLayoutEffect =
	typeof window === "undefined" ? useEffect : useLayoutEffect;
const reactMajorVersion = Number.parseInt(
	reactVersion.split(".")[0] ?? "18",
	10,
);
const supportsRefPropOnFunctionComponents = reactMajorVersion >= 19;
const FORWARD_REF_SYMBOL = Symbol.for("react.forward_ref");
const MEMO_SYMBOL = Symbol.for("react.memo");

function buildDimensionVars(
	widths: Record<string, number> | null | undefined,
	heights: Record<string, number> | null | undefined,
): CSSProperties {
	const style: Record<string, string> = {};

	if (widths) {
		for (const [key, value] of Object.entries(widths)) {
			if (!Number.isFinite(value) || value < 0) continue;
			style[`--sk-w-${key}`] = `${value}px`;
		}
	}

	if (heights) {
		for (const [key, value] of Object.entries(heights)) {
			if (!Number.isFinite(value) || value < 0) continue;
			style[`--sk-h-${key}`] = `${value}px`;
		}
	}

	return style as CSSProperties;
}

function joinClassNames(
	...classes: Array<string | false | null | undefined>
): string | undefined {
	const filtered = classes.filter(Boolean);
	if (filtered.length === 0) return undefined;
	return filtered.join(" ");
}

function getElementRef(child: unknown): unknown {
	if (!child || typeof child !== "object") return null;
	const fromProps = (child as { props?: { ref?: unknown } }).props?.ref;
	const legacy =
		reactMajorVersion < 19 ? (child as { ref?: unknown }).ref : undefined;
	if (fromProps != null && legacy != null && fromProps !== legacy) {
		return mergeRefs(
			legacy as RefCallback<HTMLElement>,
			fromProps as RefCallback<HTMLElement>,
		);
	}
	return fromProps ?? legacy ?? null;
}

function canAttachRefToType(type: unknown): boolean {
	if (typeof type === "string") return true;

	if (typeof type === "function") {
		const isClassComponent = Boolean(
			(type as { prototype?: { isReactComponent?: unknown } }).prototype
				?.isReactComponent,
		);
		return isClassComponent || supportsRefPropOnFunctionComponents;
	}

	if (typeof type === "object" && type != null) {
		const tagged = type as { $$typeof?: symbol; type?: unknown };
		if (tagged.$$typeof === FORWARD_REF_SYMBOL) return true;
		if (tagged.$$typeof === MEMO_SYMBOL) {
			return canAttachRefToType(tagged.type);
		}
	}

	return false;
}

function tryCloneWithRef(
	children: ReactNode,
	ref: RefCallback<HTMLElement>,
): ReactNode | null {
	try {
		const child = Children.only(children);
		if (!isValidElement(child)) return null;
		if (child.type === Fragment) return null;
		if (!canAttachRefToType(child.type)) return null;
		const existingRef = getElementRef(child);
		return cloneElement(child, {
			ref: mergeRefs(ref, existingRef as RefCallback<HTMLElement> | null),
		} as Record<string, unknown>);
	} catch {
		return null;
	}
}

export interface AutoSkeletonProps {
	id: string;
	children: ReactNode;
	loading?: boolean;
	animate?: boolean;
	/** Additional CSS class name applied to the skeleton root. */
	className?: string;
	variant?: "filled" | "ghost";
	/** Pre-computed widths to apply (used internally by AutoSkeletonList). */
	_textWidths?: Record<string, number>;
	/** Pre-computed heights to apply (used internally by AutoSkeletonList). */
	_textHeights?: Record<string, number>;
}

export function AutoSkeleton({
	id,
	children,
	loading = true,
	animate = true,
	className,
	variant = "filled",
	_textWidths,
	_textHeights,
}: AutoSkeletonProps) {
	const registry = useRegistry();
	const captureRef = useRef<HTMLElement>(null);
	const measureRef = useRef<HTMLElement>(null);
	const captureHasWrapperRef = useRef(false);
	const warnedRef = useRef(false);
	const warnedCaptureRef = useRef(false);
	const warnedMissingGeneratedRef = useRef(false);
	const [forceDevCaptureWrapper, setForceDevCaptureWrapper] = useState(false);
	const generatedRootClass = `loaded-skeleton-root-${useId().replace(/[^a-zA-Z0-9_-]/g, "_")}`;
	const initialWidths = useInitialWidthSnapshot(id);
	const initialHeights = useInitialHeightSnapshot(id);
	const [measuredWidths, setMeasuredWidths] = useState<
		Record<string, number> | undefined
	>();
	const [measuredHeights, setMeasuredHeights] = useState<
		Record<string, number> | undefined
	>();

	const storedWidths = usePersistedWidths({
		storageKey: id,
		currentWidths: measuredWidths,
		loading,
		initialWidths,
	});

	const storedHeights = usePersistedHeights({
		storageKey: id,
		currentHeights: measuredHeights,
		loading,
		initialHeights,
	});

	// Measure text dimensions once children are rendered (loading=false)
	const handleMeasure = useCallback(() => {
		if (loading) return;
		const target = measureRef.current;
		if (!target) {
			if (isDev && !warnedRef.current) {
				warnedRef.current = true;
				console.warn(
					`[react-loaded] Could not access DOM for "${id}". ` +
						"Wrap children in a DOM element or use forwardRef for precise dimensions.",
				);
			}
			return;
		}

		const { widths, heights } = collectTextDimensions(target);
		if (Object.keys(widths).length > 0) {
			setMeasuredWidths(widths);
		}
		if (Object.keys(heights).length > 0) {
			setMeasuredHeights(heights);
		}
	}, [loading, id]);

	useEffect(() => {
		handleMeasure();
	}, [handleMeasure]);

	const widthsToApply = _textWidths ?? storedWidths;
	const heightsToApply = _textHeights ?? storedHeights;
	const skeletonRootStyle = buildDimensionVars(widthsToApply, heightsToApply);
	const generatedClassName = joinClassNames(
		className,
		!animate && "loaded-no-animate",
		isDev && "loaded-dev-skeleton",
		generatedRootClass,
	);
	const Generated = registry[id];
	const hasGeneratedSkeleton = loading && Boolean(Generated);

	useIsomorphicLayoutEffect(() => {
		if (!loading) return;
		const generatedRoot =
			document.getElementsByClassName(generatedRootClass)[0];
		if (!(generatedRoot instanceof HTMLElement)) return;

		for (let i = generatedRoot.style.length - 1; i >= 0; i -= 1) {
			const prop = generatedRoot.style.item(i);
			if (prop.startsWith("--sk-w-")) {
				const key = prop.slice("--sk-w-".length);
				if (!widthsToApply || !(key in widthsToApply)) {
					generatedRoot.style.removeProperty(prop);
				}
			}
			if (prop.startsWith("--sk-h-")) {
				const key = prop.slice("--sk-h-".length);
				if (!heightsToApply || !(key in heightsToApply)) {
					generatedRoot.style.removeProperty(prop);
				}
			}
		}

		if (widthsToApply) {
			for (const [key, value] of Object.entries(widthsToApply)) {
				if (!Number.isFinite(value) || value < 0) continue;
				generatedRoot.style.setProperty(`--sk-w-${key}`, `${value}px`);
			}
		}

		if (heightsToApply) {
			for (const [key, value] of Object.entries(heightsToApply)) {
				if (!Number.isFinite(value) || value < 0) continue;
				generatedRoot.style.setProperty(`--sk-h-${key}`, `${value}px`);
			}
		}

		const textElements =
			generatedRoot.querySelectorAll<HTMLElement>("[data-sk-key]");
		for (const el of textElements) {
			const key = el.dataset.skKey;
			if (!key) continue;
			if (widthsToApply && key in widthsToApply) {
				el.style.setProperty("--loaded-text-width", `${widthsToApply[key]}px`);
			}
			if (heightsToApply && key in heightsToApply) {
				el.style.setProperty(
					"--loaded-text-height",
					`${heightsToApply[key]}px`,
				);
			}
		}
	}, [generatedRootClass, heightsToApply, loading, widthsToApply]);

	useEffect(() => {
		if (!isDev) return;
		setForceDevCaptureWrapper(false);
		warnedCaptureRef.current = false;
		warnedMissingGeneratedRef.current = false;
	}, [id, loading]);

	useEffect(() => {
		if (!isDev) return;

		const captureTarget = captureRef.current;
		if (!captureTarget) {
			if (!hasGeneratedSkeleton && !forceDevCaptureWrapper) {
				setForceDevCaptureWrapper(true);
				return;
			}
			if (!warnedCaptureRef.current) {
				warnedCaptureRef.current = true;
				console.warn(
					`[react-loaded] Could not access DOM for capture of "${id}". ` +
						"Wrap children in a DOM element or expose a ref-capable root.",
				);
			}
			return;
		}
		warnedCaptureRef.current = false;

		const root = captureHasWrapperRef.current
			? captureTarget.firstElementChild
			: captureTarget;
		if (!root) {
			if (!warnedCaptureRef.current) {
				warnedCaptureRef.current = true;
				console.warn(
					`[react-loaded] Could not resolve capture root for "${id}". ` +
						"Wrap children in a DOM element or expose a ref-capable root.",
				);
			}
			return;
		}

		const timer = setTimeout(() => {
			const tree = serializeElement(root);
			if (!tree) return;

			sendCapture({
				id,
				tree,
				timestamp: Date.now(),
			});
		}, 100);

		return () => clearTimeout(timer);
	}, [forceDevCaptureWrapper, hasGeneratedSkeleton, id, loading]);

	// When not loading in production, render children with a measure ref
	if (!loading && !isDev) {
		const cloned = tryCloneWithRef(children, (el) => {
			measureRef.current = el;
		});
		if (cloned) return <>{cloned}</>;
		return (
			<div
				ref={(el) => {
					measureRef.current = el;
				}}
				style={{ display: "contents" }}
			>
				{children}
			</div>
		);
	}

	if (isDev && loading && !Generated && !warnedMissingGeneratedRef.current) {
		warnedMissingGeneratedRef.current = true;
		console.warn(
			`[react-loaded] No generated skeleton found for id "${id}". ` +
				"Run the autoskeleton CLI to capture and generate it.",
		);
	}

	const generatedSkeleton =
		hasGeneratedSkeleton && Generated ? (
			<SkeletonContext.Provider value={true}>
				<Generated
					variant={variant}
					className={generatedClassName}
					style={skeletonRootStyle}
					dataSkId={id}
				/>
			</SkeletonContext.Provider>
		) : null;

	// Production: use the generated skeleton if available, otherwise render children
	if (!isDev) {
		if (generatedSkeleton) {
			return generatedSkeleton;
		}
		const cloned = tryCloneWithRef(children, (el) => {
			measureRef.current = el;
		});
		if (cloned) return <>{cloned}</>;
		return (
			<div
				ref={(el) => {
					measureRef.current = el;
				}}
				style={{ display: "contents" }}
			>
				{children}
			</div>
		);
	}

	// Dev: always render children for capture, even when loading=false
	// Show generated skeleton if loading and available
	const mergedDevRef: RefCallback<HTMLElement> = (el) => {
		captureRef.current = el;
		measureRef.current = el;
	};

	// When skeleton is shown, children are hidden off-screen — keep the wrapper
	if (generatedSkeleton) {
		captureHasWrapperRef.current = true;
		return (
			<>
				{generatedSkeleton}
				<div
					ref={mergedDevRef}
					aria-hidden="true"
					style={{
						position: "fixed",
						top: 0,
						left: "-10000px",
						width: "100%",
						visibility: "hidden",
						pointerEvents: "none",
					}}
				>
					{children}
				</div>
			</>
		);
	}

	// No skeleton shown — children are visible, try to eliminate wrapper
	const cloned = forceDevCaptureWrapper
		? null
		: tryCloneWithRef(children, mergedDevRef);
	if (cloned) {
		captureHasWrapperRef.current = false;
		return <>{cloned}</>;
	}
	captureHasWrapperRef.current = true;
	return (
		<div ref={mergedDevRef} style={{ display: "contents" }}>
			{children}
		</div>
	);
}
