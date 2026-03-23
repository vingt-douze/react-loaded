import { act, render, screen } from "@testing-library/react";
import { type CSSProperties, createRef, Fragment, forwardRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendCapture } from "../capture/client";
import { serializeElement } from "../capture/serialize";
import type { CapturedNode } from "../types";
import { AutoSkeleton } from "./AutoSkeleton";
import { LoadedProvider } from "./LoadedProvider";
import { useIsSkeletonMode } from "./SkeletonContext";

vi.mock("../capture/serialize", () => ({
	serializeElement: vi.fn(),
}));

vi.mock("../capture/client", () => ({
	sendCapture: vi.fn(),
}));

const mockedSerializeElement = vi.mocked(serializeElement);
const mockedSendCapture = vi.mocked(sendCapture);

const mockTree: CapturedNode = {
	tag: "article",
	className: "",
	style: {},
	attributes: {},
	children: [],
	nodeType: "layout",
};

type GeneratedProps = {
	variant?: "filled" | "ghost";
	className?: string;
	style?: CSSProperties;
	dataSkId?: string;
};

describe("AutoSkeleton", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockedSerializeElement.mockReset();
		mockedSendCapture.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("renders generated skeleton in dev and still captures source children", () => {
		mockedSerializeElement.mockReturnValue(mockTree);

		function Generated({ className, style, dataSkId }: GeneratedProps) {
			return (
				<div
					data-testid="generated"
					className={className}
					style={style}
					data-sk-id={dataSkId}
				>
					Generated
				</div>
			);
		}

		render(
			<LoadedProvider registry={{ "user-card": Generated }}>
				<AutoSkeleton id="user-card">
					<article data-testid="source">Source content</article>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("generated")).toBeInTheDocument();
		expect(screen.getByTestId("source")).toBeInTheDocument();
		expect(document.querySelector(".loaded-dev-skeleton")).toBeInTheDocument();

		act(() => {
			vi.advanceTimersByTime(100);
		});

		expect(mockedSerializeElement).toHaveBeenCalledTimes(1);
		expect(mockedSerializeElement).toHaveBeenCalledWith(expect.any(Element));
		expect(mockedSendCapture).toHaveBeenCalledTimes(1);
		expect(mockedSendCapture).toHaveBeenCalledWith({
			id: "user-card",
			tree: mockTree,
			timestamp: expect.any(Number),
		});
	});

	it("captures children even when no generated skeleton is registered", () => {
		mockedSerializeElement.mockReturnValue(mockTree);

		render(
			<LoadedProvider registry={{}}>
				<AutoSkeleton id="plain-card">
					<section data-testid="plain-source">Plain source</section>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("plain-source")).toBeInTheDocument();

		act(() => {
			vi.advanceTimersByTime(100);
		});

		expect(mockedSerializeElement).toHaveBeenCalledTimes(1);
		expect(mockedSendCapture).toHaveBeenCalledTimes(1);
		expect(mockedSendCapture).toHaveBeenCalledWith({
			id: "plain-card",
			tree: mockTree,
			timestamp: expect.any(Number),
		});
	});

	it("sets width CSS variables on skeleton wrapper from persisted snapshot", () => {
		function Generated({ className, style, dataSkId }: GeneratedProps) {
			return (
				<p
					data-testid="generated-text"
					className={className}
					style={style}
					data-sk-id={dataSkId}
				>
					Generated
				</p>
			);
		}

		render(
			<LoadedProvider
				registry={{ card: Generated }}
				persistedSnapshot={{
					w: { card: { t0: 123.4, t1: -10, t2: Number.NaN } },
				}}
			>
				<AutoSkeleton id="card">
					<div>Source</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("generated-text")).toBeInTheDocument();

		const wrapper = document.querySelector<HTMLElement>('[data-sk-id="card"]');
		expect(wrapper).toBeTruthy();
		expect(wrapper?.style.getPropertyValue("--sk-w-t0")).toBe("123.4px");
		expect(wrapper?.style.getPropertyValue("--sk-w-t1")).toBe("");
		expect(wrapper?.style.getPropertyValue("--sk-w-t2")).toBe("");
	});

	it("sets height CSS variables on skeleton wrapper from persisted snapshot", () => {
		function Generated({ className, style, dataSkId }: GeneratedProps) {
			return (
				<p
					data-testid="generated-text"
					className={className}
					style={style}
					data-sk-id={dataSkId}
				>
					Generated
				</p>
			);
		}

		render(
			<LoadedProvider
				registry={{ card: Generated }}
				persistedSnapshot={{
					h: { card: { t0: 20.5, t1: -5, t2: Number.NaN } },
				}}
			>
				<AutoSkeleton id="card">
					<div>Source</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		const wrapper = document.querySelector<HTMLElement>('[data-sk-id="card"]');
		expect(wrapper).toBeTruthy();
		expect(wrapper?.style.getPropertyValue("--sk-h-t0")).toBe("20.5px");
		expect(wrapper?.style.getPropertyValue("--sk-h-t1")).toBe("");
		expect(wrapper?.style.getPropertyValue("--sk-h-t2")).toBe("");
	});

	it("sets both width and height CSS variables from persisted snapshot", () => {
		function Generated({ className, style, dataSkId }: GeneratedProps) {
			return (
				<p
					data-testid="generated-text"
					className={className}
					style={style}
					data-sk-id={dataSkId}
				>
					Generated
				</p>
			);
		}

		render(
			<LoadedProvider
				registry={{ card: Generated }}
				persistedSnapshot={{
					w: { card: { t0: 100 } },
					h: { card: { t0: 20 } },
				}}
			>
				<AutoSkeleton id="card">
					<div>Source</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		const wrapper = document.querySelector<HTMLElement>('[data-sk-id="card"]');
		expect(wrapper).toBeTruthy();
		expect(wrapper?.style.getPropertyValue("--sk-w-t0")).toBe("100px");
		expect(wrapper?.style.getPropertyValue("--sk-h-t0")).toBe("20px");
	});

	it("does not send capture when serialization returns null", () => {
		mockedSerializeElement.mockReturnValue(null);

		render(
			<LoadedProvider registry={{}}>
				<AutoSkeleton id="empty-case">
					<div data-testid="source-empty">Source</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		act(() => {
			vi.advanceTimersByTime(100);
		});

		expect(mockedSerializeElement).toHaveBeenCalledTimes(1);
		expect(mockedSendCapture).not.toHaveBeenCalled();
	});

	it("enables skeleton mode context for generated skeleton trees", () => {
		function Generated({ className, style, dataSkId }: GeneratedProps) {
			const isSkeletonMode = useIsSkeletonMode();
			return (
				<div
					data-testid="generated-mode"
					className={className}
					style={style}
					data-sk-id={dataSkId}
				>
					{String(isSkeletonMode)}
				</div>
			);
		}

		render(
			<LoadedProvider registry={{ "mode-test": Generated }}>
				<AutoSkeleton id="mode-test">
					<div data-testid="mode-source">Source</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("generated-mode")).toHaveTextContent("true");
		expect(screen.getByTestId("mode-source")).toHaveTextContent("Source");
	});

	it("keeps source children out of skeleton mode when no generated skeleton exists", () => {
		function SourceChild() {
			const isSkeletonMode = useIsSkeletonMode();
			return <div data-testid="source-mode">{String(isSkeletonMode)}</div>;
		}

		render(
			<LoadedProvider registry={{}}>
				<AutoSkeleton id="source-only">
					<SourceChild />
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("source-mode")).toHaveTextContent("false");
	});

	it("renders children directly when loading=false", () => {
		function Generated({ className, style, dataSkId }: GeneratedProps) {
			return (
				<div
					data-testid="generated"
					className={className}
					style={style}
					data-sk-id={dataSkId}
				>
					Generated
				</div>
			);
		}

		render(
			<LoadedProvider registry={{ card: Generated }}>
				<AutoSkeleton id="card" loading={false}>
					<div data-testid="child">Content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("child")).toBeInTheDocument();
		expect(screen.queryByTestId("generated")).not.toBeInTheDocument();
	});

	it("renders children even when skeleton is registered and loading=false", () => {
		function Generated({ className, style, dataSkId }: GeneratedProps) {
			return (
				<div
					data-testid="generated"
					className={className}
					style={style}
					data-sk-id={dataSkId}
				>
					Skeleton
				</div>
			);
		}

		render(
			<LoadedProvider registry={{ card: Generated }}>
				<AutoSkeleton id="card" loading={false}>
					<div data-testid="content">Real content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("content")).toBeInTheDocument();
		expect(screen.queryByTestId("generated")).not.toBeInTheDocument();
	});

	it("transitions from loading=true to loading=false", () => {
		function Generated({ className, style, dataSkId }: GeneratedProps) {
			return (
				<div
					data-testid="generated"
					className={className}
					style={style}
					data-sk-id={dataSkId}
				>
					Skeleton
				</div>
			);
		}

		const { rerender } = render(
			<LoadedProvider registry={{ card: Generated }}>
				<AutoSkeleton id="card" loading={true}>
					<div data-testid="content">Content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("generated")).toBeInTheDocument();

		rerender(
			<LoadedProvider registry={{ card: Generated }}>
				<AutoSkeleton id="card" loading={false}>
					<div data-testid="content">Content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.queryByTestId("generated")).not.toBeInTheDocument();
		expect(screen.getByTestId("content")).toBeInTheDocument();
	});

	it("transitions from loading=false to loading=true", () => {
		function Generated({ className, style, dataSkId }: GeneratedProps) {
			return (
				<div
					data-testid="generated"
					className={className}
					style={style}
					data-sk-id={dataSkId}
				>
					Skeleton
				</div>
			);
		}

		const { rerender } = render(
			<LoadedProvider registry={{ card: Generated }}>
				<AutoSkeleton id="card" loading={false}>
					<div data-testid="content">Content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.queryByTestId("generated")).not.toBeInTheDocument();

		rerender(
			<LoadedProvider registry={{ card: Generated }}>
				<AutoSkeleton id="card" loading={true}>
					<div data-testid="content">Content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("generated")).toBeInTheDocument();
	});

	it("still captures in dev mode even when loading=false", () => {
		mockedSerializeElement.mockReturnValue(mockTree);

		render(
			<LoadedProvider registry={{}}>
				<AutoSkeleton id="dev-capture" loading={false}>
					<div data-testid="child">Content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("child")).toBeInTheDocument();

		act(() => {
			vi.advanceTimersByTime(100);
		});

		expect(mockedSerializeElement).toHaveBeenCalledTimes(1);
		expect(mockedSendCapture).toHaveBeenCalledTimes(1);
	});

	it("wraps generated skeleton in .loaded-no-animate when animate=false", () => {
		function Generated({ className, style, dataSkId }: GeneratedProps) {
			return (
				<div
					data-testid="generated"
					className={className}
					style={style}
					data-sk-id={dataSkId}
				>
					Skeleton
				</div>
			);
		}

		render(
			<LoadedProvider registry={{ card: Generated }}>
				<AutoSkeleton id="card" animate={false}>
					<div>Source</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(document.querySelector(".loaded-no-animate")).toBeInTheDocument();
		expect(screen.getByTestId("generated")).toBeInTheDocument();
	});

	it("passes variant to generated skeleton component", () => {
		function Generated({
			variant,
			className,
			style,
			dataSkId,
		}: GeneratedProps) {
			return (
				<div
					data-testid="gen"
					data-variant={variant}
					className={className}
					style={style}
					data-sk-id={dataSkId}
				/>
			);
		}

		render(
			<LoadedProvider registry={{ card: Generated }}>
				<AutoSkeleton id="card" variant="ghost">
					<div>Source</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("gen")).toHaveAttribute("data-variant", "ghost");
	});

	it("falls back to children when registry misses the id", () => {
		render(
			<LoadedProvider registry={{}}>
				<AutoSkeleton id="missing">
					<div data-testid="fallback">Fallback</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("fallback")).toBeInTheDocument();
		expect(
			document.querySelector(".loaded-dev-skeleton"),
		).not.toBeInTheDocument();
	});

	it("warns in dev when loading=true but id is not in registry", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		render(
			<LoadedProvider registry={{}}>
				<AutoSkeleton id="unregistered" loading={true}>
					<div>Content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				'No generated skeleton found for id "unregistered"',
			),
		);

		warnSpy.mockRestore();
	});

	it("renders single DOM child without a wrapper div when loading=false and no skeleton", () => {
		const { container } = render(
			<LoadedProvider registry={{}}>
				<AutoSkeleton id="no-wrap" loading={false}>
					<article data-testid="only-child">Content</article>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("only-child")).toBeInTheDocument();
		// No wrapper div with display:contents should exist
		expect(
			container.querySelector('[style*="display: contents"]'),
		).not.toBeInTheDocument();
		// The article should be a direct child of the container
		expect(container.firstElementChild?.tagName).toBe("ARTICLE");
	});

	it("preserves existing ref on child when cloning to eliminate wrapper", () => {
		const childRef = createRef<HTMLDivElement>();

		render(
			<LoadedProvider registry={{}}>
				<AutoSkeleton id="ref-merge" loading={false}>
					<div ref={childRef} data-testid="ref-child">
						Content
					</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("ref-child")).toBeInTheDocument();
		expect(childRef.current).toBe(screen.getByTestId("ref-child"));
	});

	it("falls back to wrapper div when children is a Fragment", () => {
		const { container } = render(
			<LoadedProvider registry={{}}>
				<AutoSkeleton id="fragment-child" loading={false}>
					<Fragment>
						<div data-testid="frag-a">A</div>
						<div data-testid="frag-b">B</div>
					</Fragment>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("frag-a")).toBeInTheDocument();
		expect(screen.getByTestId("frag-b")).toBeInTheDocument();
		expect(container.querySelector('[style*="display"]')).toBeInTheDocument();
	});

	it("falls back to wrapper div when there are multiple children", () => {
		const { container } = render(
			<LoadedProvider registry={{}}>
				<AutoSkeleton id="multi-child" loading={false}>
					<div data-testid="child-a">A</div>
					<div data-testid="child-b">B</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("child-a")).toBeInTheDocument();
		expect(screen.getByTestId("child-b")).toBeInTheDocument();
		expect(container.querySelector('[style*="display"]')).toBeInTheDocument();
	});

	it("renders component child without forwardRef without wrapper and warns", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		function NoForwardRef() {
			return <span data-testid="no-fwd">Hello</span>;
		}

		render(
			<LoadedProvider registry={{}}>
				<AutoSkeleton id="no-fwd-ref" loading={false}>
					<NoForwardRef />
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("no-fwd")).toBeInTheDocument();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('Could not access DOM for "no-fwd-ref"'),
		);

		warnSpy.mockRestore();
	});

	it("renders forwardRef component child without wrapper and no warning", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const WithForwardRef = forwardRef<HTMLDivElement>(
			function WithRef(_props, ref) {
				return (
					<div ref={ref} data-testid="fwd-child">
						Content
					</div>
				);
			},
		);

		const { container } = render(
			<LoadedProvider registry={{}}>
				<AutoSkeleton id="fwd-ref" loading={false}>
					<WithForwardRef />
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("fwd-child")).toBeInTheDocument();
		expect(container.firstElementChild?.tagName).toBe("DIV");
		expect(
			container.querySelector('[style*="display: contents"]'),
		).not.toBeInTheDocument();
		// Should not warn about DOM access since forwardRef passes the ref
		expect(warnSpy).not.toHaveBeenCalledWith(
			expect.stringContaining("Could not access DOM"),
		);

		warnSpy.mockRestore();
	});
});

describe("AutoSkeleton (production mode)", () => {
	let ProdAutoSkeleton: typeof AutoSkeleton;
	let ProdLoadedProvider: typeof LoadedProvider;
	let ProdUseIsSkeletonMode: typeof useIsSkeletonMode;

	beforeEach(async () => {
		vi.resetModules();
		vi.stubEnv("NODE_ENV", "production");

		const compMod = await import("./AutoSkeleton");
		const providerMod = await import("./LoadedProvider");
		const ctxMod = await import("./SkeletonContext");

		ProdAutoSkeleton = compMod.AutoSkeleton;
		ProdLoadedProvider = providerMod.LoadedProvider;
		ProdUseIsSkeletonMode = ctxMod.useIsSkeletonMode;
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns children directly when loading=false in production", () => {
		function Generated({ className, style, dataSkId }: GeneratedProps) {
			return (
				<div
					data-testid="generated"
					className={className}
					style={style}
					data-sk-id={dataSkId}
				>
					Skeleton
				</div>
			);
		}

		render(
			<ProdLoadedProvider registry={{ card: Generated }}>
				<ProdAutoSkeleton id="card" loading={false}>
					<div data-testid="prod-child">Production content</div>
				</ProdAutoSkeleton>
			</ProdLoadedProvider>,
		);

		expect(screen.getByTestId("prod-child")).toBeInTheDocument();
		expect(screen.queryByTestId("generated")).not.toBeInTheDocument();
	});

	it("renders generated skeleton with context in production when loading=true", () => {
		function Generated({ className, style, dataSkId }: GeneratedProps) {
			const isSkeleton = ProdUseIsSkeletonMode();
			return (
				<div
					data-testid="prod-gen"
					data-skeleton={String(isSkeleton)}
					className={className}
					style={style}
					data-sk-id={dataSkId}
				>
					Skeleton
				</div>
			);
		}

		render(
			<ProdLoadedProvider registry={{ card: Generated }}>
				<ProdAutoSkeleton id="card" loading={true}>
					<div data-testid="prod-child">Content</div>
				</ProdAutoSkeleton>
			</ProdLoadedProvider>,
		);

		expect(screen.getByTestId("prod-gen")).toBeInTheDocument();
		expect(screen.getByTestId("prod-gen")).toHaveAttribute(
			"data-skeleton",
			"true",
		);
		expect(screen.queryByTestId("prod-child")).not.toBeInTheDocument();
	});

	it("falls back to children in production when id is not in registry", () => {
		render(
			<ProdLoadedProvider registry={{}}>
				<ProdAutoSkeleton id="missing" loading={true}>
					<div data-testid="prod-fallback">Fallback</div>
				</ProdAutoSkeleton>
			</ProdLoadedProvider>,
		);

		expect(screen.getByTestId("prod-fallback")).toBeInTheDocument();
	});

	it("renders single DOM child without wrapper in production when loading=false", () => {
		const { container } = render(
			<ProdLoadedProvider registry={{}}>
				<ProdAutoSkeleton id="prod-no-wrap" loading={false}>
					<section data-testid="prod-only">Content</section>
				</ProdAutoSkeleton>
			</ProdLoadedProvider>,
		);

		expect(screen.getByTestId("prod-only")).toBeInTheDocument();
		expect(
			container.querySelector('[style*="display: contents"]'),
		).not.toBeInTheDocument();
		expect(container.firstElementChild?.tagName).toBe("SECTION");
	});

	it("falls back to wrapper in production with multiple children", () => {
		const { container } = render(
			<ProdLoadedProvider registry={{}}>
				<ProdAutoSkeleton id="prod-multi" loading={false}>
					<div data-testid="a">A</div>
					<div data-testid="b">B</div>
				</ProdAutoSkeleton>
			</ProdLoadedProvider>,
		);

		expect(screen.getByTestId("a")).toBeInTheDocument();
		expect(screen.getByTestId("b")).toBeInTheDocument();
		expect(container.querySelector('[style*="display"]')).toBeInTheDocument();
	});
});
