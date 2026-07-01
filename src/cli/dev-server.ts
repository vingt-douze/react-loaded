import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import type { CapturedNode, CapturePayload } from "../types";
import { isValidId } from "../utils/validate-id";
import { handleCapture } from "./handle-capture";

export interface DevServerOptions {
	port: number;
	outDir: string;
	allowedHosts?: string[];
}

export interface DevServer {
	start(): Promise<void>;
	stop(): Promise<void>;
	readonly port: number;
}

const MAX_BODY_BYTES = 1_048_576;
const CAPTURE_NODE_TYPES = new Set([
	"layout",
	"text",
	"media",
	"svg",
	"interactive",
]);
const TEXT_ALIGN_VALUES = new Set(["left", "center", "right"]);

class BodyTooLargeError extends Error {
	constructor() {
		super("Body too large");
	}
}

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		let settled = false;
		req.on("data", (chunk: Buffer) => {
			if (settled) return;
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				settled = true;
				req.pause();
				reject(new BodyTooLargeError());
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			if (settled) return;
			settled = true;
			resolve(Buffer.concat(chunks).toString());
		});
		req.on("error", (error) => {
			if (settled) return;
			settled = true;
			reject(error);
		});
	});
}

function normalizeHost(hostHeader: string | undefined): string | null {
	if (!hostHeader) return null;
	const value = hostHeader.trim().toLowerCase();
	if (!value) return null;

	if (value.startsWith("[")) {
		const closeIndex = value.indexOf("]");
		if (closeIndex === -1) return null;
		const host = value.slice(1, closeIndex);
		return host.length > 0 ? host : null;
	}

	const firstColon = value.indexOf(":");
	const lastColon = value.lastIndexOf(":");
	if (firstColon !== -1 && firstColon === lastColon) {
		const host = value.slice(0, firstColon);
		return host.length > 0 ? host : null;
	}

	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value != null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
	if (!isRecord(value)) return false;
	return Object.values(value).every((entry) => typeof entry === "string");
}

function isRect(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return (
		typeof value.width === "number" &&
		Number.isFinite(value.width) &&
		value.width >= 0 &&
		typeof value.height === "number" &&
		Number.isFinite(value.height) &&
		value.height >= 0
	);
}

function isCapturedNode(value: unknown): value is CapturedNode {
	if (!isRecord(value)) return false;
	if (typeof value.tag !== "string") return false;
	if (typeof value.className !== "string") return false;
	if (!isStringRecord(value.style)) return false;
	if (!isStringRecord(value.attributes)) return false;
	if (!Array.isArray(value.children)) return false;
	if (
		typeof value.nodeType !== "string" ||
		!CAPTURE_NODE_TYPES.has(value.nodeType)
	) {
		return false;
	}
	if (
		value.textContent !== undefined &&
		typeof value.textContent !== "string"
	) {
		return false;
	}
	if (
		value.textAlign !== undefined &&
		(typeof value.textAlign !== "string" ||
			!TEXT_ALIGN_VALUES.has(value.textAlign))
	) {
		return false;
	}
	if (value.rect !== undefined && !isRect(value.rect)) {
		return false;
	}

	return value.children.every((child) => isCapturedNode(child));
}

function normalizeAllowedHosts(hosts: string[]): Set<string> {
	return new Set(
		hosts
			.map((host) => normalizeHost(host))
			.filter((host): host is string => host != null),
	);
}

function isAllowedOrigin(
	origin: string | undefined,
	allowedHosts: Set<string>,
): boolean {
	if (!origin) return false;
	try {
		const url = new URL(origin);
		const normalized = normalizeHost(url.hostname);
		if (!normalized) return false;
		return allowedHosts.has(normalized);
	} catch {
		return false;
	}
}

function sendJson(
	res: ServerResponse<IncomingMessage>,
	status: number,
	data: Record<string, unknown>,
): void {
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(JSON.stringify(data));
}

export function createDevServer(options: DevServerOptions): DevServer {
	const { outDir } = options;
	const rawAllowedHosts = options.allowedHosts ?? [
		"localhost",
		"127.0.0.1",
		"::1",
	];
	const allowedHosts = normalizeAllowedHosts(rawAllowedHosts);
	let resolvedPort = 0;
	let server: Server | null = null;

	const httpServer = createServer(async (req, res) => {
		const requestHost = normalizeHost(req.headers.host);
		if (!requestHost || !allowedHosts.has(requestHost)) {
			sendJson(res, 403, { error: "Forbidden host" });
			return;
		}

		if (isAllowedOrigin(req.headers.origin, allowedHosts)) {
			res.setHeader(
				"Access-Control-Allow-Origin",
				req.headers.origin as string,
			);
			res.setHeader("Vary", "Origin");
		}
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");

		const url = new URL(req.url ?? "/", `http://localhost:${resolvedPort}`);

		if (url.pathname === "/health") {
			if (req.method === "GET") {
				sendJson(res, 200, { status: "ok" });
				return;
			}
			sendJson(res, 405, { error: "Method not allowed" });
			return;
		}

		if (url.pathname === "/react-loaded-capture") {
			if (req.method === "OPTIONS") {
				res.writeHead(204);
				res.end();
				return;
			}

			if (req.method !== "POST") {
				sendJson(res, 405, { error: "Method not allowed" });
				return;
			}

			try {
				const body = await readBody(req);
				const payload = JSON.parse(body) as unknown;
				if (!isRecord(payload)) {
					sendJson(res, 400, { error: "Invalid payload: expected object" });
					return;
				}
				if (typeof payload.id !== "string" || payload.tree == null) {
					sendJson(res, 400, { error: "Invalid payload: missing id or tree" });
					return;
				}
				if (!isValidId(payload.id)) {
					sendJson(res, 400, {
						error: "Invalid id: must match [a-zA-Z][a-zA-Z0-9_-]{0,127}",
					});
					return;
				}
				if (!isCapturedNode(payload.tree)) {
					sendJson(res, 400, { error: "Invalid payload: invalid tree" });
					return;
				}
				const captureUrl = `http://localhost:${resolvedPort}`;
				const result = handleCapture(
					payload as unknown as CapturePayload,
					outDir,
					captureUrl,
				);
				sendJson(res, 200, { result });
			} catch (err) {
				if (err instanceof BodyTooLargeError) {
					sendJson(res, 413, { error: err.message });
					return;
				}
				if (err instanceof SyntaxError) {
					sendJson(res, 400, { error: "Invalid JSON" });
					return;
				}
				sendJson(res, 400, {
					error: err instanceof Error ? err.message : "Unknown error",
				});
			}
			return;
		}

		sendJson(res, 404, { error: "Not found" });
	});

	return {
		get port() {
			return resolvedPort;
		},

		start() {
			return new Promise<void>((resolve, reject) => {
				server = httpServer;
				const onError = (error: NodeJS.ErrnoException) => {
					if (error.code === "EADDRINUSE") {
						reject(
							new Error(
								`Port ${options.port} is already in use. Stop the other process or use a different port in your config.`,
							),
						);
						return;
					}
					reject(error);
				};

				httpServer.once("error", onError);
				httpServer.listen(options.port, () => {
					httpServer.off("error", onError);
					const addr = httpServer.address();
					if (addr && typeof addr === "object") {
						resolvedPort = addr.port;
					}
					resolve();
				});
			});
		},

		stop() {
			return new Promise<void>((resolve, reject) => {
				if (!server) {
					resolve();
					return;
				}
				server.close((err) => {
					if (err) reject(err);
					else resolve();
				});
			});
		},
	};
}
