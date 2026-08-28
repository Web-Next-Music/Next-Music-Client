type NextmusicUnsubscribe = () => void;

type NextmusicContainerId =
	| "INFO"
	| "ERROR"
	| "IMPORTANT"
	| "FULLSCREEN_INFO"
	| "FULLSCREEN_ERROR"
	| "AD_INFO";

interface NextmusicSettingValue<T = unknown> {
	value: T;
	default: T;
}

interface NextmusicSettings {
	getCurrent(): Record<string, NextmusicSettingValue>;
	onChange(
		callback: (settings: Record<string, NextmusicSettingValue>) => void,
	): NextmusicUnsubscribe;
}

interface NextmusicArtist {
	id: string | number;
	name: string;
}

interface NextmusicTrack {
	id: string | number;
	realId: string | number;
	title: string;
	version: string | null;
	artists: NextmusicArtist[];
	artistIds: Array<string | number>;
	artistNames: string[];
	albumId: string | number | null;
	albumTitle: string | null;
	year: number | null;
	coverUrl: string | null;
	trackUrl: string;
	durationMs: number | null;
	contentWarning: string | null;
}

interface NextmusicPlayerState {
	playerId: string;
	status?: string;
	progress?: number;
	volume?: number;
}

interface NextmusicActivePlayerState extends NextmusicPlayerState {
	shuffle?: boolean;
	repeat?: string;
}

interface NextmusicPlayerHandle {
	id: string;
	exists(): boolean;
	getState(): NextmusicPlayerState | null;
	setProgress(progress: number): void;
	setVolume(volume: number): void;
	setSpeed(speed: number): void;
	play(): void;
	pause(): void;
	resume(): void;
	togglePause(): void;
	next(): void;
	prev(): void;
}

interface NextmusicSiteComponents {
	React?: any;
	ReactDOMClient?: any;
	ReactDOMPortal?: any;
	JsxRuntime?: any;
	TabCarousel?: any;
	Tab?: any;
	TabWithTitle?: any;
	Button?: any;
	Link?: any;
	Text?: any;
	Icon?: any;
	SearchInput?: any;
	Input?: any;
	[name: string]: any;
}

interface NextmusicSiteComponentsResult {
	components: NextmusicSiteComponents;
	missing: string[];
}

interface NextmusicSiteContextEntry {
	context: any;
	value: unknown;
}

interface NextmusicRenderHandle {
	root: any;
	host: Element;
	render(element: any): void;
	unmount(): void;
	[key: string]: any;
}

interface NextmusicSocketHandle {
	close(): void;
	send(data: string): void;
	[key: string]: any;
}

interface NextmusicApi {
	ContainerId: Record<NextmusicContainerId, NextmusicContainerId>;

	getSettings(addonName: string): NextmusicSettings;

	mountUgcShareButton(icon: unknown, onClick: () => void): void;
	unmountUgcShareButton(): void;

	mountDownloadButton(renderState: unknown, onClick: () => void): void;
	unmountDownloadButton(): void;
	updateDownloadButtonState(renderState: unknown): void;

	mountListenAlongPanel(state: unknown, handlers: unknown): void;
	unmountListenAlongPanel(): void;
	updateListenAlongPanel(state: unknown): void;

	waitForApi(
		callback: () => void,
		options?: { timeout?: number },
	): NextmusicUnsubscribe;
	wsReconnect(
		url: string,
		options?: {
			onOpen?: (event: Event, socket: WebSocket) => void;
			onMessage?: (event: MessageEvent, socket: WebSocket) => void;
			onClose?: (event: CloseEvent, socket: WebSocket) => void;
			onError?: (event: Event, socket: WebSocket) => void;
			reconnectDelay?: number;
		},
	): NextmusicSocketHandle;

	injectStyleTag(id: string, css: string): HTMLStyleElement;
	removeStyleTag(id: string): void;
	encodeTrackKey(data: unknown, encryptionKey: string): string;
	decodeTrackKey(encodedKey: string, encryptionKey: string): unknown;

	getSiteComponents(options?: {
		refresh?: boolean;
	}): NextmusicSiteComponentsResult;
	getSiteContexts(options?: { cache?: boolean }): NextmusicSiteContextEntry[];
	wrapWithSiteContexts(
		element: any,
		contexts?: NextmusicSiteContextEntry[],
	): any;
	getComponentFromElement(
		selector: string | Element | null,
		predicate: (component: any) => boolean,
		options?: { maxDepth?: number },
	): any;
	renderInSiteContext(
		element: any,
		host: Element,
		options?: Record<string, unknown>,
	): NextmusicRenderHandle | null;

	showToast(
		message: string,
		containerId?: NextmusicContainerId,
		extra?: Record<string, unknown>,
		cover?: string,
	): string | null;
	showCopyToast(
		entityTitle: string,
		entityVariant?: string,
		containerId?: NextmusicContainerId,
		extra?: Record<string, unknown>,
	): string | null;
	showErrorToast(
		errorText: string,
		containerId?: NextmusicContainerId,
		extra?: Record<string, unknown>,
	): string | null;
	dismissToast(notificationId: string): void;

	getCurrentYandexMusicVersion(): string | null;
	getCurrentMp3Url(): string | null;
	getCurrentTrackKey(): string;
	getCurrentTrackCodec(): string;

	downloadAsset(
		url: string,
		fileName: string,
		addonName: string,
	): Promise<unknown>;

	nextText(text: string): void;

	playTrackById(trackId: string | number): void;
	playCustomTrack(trackData: unknown): void;
	playUgcTrack(payload: unknown): void;
	getCurrentTrack(): NextmusicTrack | null;
	getState(): NextmusicActivePlayerState | null;
	getCurrentAverageColor(): string | null;

	getQueueSnapshot(): unknown;
	applyIncomingQueue(entries: unknown[], currentIndex: number): void;
	onQueueChange(listener: (queue: unknown) => void): NextmusicUnsubscribe;

	getPlayers(): unknown[];
	getActivePlayerId(): string | null;
	pauseAll(): void;
	player(id: string): NextmusicPlayerHandle;

	onStatusChange(
		listener: (status: string | undefined) => void,
	): NextmusicUnsubscribe;
	onProgressChange(
		listener: (progress: number | undefined) => void,
	): NextmusicUnsubscribe;
	onTrackChange(
		listener: (track: NextmusicTrack | null) => void,
	): NextmusicUnsubscribe;
	onActivePlayerChange(
		listener: (playerId: string | null) => void,
	): NextmusicUnsubscribe;

	getAudioTime(): number | null;
	onAudioEvent(
		listener: (event: Event, audio: HTMLAudioElement) => void,
	): NextmusicUnsubscribe;

	setSpeed(speed: number): void;
	setProgress(progress: number): void;
	setVolume(volume: number): void;
	play(): void;
	pause(): void;
	resume(): void;
	togglePause(): void;
	next(): void;
	prev(): void;
}

interface Window {
	nextmusicApi: NextmusicApi;
	__nextmusicApiAssetPort?: number;
}

declare const nextmusicApi: NextmusicApi;

declare const React: any;
declare const ReactDOMClient: any;

declare namespace JSX {
	interface Element {
		type: any;
		props: any;
		key: any;
	}

	interface ElementClass {
		render?: any;
	}

	interface ElementAttributesProperty {
		props: any;
	}

	interface ElementChildrenAttribute {
		children: any;
	}

	interface IntrinsicAttributes {
		key?: string | number | null;
	}

	interface IntrinsicClassAttributes<T> {
		ref?: any;
	}

	interface IntrinsicElements {
		[name: string]: any;
	}
}
