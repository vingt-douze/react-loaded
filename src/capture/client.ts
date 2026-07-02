import type { CapturePayload } from "../types";
import { serializeElement } from "./serialize";

let captureUrl = "http://127.0.0.1:7331";

export interface CaptureConfig {
	url?: string;
	port?: number;
}

export function configureCapture(options: CaptureConfig): void {
	if (options.url) {
		captureUrl = options.url;
	} else if (options.port) {
		captureUrl = `http://127.0.0.1:${options.port}`;
	}
}

export function sendCapture(payload: CapturePayload): void {
	const url = `${captureUrl}/react-loaded-capture`;
	const body = JSON.stringify(payload);

	// Fire-and-forget: sendBeacon fails silently when the capture server isn't
	// running, so we never pollute the browser console with failed requests.
	// The endpoint is branded so it's identifiable in the Network tab (sendBeacon
	// can't set custom headers, so the URL is the only place to surface the source).
	//
	// sendBeacon returns false only when the payload exceeds the browser's beacon
	// size cap (~64KB) — not when the server is down (that stays true and fails in
	// the background). So we fall back to fetch to avoid silently dropping large
	// captures. No keepalive: it shares the same 64KB cap we're trying to escape.
	if (!navigator.sendBeacon(url, body)) {
		fetch(url, { method: "POST", body }).catch(() => {
			// Server not running — silently ignore.
		});
	}
}

export function captureElement(id: string, element: Element): void {
	if (!(element instanceof Element)) return;

	const tree = serializeElement(element);
	if (!tree) return;

	sendCapture({ id, tree, timestamp: Date.now() });
}
