export function serializeInvocation(fn, ...args) {
	return `(${fn.toString()})(${args.map((arg) => JSON.stringify(arg)).join(",")});`;
}
