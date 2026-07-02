import {
	Children,
	type CSSProperties,
	cloneElement,
	type ForwardedRef,
	Fragment,
	forwardRef,
	isValidElement,
	type ReactElement,
	type ReactNode,
	type RefCallback,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { captureElement } from "../capture/client";
import { usePersistedHeights } from "../storage/usePersistedHeights";
import { usePersistedWidths } from "../storage/usePersistedWidths";
import { collectTextDimensions } from "../utils/collect-text-dimensions";
import {
	useInitialHeightSnapshot,
	useInitialWidthSnapshot,
	useRegistry,
} from "./LoadedProvider";
import { shouldUseWrapper } from "./refCompatibility";
import { SkeletonContext } from "./SkeletonContext";

export interface AutoSkeletonProps {
	id?: string;
	loading?: boolean;
	animate?: boolean;
	variant?: "filled" | "ghost";
	className?: string;
	children?: ReactNode;
	/** When true, prevents automatic re-capture and file updates for this skeleton. */
	frozen?: boolean;
	/** Pre-computed widths to apply (used internally by AutoSkeletonList). */
	_textWidths?: Record<string, number>;
	/** Pre-computed heights to apply (used internally by AutoSkeletonList). */
	_textHeights?: Record<string, number>;
}

const isDev = process.env.NODE_ENV !== "production";

const OFF_SCREEN_STYLE: CSSProperties = {
	position: "fixed",
	top: 0,
	left: "-10000px",
	width: "100%",
	visibility: "hidden",
	pointerEvents: "none",
};

function applyParentLayout(el: HTMLElement): void {
	const parent = el.parentElement;
	if (!parent) return;
	const ps = getComputedStyle(parent);
	el.style.width = `${parent.getBoundingClientRect().width}px`;
	if (ps.display.includes("flex")) {
		el.style.display = ps.display;
		el.style.flexDirection = ps.flexDirection;
		el.style.alignItems = ps.alignItems;
		el.style.gap = ps.gap;
	} else if (ps.display.includes("grid")) {
		el.style.display = ps.display;
		el.style.gridTemplateColumns = ps.gridTemplateColumns;
		el.style.gap = ps.gap;
	}
}

const useIsomorphicLayoutEffect =
	typeof window === "undefined" ? useEffect : useLayoutEffect;

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

function setRef(
	ref: ForwardedRef<HTMLElement> | undefined,
	el: HTMLElement | null,
): void {
	if (!ref) return;
	if (typeof ref === "function") ref(el);
	else ref.current = el;
}

function asDomElement(value: unknown): HTMLElement | null {
	return value instanceof Element ? (value as HTMLElement) : null;
}

function tryCloneWithRef(
	children: ReactNode,
	ref: RefCallback<HTMLElement>,
	extraProps?: Record<string, unknown>,
): ReactNode | null {
	try {
		const child = Children.only(children);
		if (!isValidElement(child)) return null;
		if (child.type === Fragment) return null;

		const childProps = child.props as Record<string, unknown>;
		const merged = { ...extraProps };

		// Merge className with the child's existing className instead of overriding
		if (merged.className != null && childProps.className != null) {
			merged.className = `${childProps.className} ${merged.className}`;
		}

		// Compose with the child's existing ref (React 18 compat — React 19 does this automatically)
		const existingRef =
			childProps.ref ?? (child as unknown as { ref?: unknown }).ref;
		const composedRef = existingRef
			? (el: HTMLElement | null) => {
					ref(el);
					setRef(existingRef as ForwardedRef<HTMLElement>, el);
				}
			: ref;

		return cloneElement(child as ReactElement<Record<string, unknown>>, {
			...merged,
			ref: composedRef,
		});
	} catch {
		return null;
	}
}

type AutoSkeletonAllProps = AutoSkeletonProps &
	Omit<React.HTMLAttributes<HTMLElement>, keyof AutoSkeletonProps>;

export const AutoSkeleton = forwardRef<HTMLElement, AutoSkeletonAllProps>(
	function AutoSkeleton(
		{
			id,
			loading = false,
			animate = true,
			variant = "filled",
			className,
			children = null,
			frozen = false,
			_textWidths,
			_textHeights,
			...rest
		},
		externalRef,
	) {
		const registry = useRegistry();
		const Generated = id ? registry[id] : undefined;
		const hasGeneratedSkeleton = loading && Boolean(Generated);
		const [forceWrapper, setForceWrapper] = useState(false);
		const attachedRef = useRef<HTMLElement | null>(null);
		const attemptedDirectRef = useRef(false);
		const captureHasWrapperRef = useRef(false);

		// --- Dimension measurement ---
		const [measuredWidths, setMeasuredWidths] = useState<
			Record<string, number> | undefined
		>();
		const [measuredHeights, setMeasuredHeights] = useState<
			Record<string, number> | undefined
		>();

		const initialWidths = useInitialWidthSnapshot(id ?? "");
		const initialHeights = useInitialHeightSnapshot(id ?? "");

		const storedWidths = usePersistedWidths({
			storageKey: id ?? "",
			currentWidths: measuredWidths,
			loading,
			initialWidths,
		});

		const storedHeights = usePersistedHeights({
			storageKey: id ?? "",
			currentHeights: measuredHeights,
			loading,
			initialHeights,
		});

		const widthsToApply = _textWidths ?? storedWidths;
		const heightsToApply = _textHeights ?? storedHeights;
		const skeletonRootStyle = buildDimensionVars(widthsToApply, heightsToApply);

		const generatedClassName = joinClassNames(
			className,
			!animate && "loaded-no-animate",
		);

		// --- Wrapper logic ---
		const initialWrapperNeeded = shouldUseWrapper(children);
		const shouldRenderWrapper = forceWrapper || initialWrapperNeeded;

		captureHasWrapperRef.current = shouldRenderWrapper;

		// In non-loading mode, forward className to the child (in loading mode it's used for the skeleton)
		const forwardedRest = className != null ? { ...rest, className } : rest;

		const directRefChild =
			hasGeneratedSkeleton || shouldRenderWrapper
				? null
				: tryCloneWithRef(
						children,
						(el) => {
							const domEl = asDomElement(el);
							attachedRef.current = domEl;
							setRef(externalRef, domEl);
						},
						forwardedRest,
					);

		attemptedDirectRef.current = directRefChild != null;

		useLayoutEffect(() => {
			if (hasGeneratedSkeleton) return;
			if (shouldRenderWrapper) return;
			if (!attemptedDirectRef.current) return;
			if (attachedRef.current == null) {
				setForceWrapper(true);
			}
		}, [hasGeneratedSkeleton, shouldRenderWrapper]);

		// --- Measurement effect ---
		const handleMeasure = useCallback(() => {
			if (loading || !id) return;
			const target = attachedRef.current;
			if (!target) return;

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

		// --- Dev capture effect ---
		useEffect(() => {
			if (!isDev || !id) return;
			if (frozen) return;
			if (loading && !hasGeneratedSkeleton) return;

			const captureTarget = attachedRef.current;
			if (!captureTarget && !shouldRenderWrapper) return;

			const timer = setTimeout(() => {
				const root = captureHasWrapperRef.current
					? (captureTarget?.firstElementChild ?? captureTarget)
					: captureTarget;
				if (!root) return;

				captureElement(id, root);
			}, 100);

			return () => clearTimeout(timer);
		}, [id, loading, shouldRenderWrapper, hasGeneratedSkeleton, frozen]);

		// --- Imperative style update on skeleton root ---
		useIsomorphicLayoutEffect(() => {
			if (!loading || !Generated) return;
			// Find the skeleton root element by data-sk-id
			if (!id) return;
			const generatedRoot = document.querySelector(
				`[data-sk-id="${id}"]`,
			) as HTMLElement | null;
			if (!generatedRoot) return;

			// Clean stale vars
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
		}, [id, loading, Generated, widthsToApply, heightsToApply]);

		// --- Render ---
		if (hasGeneratedSkeleton && Generated) {
			const skeleton = (
				<SkeletonContext.Provider value={true}>
					<Generated
						variant={variant}
						className={generatedClassName}
						style={skeletonRootStyle}
						dataSkId={id}
					/>
				</SkeletonContext.Provider>
			);

			if (!isDev || frozen) return skeleton;

			// Dev: skeleton + children off-screen pour détecter les changements et re-capturer
			captureHasWrapperRef.current = true;
			return (
				<>
					{skeleton}
					<div
						ref={(el) => {
							attachedRef.current = el;
							if (el) applyParentLayout(el);
						}}
						aria-hidden="true"
						style={OFF_SCREEN_STYLE}
					>
						{children}
					</div>
				</>
			);
		}

		if (directRefChild) {
			return <>{directRefChild}</>;
		}

		if (children == null) {
			return null;
		}

		attachedRef.current = null;
		return (
			<div
				data-loaded-wrapper="true"
				ref={(el) => {
					attachedRef.current = el;
					setRef(externalRef, el);
				}}
				style={{ display: "contents" }}
				{...forwardedRest}
			>
				{children}
			</div>
		);
	},
);
