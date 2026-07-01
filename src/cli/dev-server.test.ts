// @vitest-environment node
import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDevServer, type DevServer } from "./dev-server";

vi.mock("./handle-capture", () => ({
	handleCapture: vi.fn().mockReturnValue("generated"),
}));

let server: DevServer;
let baseUrl: string;

async function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.once("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const address = probe.address();
			if (!address || typeof address === "string") {
				probe.close();
				reject(new Error("Failed to resolve free port"));
				return;
			}
			const port = address.port;
			probe.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(port);
			});
		});
	});
}

function makePayload(overrides: Record<string, unknown> = {}) {
	return {
		id: "test-card",
		tree: {
			tag: "div",
			className: "",
			style: {},
			attributes: {},
			children: [],
			nodeType: "layout",
		},
		timestamp: Date.now(),
		...overrides,
	};
}

beforeEach(async () => {
	server = createDevServer({
		port: 0,
		outDir: "/tmp/test-skeletons",
		allowedHosts: ["localhost", "127.0.0.1", "::1"],
	});
	await server.start();
	baseUrl = `http://localhost:${server.port}`;
});

afterEach(async () => {
	await server.stop();
});

describe("createDevServer", () => {
	it("resolves port after start", () => {
		expect(server.port).toBeGreaterThan(0);
	});

	it("starts and stops without error", async () => {
		const server2 = createDevServer({
			port: 0,
			outDir: "/tmp/test",
			allowedHosts: ["localhost", "127.0.0.1", "::1"],
		});
		await server2.start();
		expect(server2.port).toBeGreaterThan(0);
		await server2.stop();
	});

	describe("GET /health", () => {
		it("returns status ok", async () => {
			const res = await fetch(`${baseUrl}/health`);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ status: "ok" });
		});
	});

	describe("POST /react-loaded-capture", () => {
		it("returns result from handleCapture", async () => {
			const payload = makePayload();

			const res = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ result: "generated" });
		});

		it("returns 400 for invalid JSON", async () => {
			const res = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not json",
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.error).toBeDefined();
		});

		it("returns 413 for oversized body", async () => {
			const res = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...makePayload(),
					padding: "x".repeat(1_048_577),
				}),
			});

			expect(res.status).toBe(413);
			const body = await res.json();
			expect(body).toEqual({ error: "Body too large" });
		});

		it("returns 400 when payload is missing id", async () => {
			const res = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tree: makePayload().tree }),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body).toEqual({ error: "Invalid payload: missing id or tree" });
		});

		it("returns 400 when payload is missing tree", async () => {
			const res = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: "test-card" }),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body).toEqual({ error: "Invalid payload: missing id or tree" });
		});

		it("returns 400 for invalid id", async () => {
			const { handleCapture } = await import("./handle-capture");
			vi.mocked(handleCapture).mockClear();

			const res = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(makePayload({ id: "../evil" })),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body).toEqual({
				error: "Invalid id: must match [a-zA-Z][a-zA-Z0-9_-]{0,127}",
			});
			expect(handleCapture).not.toHaveBeenCalled();
		});

		it("returns 400 for malformed tree", async () => {
			const { handleCapture } = await import("./handle-capture");
			vi.mocked(handleCapture).mockClear();

			const res = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					makePayload({
						tree: {
							tag: "div",
							className: "",
							style: {},
							attributes: {},
							children: "bad",
							nodeType: "layout",
						},
					}),
				),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body).toEqual({ error: "Invalid payload: invalid tree" });
			expect(handleCapture).not.toHaveBeenCalled();
		});

		it("returns 400 for path traversal reported by handleCapture", async () => {
			const { handleCapture } = await import("./handle-capture");
			vi.mocked(handleCapture).mockImplementationOnce(() => {
				throw new Error('Path traversal detected: "../evil" escapes outDir');
			});

			const res = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(makePayload()),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.error).toBeDefined();
		});

		it("returns 403 when Host is not allowlisted", async () => {
			const lockedServer = createDevServer({
				port: 0,
				outDir: "/tmp/test-skeletons",
				allowedHosts: ["example.test"],
			});
			await lockedServer.start();
			const lockedBaseUrl = `http://localhost:${lockedServer.port}`;

			try {
				const res = await fetch(`${lockedBaseUrl}/react-loaded-capture`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(makePayload()),
				});

				expect(res.status).toBe(403);
				const body = await res.json();
				expect(body).toEqual({ error: "Forbidden host" });
			} finally {
				await lockedServer.stop();
			}
		});
	});

	describe("404", () => {
		it("returns 404 for unknown routes", async () => {
			const res = await fetch(`${baseUrl}/unknown`);
			expect(res.status).toBe(404);
		});
	});

	describe("405", () => {
		it("returns 405 for invalid method on /react-loaded-capture", async () => {
			const res = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "GET",
			});

			expect(res.status).toBe(405);
			const body = await res.json();
			expect(body).toEqual({ error: "Method not allowed" });
		});
	});

	describe("CORS", () => {
		it("returns allow-origin for allowlisted origins only", async () => {
			const allowed = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Origin: "http://localhost:3000",
				},
				body: JSON.stringify(makePayload()),
			});

			expect(allowed.headers.get("access-control-allow-origin")).toBe(
				"http://localhost:3000",
			);
			expect(allowed.headers.get("vary")).toBe("Origin");
		});

		it("does not return allow-origin for disallowed origins", async () => {
			const denied = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Origin: "http://evil.example",
				},
				body: JSON.stringify(makePayload()),
			});

			expect(denied.headers.get("access-control-allow-origin")).toBeNull();
			expect(denied.headers.get("vary")).toBeNull();
		});

		it("handles OPTIONS preflight", async () => {
			const res = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "OPTIONS",
				headers: {
					Origin: "http://localhost:3000",
				},
			});
			expect(res.status).toBe(204);
			expect(res.headers.get("access-control-allow-origin")).toBe(
				"http://localhost:3000",
			);
			expect(res.headers.get("access-control-allow-methods")).toBeTruthy();
			expect(res.headers.get("access-control-allow-headers")).toBeTruthy();
		});
	});

	describe("isCapturedNode deep validation", () => {
		it("returns 400 when a deeply nested child has an invalid className", async () => {
			const { handleCapture } = await import("./handle-capture");
			vi.mocked(handleCapture).mockClear();

			const res = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					makePayload({
						tree: {
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
									children: [
										{
											tag: "em",
											className: 42, // invalid: should be string
											style: {},
											attributes: {},
											nodeType: "text",
											children: [],
										},
									],
								},
							],
						},
					}),
				),
			});

			expect(res.status).toBe(400);
			expect(handleCapture).not.toHaveBeenCalled();
		});

		it("returns 400 when textContent is a number", async () => {
			const res = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					makePayload({
						tree: {
							tag: "span",
							className: "",
							style: {},
							attributes: {},
							nodeType: "text",
							children: [],
							textContent: 42,
						},
					}),
				),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body).toEqual({ error: "Invalid payload: invalid tree" });
		});

		it("returns 400 when textAlign is an invalid value", async () => {
			const res = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					makePayload({
						tree: {
							tag: "span",
							className: "",
							style: {},
							attributes: {},
							nodeType: "text",
							children: [],
							textAlign: "justify",
						},
					}),
				),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body).toEqual({ error: "Invalid payload: invalid tree" });
		});

		it("returns 400 when rect has negative dimensions", async () => {
			const res = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					makePayload({
						tree: {
							tag: "div",
							className: "",
							style: {},
							attributes: {},
							nodeType: "layout",
							children: [],
							rect: { width: -1, height: 10 },
						},
					}),
				),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body).toEqual({ error: "Invalid payload: invalid tree" });
		});
	});

	describe("non-object JSON payloads", () => {
		it("returns 400 when payload is a JSON array", async () => {
			const res = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify([1, 2, 3]),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body).toEqual({ error: "Invalid payload: expected object" });
		});

		it("returns 400 when payload is a JSON string", async () => {
			const res = await fetch(`${baseUrl}/react-loaded-capture`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify("just a string"),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body).toEqual({ error: "Invalid payload: expected object" });
		});
	});

	describe("POST /health", () => {
		it("returns 405 for POST on /health", async () => {
			const res = await fetch(`${baseUrl}/health`, { method: "POST" });
			expect(res.status).toBe(405);
			const body = await res.json();
			expect(body).toEqual({ error: "Method not allowed" });
		});
	});

	describe("stop()", () => {
		it("resolves without error when server was never started", async () => {
			const unstartedServer = createDevServer({
				port: 0,
				outDir: "/tmp/test-unstarted",
				allowedHosts: ["localhost"],
			});
			await expect(unstartedServer.stop()).resolves.toBeUndefined();
		});
	});

	describe("start()", () => {
		it("rejects with a clear message when port is already in use", async () => {
			const port = await getFreePort();
			const firstServer = createDevServer({
				port,
				outDir: "/tmp/test-skeletons",
				allowedHosts: ["localhost", "127.0.0.1", "::1"],
			});
			await firstServer.start();

			try {
				await expect(
					createDevServer({
						port,
						outDir: "/tmp/test-skeletons-2",
						allowedHosts: ["localhost", "127.0.0.1", "::1"],
					}).start(),
				).rejects.toThrow(
					`Port ${port} is already in use. Stop the other process or use a different port in your config.`,
				);
			} finally {
				await firstServer.stop();
			}
		});
	});
});
