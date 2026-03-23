import type { Ref, RefCallback, RefObject } from "react";

export function mergeRefs<T>(
	...refs: Array<Ref<T> | undefined | null>
): RefCallback<T> {
	return (value: T | null) => {
		for (const ref of refs) {
			if (typeof ref === "function") {
				ref(value);
			} else if (ref != null) {
				(ref as RefObject<T | null>).current = value;
			}
		}
	};
}
