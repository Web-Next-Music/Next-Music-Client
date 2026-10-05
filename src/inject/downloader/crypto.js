// AES-128-CTR decryption via Web Crypto API
function hexToBytes(hex) {
	return new Uint8Array(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));
}

async function decryptAesCtr(data, keyHex) {
	const keyBytes = hexToBytes(keyHex);
	const key = await crypto.subtle.importKey(
		"raw",
		keyBytes,
		{ name: "AES-CTR" },
		false,
		["decrypt"],
	);
	const decrypted = await crypto.subtle.decrypt(
		{ name: "AES-CTR", counter: new Uint8Array(16), length: 128 },
		key,
		data,
	);
	return new Uint8Array(decrypted);
}
