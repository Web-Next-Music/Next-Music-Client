export async function getUserLogin(event, mainWindow) {
	try {
		const contents = mainWindow?.webContents;
		const allowed = () => {
			if (!mainWindow || mainWindow.isDestroyed() || !contents) return false;
			if (event.sender !== contents || event.senderFrame !== contents.mainFrame)
				return false;
			const url = new URL(event.senderFrame.url);
			return url.origin === "https://music.yandex.ru";
		};
		if (!allowed()) return null;
		const cookies = await contents.session.cookies.get({
			name: "yandex_login",
			domain: ".yandex.ru",
		});
		if (!allowed()) return null;
		const cookie = cookies.find(
			(item) => item.name === "yandex_login" && item.domain === ".yandex.ru",
		);
		return typeof cookie?.value === "string" && cookie.value
			? cookie.value
			: null;
	} catch {
		return null;
	}
}
