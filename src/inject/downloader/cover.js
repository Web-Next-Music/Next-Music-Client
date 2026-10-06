// Cover
function normalizeCoverUrl(url) {
	if (!url) return null;
	return url
		.replace(/%%$/, `${COVER_SIZE}x${COVER_SIZE}`)
		.replace(/\d+x\d+$/, `${COVER_SIZE}x${COVER_SIZE}`);
}

async function fetchAndResizeCover(coverUrl) {
	const url = normalizeCoverUrl(coverUrl);
	if (!url) return null;

	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = "anonymous";

		img.onload = () => {
			try {
				const canvas = document.createElement("canvas");
				canvas.width = canvas.height = COVER_SIZE;
				canvas.getContext("2d").drawImage(img, 0, 0, COVER_SIZE, COVER_SIZE);
				canvas.toBlob(
					(blob) => {
						if (!blob) {
							resolve(null);
							return;
						}
						const reader = new FileReader();
						reader.onloadend = () => {
							const bin = atob(reader.result.split(",")[1]);
							const data = new Uint8Array(bin.length);
							for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
							resolve({ data, mime: "image/jpeg" });
						};
						reader.onerror = () => resolve(null);
						reader.readAsDataURL(blob);
					},
					"image/jpeg",
					0.92,
				);
			} catch {
				resolve(null);
			}
		};

		img.onerror = () => resolve(null);
		img.src = url;
	});
}
