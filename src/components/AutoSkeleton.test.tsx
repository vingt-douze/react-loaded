import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Fragment, forwardRef, type Ref, useImperativeHandle } from "react";
import { describe, expect, it, vi } from "vitest";
import { AutoSkeleton } from "./AutoSkeleton";
import { LoadedProvider } from "./LoadedProvider";
import { useIsSkeletonMode } from "./SkeletonContext";

vi.mock("../capture/client", () => ({
	captureElement: vi.fn(),
}));

type User = {
	name: string;
};

function ProfileCard({ user }: { user: User }) {
	return <article data-testid="profile-card">{user.name}</article>;
}

describe("AutoSkeleton (children placeholders with ??)", () => {
	it("renders children by default when loading prop is omitted", () => {
		render(
			<AutoSkeleton>
				<ProfileCard user={{ name: "Alice" }} />
			</AutoSkeleton>,
		);

		expect(screen.getByTestId("profile-card").textContent).toBe("Alice");
	});

	it("renders children when loading is false", () => {
		render(
			<AutoSkeleton loading={false}>
				<ProfileCard user={{ name: "Alice" }} />
			</AutoSkeleton>,
		);

		expect(screen.getByTestId("profile-card").textContent).toBe("Alice");
	});

	it("renders children placeholders when loading is true and values use ??", () => {
		let user: User | undefined;

		render(
			<AutoSkeleton loading={true}>
				<ProfileCard
					user={{
						name: user?.name ?? "Loading...",
					}}
				/>
			</AutoSkeleton>,
		);

		expect(screen.getByTestId("profile-card").textContent).toBe("Loading...");
	});

	it("renders real data even when loading is true if values are already available", () => {
		const user: User = { name: "Joe" };

		render(
			<AutoSkeleton loading={true}>
				<ProfileCard
					user={{
						name: user?.name ?? "Loading...",
					}}
				/>
			</AutoSkeleton>,
		);

		expect(screen.getByTestId("profile-card").textContent).toBe("Joe");
	});

	it("renders generated skeleton when loading is true and id exists in registry", () => {
		function GeneratedProfileSkeleton() {
			return <div data-testid="generated-skeleton">Generated skeleton</div>;
		}

		render(
			<LoadedProvider registry={{ "profile-card": GeneratedProfileSkeleton }}>
				<AutoSkeleton id="profile-card" loading={true}>
					<ProfileCard user={{ name: "Alice" }} />
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("generated-skeleton")).toBeInTheDocument();
		// In dev mode, children are rendered off-screen alongside the skeleton
		expect(screen.getByTestId("profile-card")).toBeInTheDocument();
	});

	it("falls back to children when loading is true and id is missing from registry", () => {
		render(
			<LoadedProvider registry={{}}>
				<AutoSkeleton id="profile-card" loading={true}>
					<ProfileCard user={{ name: "Loading..." }} />
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("profile-card").textContent).toBe("Loading...");
		expect(screen.queryByTestId("generated-skeleton")).not.toBeInTheDocument();
	});

	it("provides skeleton mode=true inside generated skeleton", () => {
		function GeneratedModeProbe() {
			const isSkeletonMode = useIsSkeletonMode();
			return <div data-testid="generated-mode">{String(isSkeletonMode)}</div>;
		}

		render(
			<LoadedProvider registry={{ "profile-card": GeneratedModeProbe }}>
				<AutoSkeleton id="profile-card" loading={true}>
					<ProfileCard user={{ name: "Alice" }} />
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("generated-mode").textContent).toBe("true");
	});

	it("keeps skeleton mode=false for children outside generated skeleton", () => {
		function ChildModeProbe() {
			const isSkeletonMode = useIsSkeletonMode();
			return <div data-testid="child-mode">{String(isSkeletonMode)}</div>;
		}

		render(
			<LoadedProvider registry={{}}>
				<AutoSkeleton id="profile-card" loading={false}>
					<ChildModeProbe />
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("child-mode").textContent).toBe("false");
	});
});

describe("AutoSkeleton (wrapper integration)", () => {
	it("does not use wrapper for a single DOM child", () => {
		render(
			<div data-testid="parent">
				<AutoSkeleton loading={false}>
					<div data-testid="dom-child">Hello</div>
				</AutoSkeleton>
			</div>,
		);

		const parent = screen.getByTestId("parent");
		const child = screen.getByTestId("dom-child");
		expect(child.parentElement).toBe(parent);
	});

	it("falls back to wrapper for non ref-compatible function components", async () => {
		function NoRefComponent() {
			return <div data-testid="no-ref-child">Hello</div>;
		}

		render(
			<div data-testid="parent">
				<AutoSkeleton loading={false}>
					<NoRefComponent />
				</AutoSkeleton>
			</div>,
		);

		const parent = screen.getByTestId("parent");
		expect(screen.getByTestId("no-ref-child")).toBeInTheDocument();
		await waitFor(() => {
			const wrapper = parent.querySelector('[data-loaded-wrapper="true"]');
			expect(wrapper).toBeInTheDocument();
			expect(wrapper?.parentElement).toBe(parent);
			expect(screen.getByTestId("no-ref-child").parentElement).toBe(wrapper);
		});
	});

	it("does not use wrapper for forwardRef components", () => {
		const ForwardRefComponent = forwardRef<HTMLDivElement>(
			function ForwardRefComponent(_props, ref) {
				return (
					<div ref={ref} data-testid="forward-ref-child">
						Hello
					</div>
				);
			},
		);

		render(
			<div data-testid="parent">
				<AutoSkeleton loading={false}>
					<ForwardRefComponent />
				</AutoSkeleton>
			</div>,
		);

		const parent = screen.getByTestId("parent");
		const child = screen.getByTestId("forward-ref-child");
		expect(child.parentElement).toBe(parent);
	});

	it("does not use wrapper for React 19 ref-prop components that forward ref", () => {
		function RefPropForwardingComponent({
			ref,
		}: {
			ref?: Ref<HTMLDivElement>;
		}) {
			return (
				<div ref={ref} data-testid="ref-prop-forwarding-child">
					Hello
				</div>
			);
		}

		render(
			<div data-testid="parent">
				<AutoSkeleton loading={false}>
					<RefPropForwardingComponent />
				</AutoSkeleton>
			</div>,
		);

		const parent = screen.getByTestId("parent");
		const child = screen.getByTestId("ref-prop-forwarding-child");
		expect(child.parentElement).toBe(parent);
	});

	it("falls back to wrapper at runtime when React 19 ref-prop component ignores ref", async () => {
		function RefPropIgnoringComponent({
			ref: _ref,
		}: {
			ref?: Ref<HTMLDivElement>;
		}) {
			return <div data-testid="ref-prop-ignoring-child">Hello</div>;
		}

		render(
			<div data-testid="parent">
				<AutoSkeleton loading={false}>
					<RefPropIgnoringComponent />
				</AutoSkeleton>
			</div>,
		);

		const parent = screen.getByTestId("parent");
		expect(screen.getByTestId("ref-prop-ignoring-child")).toBeInTheDocument();

		await waitFor(() => {
			const wrapper = parent.querySelector('[data-loaded-wrapper="true"]');
			expect(wrapper).toBeInTheDocument();
			expect(wrapper?.parentElement).toBe(parent);
			expect(screen.getByTestId("ref-prop-ignoring-child").parentElement).toBe(
				wrapper,
			);
		});
	});

	it("falls back to wrapper when the child's ref resolves to a non-DOM handle (e.g. Ant Design Form)", async () => {
		// Ant Design's <Form> is a forwardRef component whose ref exposes an
		// imperative FormInstance, not the DOM <form>. Measuring/serializing that
		// object throws on `.tagName`, so the child must fall back to the wrapper.
		const FormLike = forwardRef<{ submit: () => void }>(
			function FormLike(_props, ref) {
				useImperativeHandle(ref, () => ({ submit: () => {} }), []);
				return <div data-testid="form-like-child">Hello</div>;
			},
		);

		render(
			<div data-testid="parent">
				<AutoSkeleton loading={false}>
					<FormLike />
				</AutoSkeleton>
			</div>,
		);

		const parent = screen.getByTestId("parent");
		expect(screen.getByTestId("form-like-child")).toBeInTheDocument();

		await waitFor(() => {
			const wrapper = parent.querySelector('[data-loaded-wrapper="true"]');
			expect(wrapper).toBeInTheDocument();
			expect(wrapper?.parentElement).toBe(parent);
			expect(screen.getByTestId("form-like-child").parentElement).toBe(wrapper);
		});
	});
});

describe("AutoSkeleton (loading transitions)", () => {
	it("switches from skeleton to children when loading becomes false", () => {
		function GeneratedSkeleton() {
			return <div data-testid="generated-skeleton">skeleton</div>;
		}

		const { rerender } = render(
			<LoadedProvider registry={{ card: GeneratedSkeleton }}>
				<AutoSkeleton id="card" loading={true}>
					<div data-testid="real-content">content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("generated-skeleton")).toBeInTheDocument();
		// In dev mode, children are rendered off-screen alongside the skeleton
		expect(screen.getByTestId("real-content")).toBeInTheDocument();

		rerender(
			<LoadedProvider registry={{ card: GeneratedSkeleton }}>
				<AutoSkeleton id="card" loading={false}>
					<div data-testid="real-content">content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.queryByTestId("generated-skeleton")).not.toBeInTheDocument();
		expect(screen.getByTestId("real-content")).toBeInTheDocument();
	});

	it("switches from children to skeleton when loading becomes true", () => {
		function GeneratedSkeleton() {
			return <div data-testid="generated-skeleton">skeleton</div>;
		}

		const { rerender } = render(
			<LoadedProvider registry={{ card: GeneratedSkeleton }}>
				<AutoSkeleton id="card" loading={false}>
					<div data-testid="real-content">content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("real-content")).toBeInTheDocument();

		rerender(
			<LoadedProvider registry={{ card: GeneratedSkeleton }}>
				<AutoSkeleton id="card" loading={true}>
					<div data-testid="real-content">content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("generated-skeleton")).toBeInTheDocument();
		// In dev mode, children are rendered off-screen alongside the skeleton
		expect(screen.getByTestId("real-content")).toBeInTheDocument();
	});
});

describe("AutoSkeleton (null / empty children)", () => {
	it("renders null when children is null and not loading", () => {
		const { container } = render(
			<AutoSkeleton loading={false}>{null}</AutoSkeleton>,
		);

		expect(container.innerHTML).toBe("");
	});

	it("renders null when children is undefined and not loading", () => {
		const { container } = render(<AutoSkeleton loading={false} />);

		expect(container.innerHTML).toBe("");
	});

	it("renders null when loading is true but no skeleton in registry", () => {
		const { container } = render(
			<AutoSkeleton loading={true}>{null}</AutoSkeleton>,
		);

		expect(container.innerHTML).toBe("");
	});
});

describe("AutoSkeleton (skeleton mode context)", () => {
	it("provides skeleton mode=false when loading is false even with registry", () => {
		function ModeProbe() {
			const isSkeletonMode = useIsSkeletonMode();
			return <div data-testid="mode">{String(isSkeletonMode)}</div>;
		}

		function GeneratedSkeleton() {
			return <div>skeleton</div>;
		}

		render(
			<LoadedProvider registry={{ card: GeneratedSkeleton }}>
				<AutoSkeleton id="card" loading={false}>
					<ModeProbe />
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("mode").textContent).toBe("false");
	});
});

describe("AutoSkeleton (dev capture)", () => {
	it("calls captureElement when not loading and id is set", async () => {
		const { captureElement } = await import("../capture/client");

		render(
			<AutoSkeleton id="my-card" loading={false}>
				<div data-testid="content">Hello</div>
			</AutoSkeleton>,
		);

		await waitFor(() => {
			expect(captureElement).toHaveBeenCalledWith(
				"my-card",
				expect.any(Element),
			);
		});
	});

	it("does not call captureElement when loading is true", async () => {
		const { captureElement } = await import("../capture/client");
		vi.mocked(captureElement).mockClear();

		render(
			<AutoSkeleton id="my-card" loading={true}>
				<div>Hello</div>
			</AutoSkeleton>,
		);

		// Wait a bit to confirm it's not called
		await new Promise((r) => setTimeout(r, 150));
		expect(captureElement).not.toHaveBeenCalled();
	});

	it("does not call captureElement when id is not set", async () => {
		const { captureElement } = await import("../capture/client");
		vi.mocked(captureElement).mockClear();

		render(
			<AutoSkeleton loading={false}>
				<div>Hello</div>
			</AutoSkeleton>,
		);

		await new Promise((r) => setTimeout(r, 150));
		expect(captureElement).not.toHaveBeenCalled();
	});

	it("does not call captureElement when frozen is true", async () => {
		const { captureElement } = await import("../capture/client");
		vi.mocked(captureElement).mockClear();

		render(
			<AutoSkeleton id="frozen-card" loading={false} frozen>
				<div>Hello</div>
			</AutoSkeleton>,
		);

		await new Promise((r) => setTimeout(r, 150));
		expect(captureElement).not.toHaveBeenCalled();
	});

	it("calls captureElement when frozen is false", async () => {
		const { captureElement } = await import("../capture/client");
		vi.mocked(captureElement).mockClear();

		render(
			<AutoSkeleton id="unfrozen-card" loading={false} frozen={false}>
				<div>Hello</div>
			</AutoSkeleton>,
		);

		await waitFor(() => {
			expect(captureElement).toHaveBeenCalledWith(
				"unfrozen-card",
				expect.any(Element),
			);
		});
	});
});

describe("AutoSkeleton (animate, variant, className)", () => {
	it("passes variant and className to the generated skeleton", () => {
		function GeneratedSkeleton({
			variant,
			className,
		}: {
			variant?: string;
			className?: string;
		}) {
			return (
				<div
					data-testid="gen"
					data-variant={variant}
					data-classname={className}
				/>
			);
		}

		render(
			<LoadedProvider registry={{ card: GeneratedSkeleton }}>
				<AutoSkeleton
					id="card"
					loading={true}
					variant="ghost"
					className="custom-class"
				>
					<div>content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		const el = screen.getByTestId("gen");
		expect(el.dataset.variant).toBe("ghost");
		expect(el.dataset.classname).toContain("custom-class");
	});

	it("adds loaded-no-animate class when animate=false", () => {
		function GeneratedSkeleton({ className }: { className?: string }) {
			return <div data-testid="gen" className={className} />;
		}

		render(
			<LoadedProvider registry={{ card: GeneratedSkeleton }}>
				<AutoSkeleton id="card" loading={true} animate={false}>
					<div>content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		const el = screen.getByTestId("gen");
		expect(el.className).toContain("loaded-no-animate");
	});

	it("does not add loaded-no-animate class when animate=true (default)", () => {
		function GeneratedSkeleton({ className }: { className?: string }) {
			return <div data-testid="gen" className={className} />;
		}

		render(
			<LoadedProvider registry={{ card: GeneratedSkeleton }}>
				<AutoSkeleton id="card" loading={true}>
					<div>content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		const el = screen.getByTestId("gen");
		expect(el.className).not.toContain("loaded-no-animate");
	});
});

describe("AutoSkeleton (wrapper fallback edge cases)", () => {
	it("uses wrapper when children are multiple elements", () => {
		render(
			<div data-testid="parent">
				<AutoSkeleton loading={false}>
					<div data-testid="child-a">A</div>
					<div data-testid="child-b">B</div>
				</AutoSkeleton>
			</div>,
		);

		const parent = screen.getByTestId("parent");
		const wrapper = parent.querySelector('[data-loaded-wrapper="true"]');
		expect(wrapper).toBeInTheDocument();
		expect(screen.getByTestId("child-a")).toBeInTheDocument();
		expect(screen.getByTestId("child-b")).toBeInTheDocument();
	});

	it("uses wrapper when child is a Fragment", () => {
		render(
			<div data-testid="parent">
				<AutoSkeleton loading={false}>
					{/* biome-ignore lint/complexity/noUselessFragments: testing that Fragment triggers wrapper fallback */}
					<Fragment>
						<div data-testid="fragment-child">Inside fragment</div>
					</Fragment>
				</AutoSkeleton>
			</div>,
		);

		const parent = screen.getByTestId("parent");
		const wrapper = parent.querySelector('[data-loaded-wrapper="true"]');
		expect(wrapper).toBeInTheDocument();
		expect(screen.getByTestId("fragment-child")).toBeInTheDocument();
	});

	it("uses wrapper when child is a string", () => {
		render(
			<div data-testid="parent">
				<AutoSkeleton loading={false}>{"Just a string"}</AutoSkeleton>
			</div>,
		);

		const parent = screen.getByTestId("parent");
		const wrapper = parent.querySelector('[data-loaded-wrapper="true"]');
		expect(wrapper).toBeInTheDocument();
		expect(wrapper?.textContent).toBe("Just a string");
	});
});

describe("AutoSkeleton (buildDimensionVars edge cases)", () => {
	function GenSkeleton({ style }: { style?: React.CSSProperties }) {
		return (
			<div data-testid="gen" style={style}>
				skeleton
			</div>
		);
	}

	it("filters out NaN values from _textWidths", () => {
		render(
			<LoadedProvider registry={{ card: GenSkeleton }}>
				<AutoSkeleton
					id="card"
					loading={true}
					_textWidths={{ t0: NaN, t1: 100 }}
				>
					<div>content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		const el = screen.getByTestId("gen");
		expect(el.style.getPropertyValue("--sk-w-t0")).toBe("");
		expect(el.style.getPropertyValue("--sk-w-t1")).toBe("100px");
	});

	it("filters out Infinity values from _textHeights", () => {
		render(
			<LoadedProvider registry={{ card: GenSkeleton }}>
				<AutoSkeleton
					id="card"
					loading={true}
					_textHeights={{ t0: Infinity, t1: 24 }}
				>
					<div>content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		const el = screen.getByTestId("gen");
		expect(el.style.getPropertyValue("--sk-h-t0")).toBe("");
		expect(el.style.getPropertyValue("--sk-h-t1")).toBe("24px");
	});

	it("filters out negative values from _textWidths", () => {
		render(
			<LoadedProvider registry={{ card: GenSkeleton }}>
				<AutoSkeleton id="card" loading={true} _textWidths={{ t0: -5, t1: 80 }}>
					<div>content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		const el = screen.getByTestId("gen");
		expect(el.style.getPropertyValue("--sk-w-t0")).toBe("");
		expect(el.style.getPropertyValue("--sk-w-t1")).toBe("80px");
	});
});

describe("AutoSkeleton (default variant)", () => {
	it("passes variant='filled' to generated skeleton when variant is not specified", () => {
		function GenSkeleton({ variant }: { variant?: string }) {
			return <div data-testid="gen" data-variant={variant} />;
		}

		render(
			<LoadedProvider registry={{ card: GenSkeleton }}>
				<AutoSkeleton id="card" loading={true}>
					<div>content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("gen").dataset.variant).toBe("filled");
	});
});

describe("AutoSkeleton (_textWidths / _textHeights)", () => {
	it("passes style with CSS vars when _textWidths is provided", () => {
		function GeneratedSkeleton({ style }: { style?: Record<string, string> }) {
			return (
				<div data-testid="gen" style={style}>
					skeleton
				</div>
			);
		}

		render(
			<LoadedProvider registry={{ card: GeneratedSkeleton }}>
				<AutoSkeleton
					id="card"
					loading={true}
					_textWidths={{ t0: 120, t1: 200 }}
				>
					<div>content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		const el = screen.getByTestId("gen");
		expect(el.style.getPropertyValue("--sk-w-t0")).toBe("120px");
		expect(el.style.getPropertyValue("--sk-w-t1")).toBe("200px");
	});

	it("passes style with CSS vars when _textHeights is provided", () => {
		function GeneratedSkeleton({ style }: { style?: Record<string, string> }) {
			return (
				<div data-testid="gen" style={style}>
					skeleton
				</div>
			);
		}

		render(
			<LoadedProvider registry={{ card: GeneratedSkeleton }}>
				<AutoSkeleton id="card" loading={true} _textHeights={{ t0: 24 }}>
					<div>content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		const el = screen.getByTestId("gen");
		expect(el.style.getPropertyValue("--sk-h-t0")).toBe("24px");
	});
});

describe("AutoSkeleton (dev: off-screen re-capture)", () => {
	it("renders children off-screen alongside generated skeleton when loading in dev", () => {
		function GeneratedSkeleton() {
			return <div data-testid="generated-skeleton">skeleton</div>;
		}

		render(
			<LoadedProvider registry={{ card: GeneratedSkeleton }}>
				<AutoSkeleton id="card" loading={true}>
					<div data-testid="real-child">Real content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("generated-skeleton")).toBeInTheDocument();
		expect(screen.getByTestId("real-child")).toBeInTheDocument();
	});

	it("wraps off-screen children with aria-hidden and hiding styles", () => {
		function GeneratedSkeleton() {
			return <div data-testid="generated-skeleton">skeleton</div>;
		}

		render(
			<LoadedProvider registry={{ card: GeneratedSkeleton }}>
				<AutoSkeleton id="card" loading={true}>
					<div data-testid="off-screen-child">content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		const child = screen.getByTestId("off-screen-child");
		const wrapper = child.parentElement as HTMLElement;
		expect(wrapper).not.toBeNull();
		expect(wrapper.getAttribute("aria-hidden")).toBe("true");
		expect(wrapper.style.position).toBe("fixed");
		expect(wrapper.style.visibility).toBe("hidden");
		expect(wrapper.style.pointerEvents).toBe("none");
	});

	it("does not provide skeleton mode to off-screen children", () => {
		function GeneratedSkeleton() {
			return <div data-testid="generated-skeleton">skeleton</div>;
		}

		function ChildModeProbe() {
			const isSkeletonMode = useIsSkeletonMode();
			return <div data-testid="off-screen-mode">{String(isSkeletonMode)}</div>;
		}

		render(
			<LoadedProvider registry={{ card: GeneratedSkeleton }}>
				<AutoSkeleton id="card" loading={true}>
					<ChildModeProbe />
				</AutoSkeleton>
			</LoadedProvider>,
		);

		expect(screen.getByTestId("off-screen-mode").textContent).toBe("false");
	});

	it("calls captureElement when loading with generated skeleton in dev mode", async () => {
		const { captureElement } = await import("../capture/client");
		vi.mocked(captureElement).mockClear();

		function GeneratedSkeleton() {
			return <div data-testid="generated-skeleton">skeleton</div>;
		}

		render(
			<LoadedProvider registry={{ card: GeneratedSkeleton }}>
				<AutoSkeleton id="card" loading={true}>
					<div data-testid="child">content</div>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		await waitFor(() => {
			expect(captureElement).toHaveBeenCalledWith("card", expect.any(Element));
		});
	});

	it("captures the firstElementChild of the off-screen wrapper, not the wrapper itself", async () => {
		const { captureElement } = await import("../capture/client");
		vi.mocked(captureElement).mockClear();

		function GeneratedSkeleton() {
			return <div data-testid="generated-skeleton">skeleton</div>;
		}

		render(
			<LoadedProvider registry={{ card: GeneratedSkeleton }}>
				<AutoSkeleton id="card" loading={true}>
					<article data-testid="child">content</article>
				</AutoSkeleton>
			</LoadedProvider>,
		);

		await waitFor(() => {
			expect(captureElement).toHaveBeenCalledTimes(1);
			const captured = vi.mocked(captureElement).mock.calls[0][1];
			expect((captured as Element).tagName).toBe("ARTICLE");
		});
	});

	it("copies parent flex layout onto the off-screen wrapper", () => {
		function GeneratedSkeleton() {
			return <div data-testid="skeleton">skeleton</div>;
		}

		render(
			<div style={{ display: "flex", flexDirection: "column", width: "400px" }}>
				<LoadedProvider registry={{ card: GeneratedSkeleton }}>
					<AutoSkeleton id="card" loading={true}>
						<button type="button" data-testid="child">
							Click
						</button>
					</AutoSkeleton>
				</LoadedProvider>
			</div>,
		);

		const child = screen.getByTestId("child");
		const wrapper = child.parentElement as HTMLElement;

		// flexDirection is set by applyParentLayout via getComputedStyle(parent) and is
		// NOT part of OFF_SCREEN_STYLE, so React can never reset it — reliable in jsdom
		expect(wrapper.style.flexDirection).toBe("column");
	});
});

describe("AutoSkeleton (prop/ref forwarding)", () => {
	it("forwards external ref to the child DOM element", () => {
		const externalRef = { current: null };

		render(
			<AutoSkeleton loading={false} ref={externalRef}>
				<div data-testid="child">Hello</div>
			</AutoSkeleton>,
		);

		const child = screen.getByTestId("child");
		expect(externalRef.current).toBe(child);
	});

	it("forwards extra props (onClick, aria-*) to the child", () => {
		const onClick = vi.fn();

		render(
			<AutoSkeleton loading={false} onClick={onClick} aria-expanded="true">
				<button data-testid="btn" type="button">
					Click
				</button>
			</AutoSkeleton>,
		);

		const btn = screen.getByTestId("btn");
		expect(btn.getAttribute("aria-expanded")).toBe("true");
		fireEvent.click(btn);
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it("forwards ref and props through wrapper fallback", async () => {
		const externalRef = { current: null };
		const onClick = vi.fn();

		function NoRefComponent() {
			return <div data-testid="inner">Hello</div>;
		}

		render(
			<div data-testid="parent">
				<AutoSkeleton loading={false} ref={externalRef} onClick={onClick}>
					<NoRefComponent />
				</AutoSkeleton>
			</div>,
		);

		await waitFor(() => {
			const wrapper = screen
				.getByTestId("parent")
				.querySelector('[data-loaded-wrapper="true"]');
			expect(wrapper).toBeInTheDocument();
			expect(externalRef.current).toBe(wrapper);
		});
	});

	it("preserves the child's existing ref when forwarding", () => {
		const childRef = { current: null };
		const externalRef = { current: null };

		render(
			<AutoSkeleton loading={false} ref={externalRef}>
				<div data-testid="child" ref={childRef}>
					Hello
				</div>
			</AutoSkeleton>,
		);

		const child = screen.getByTestId("child");
		expect(externalRef.current).toBe(child);
		expect(childRef.current).toBe(child);
	});

	it("merges className with the child's existing className", () => {
		render(
			<AutoSkeleton loading={false} className="from-parent">
				<div data-testid="child" className="from-child">
					Hello
				</div>
			</AutoSkeleton>,
		);

		const child = screen.getByTestId("child");
		expect(child.className).toContain("from-child");
		expect(child.className).toContain("from-parent");
	});

	it("forwards className to the child when child has no className", () => {
		render(
			<AutoSkeleton loading={false} className="injected">
				<div data-testid="child">Hello</div>
			</AutoSkeleton>,
		);

		const child = screen.getByTestId("child");
		expect(child.className).toBe("injected");
	});
});
