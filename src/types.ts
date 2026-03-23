import type { ComponentType, CSSProperties } from "react";

export interface CapturedNode {
	tag: string;
	className: string;
	style: Record<string, string>;
	attributes: Record<string, string>;
	children: CapturedNode[];
	textContent?: string;
	textAlign?: "left" | "center" | "right";
	rect?: { width: number; height: number };
	nodeType: "layout" | "text" | "media" | "svg" | "interactive";
}

export interface CapturePayload {
	id: string;
	tree: CapturedNode;
	timestamp: number;
}

export type SkeletonProps = {
	variant?: "filled" | "ghost";
	className?: string;
	style?: CSSProperties;
	dataSkId?: string;
};
export type SkeletonRegistry = Record<string, ComponentType<SkeletonProps>>;
