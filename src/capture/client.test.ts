import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./serialize", () => ({
	serializeElement: vi.fn(),
}));

import type { CapturedNode } from "../types";
import { captureElement, configureCapture, sendCapture } from "./client";
import { serializeElement } from "./serialize";

const mockTree: CapturedNode = {
	tag: "div",
	className: "card",
	style: {},
	attributes: {},
	children: [],
	nodeType: "layout",
};

let beaconSpy: ReturnType<typeof vi.fn>;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.mocked(serializeElement).mockReturnValue(mockTree);
	beaconSpy = vi.fn().mockReturnValue(true);
	vi.stubGlobal("navigator", { sendBeacon: beaconSpy });
	fetchSpy = vi.fn().mockResolvedValue({ ok: true });
	vi.stubGlobal("fetch", fetchSpy);
	configureCapture({ url: "http://127.0.0.1:7331" });
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("configureCapture", () => {
	it("sets capture URL via url option", () => {
		configureCapture({ url: "http://localhost:9000" });
		sendCapture({ id: "test", tree: mockTree, timestamp: 1 });

		const [url] = beaconSpy.mock.calls[0];
		expect(url).toBe("http://localhost:9000/react-loaded-capture");
	});

	it("sets capture URL via port option", () => {
		configureCapture({ port: 5000 });
		sendCapture({ id: "test", tree: mockTree, timestamp: 1 });

		const [url] = beaconSpy.mock.calls[0];
		expect(url).toBe("http://127.0.0.1:5000/react-loaded-capture");
	});
});

describe("sendCapture", () => {
	it("sends the payload to the capture endpoint via sendBeacon", () => {
		const payload = { id: "my-card", tree: mockTree, timestamp: 123 };
		sendCapture(payload);

		expect(beaconSpy).toHaveBeenCalledTimes(1);
		const [url, body] = beaconSpy.mock.calls[0];
		expect(url).toBe("http://127.0.0.1:7331/react-loaded-capture");
		expect(JSON.parse(body)).toEqual(payload);
	});

	it("does not fall back to fetch when the server is unavailable", () => {
		// A down server still returns true (queued, then fails in the background),
		// so we must NOT trigger the fetch fallback — that would re-introduce the
		// console errors sendBeacon exists to avoid.
		sendCapture({ id: "test", tree: mockTree, timestamp: 1 });

		expect(beaconSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("falls back to fetch when the payload exceeds the beacon size cap", () => {
		// sendBeacon returns false when the payload is too large to queue.
		beaconSpy.mockReturnValue(false);
		const payload = { id: "big", tree: mockTree, timestamp: 1 };

		sendCapture(payload);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy.mock.calls[0];
		expect(url).toBe("http://127.0.0.1:7331/react-loaded-capture");
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body)).toEqual(payload);
	});

	it("does not throw when the fetch fallback rejects", () => {
		beaconSpy.mockReturnValue(false);
		fetchSpy.mockRejectedValue(new Error("network error"));

		expect(() =>
			sendCapture({ id: "test", tree: mockTree, timestamp: 1 }),
		).not.toThrow();
	});
});

describe("captureElement", () => {
	it("serializes element and sends capture", () => {
		const el = document.createElement("div");
		captureElement("my-card", el);

		expect(serializeElement).toHaveBeenCalledWith(el);
		expect(beaconSpy).toHaveBeenCalledTimes(1);

		const [, body] = beaconSpy.mock.calls[0];
		const parsed = JSON.parse(body);
		expect(parsed.id).toBe("my-card");
		expect(parsed.tree).toEqual(mockTree);
	});

	it("does nothing when serializeElement returns null", () => {
		vi.mocked(serializeElement).mockReturnValue(null);
		const el = document.createElement("div");
		captureElement("my-card", el);

		expect(beaconSpy).not.toHaveBeenCalled();
	});
});
