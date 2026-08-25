(function () {
	"use strict";

	const POLL_INTERVAL = 1000; // ms
	const ENCRYPTION_KEY = window.__NEXT_MUSIC_ENCRYPTION_KEY__ || "";

	function encodeTrackKey(data) {
		return window.nextmusicApi.encodeTrackKey(data, ENCRYPTION_KEY);
	}

	const cooldownTimers = new Map();
	const cooldownDuration = 2000;

	let lastSentData = null;
	let lastPosition = null;

	function getPlayerData() {
		const api = window.nextmusicApi;
		if (!api) return null;

		const track = api.getCurrentTrack();
		const state = api.getState();
		if (!track || !state) return null;

		const artistsStr = track.artistNames?.join(", ") ?? "";

		const artistUrl = track.artistIds?.[0]
			? `https://music.yandex.ru/artist/${track.artistIds[0]}`
			: null;

		const mp3Url = api.getCurrentMp3Url() ?? null;
		const nmUGCPlayerUrl = mp3Url
			? `https://nm.diram1x.ru/track?key=${encodeTrackKey({
					url: mp3Url,
					title: track.title,
					artist: artistsStr,
					cover: track.coverUrl,
				})}`
			: null;

		return {
			trackId: track.id ?? null,
			title: track.title ?? null,
			artists: artistsStr,
			img: track.coverUrl ?? null,
			artistUrl,
			mp3Url,
			positionSec: state.progress?.position ?? 0,
			durationSec: (track.durationMs ?? 0) / 1000,
			playerState: state.status ?? null,
			nmUGCPlayerUrl: nmUGCPlayerUrl ?? null,
		};
	}

	function isSeekJump(positionSec) {
		const last = lastPosition;
		const expected = last != null ? last + POLL_INTERVAL / 1000 : null;
		lastPosition = positionSec;
		if (expected == null) return false;
		return Math.abs(positionSec - expected) > 2;
	}

	function isStateChanged(data) {
		if (!lastSentData) return true;
		return (
			data.trackId !== lastSentData.trackId ||
			data.title !== lastSentData.title ||
			data.artists !== lastSentData.artists ||
			data.playerState !== lastSentData.playerState ||
			data.img !== lastSentData.img
		);
	}

	function scheduleSend(data) {
		const index = 0;

		if (cooldownTimers.has(index)) clearTimeout(cooldownTimers.get(index));

		const timer = setTimeout(() => {
			cooldownTimers.delete(index);
			window.nmcRPC.send({ playerIndex: index, ...data });
		}, cooldownDuration);

		cooldownTimers.set(index, timer);
	}

	function sendImmediate(data) {
		const index = 0;
		window.nmcRPC.send({ playerIndex: index, ...data });
	}

	function poll() {
		const data = getPlayerData();
		if (!data) return;

		const seeked = isSeekJump(data.positionSec);
		const changed = isStateChanged(data);

		if (!changed && !seeked) return;

		if (seeked && !changed && window.__liSyncSeeking) {
			return;
		}

		if (changed) {
			lastSentData = { ...data };
			scheduleSend(data);
		} else if (seeked) {
			sendImmediate(data);
		}
	}

	function waitForApi() {
		if (window.nextmusicApi && window.nmcRPC) {
			setInterval(poll, POLL_INTERVAL);
		} else {
			setTimeout(waitForApi, 500);
		}
	}

	waitForApi();
})();
