// Detect audio format from magic bytes
function detectIsMp3(buf) {
	if (
		buf.length >= 8 &&
		buf[4] === 0x66 &&
		buf[5] === 0x74 &&
		buf[6] === 0x79 &&
		buf[7] === 0x70
	)
		return false;
	return true; // ID3, raw MPEG frame, or unknown → treat as MP3
}
