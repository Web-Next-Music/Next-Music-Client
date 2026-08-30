import { z } from "zod";

const bool = z.boolean();
const str = z.string();
const numish = z.union([z.number(), z.literal("")]);

const secretSlot = z
	.union([z.string(), z.number(), z.null()])
	.nullable()
	.optional();

const secretGroup = z
	.object({
		accessToken: secretSlot,
		refreshToken: secretSlot,
		expiresAt: secretSlot,
	})
	.loose();

export const ConfigSchema = z
	.object({
		launchSettings: z.object({
			loaderWindow: bool,
			startMinimized: bool,
			splashScreen: bool,
		}),
		windowSettings: z.object({
			titleBar: z.object({
				enable: bool,
				nextText: z.object({
					enable: bool,
					displayYandexMusicVersion: bool,
				}),
			}),
			alwaysOnTop: bool,
			freeWindowResize: bool,
			nextTitle: bool,
			transparentBg: bool,
		}),
		programSettings: z.object({
			richPresence: z.object({
				enable: bool,
				rpcTitle: str,
				largeImageUrl: str,
				buttons: z.object({
					trackButton: bool,
					githubButton: bool,
					listenAlongButton: bool,
				}),
			}),
			addons: z.object({
				enable: bool,
				onlineScripts: z.array(str),
			}),
			obsWidget: z.object({
				enable: bool,
				exposeNetwork: bool,
			}),
			checkUpdates: bool,
			downloader: bool,
			alwaysExpandedPlayer: bool,
			ugcShare: bool,
			fastPlay: bool,
			lrclib: bool,
			disableAutoZoom: bool,
			antiSelect: bool,
			language: str,
		}),
		alpha: z.object({
			volumeNormalization: bool,
			listenAlong: z
				.object({
					enable: bool,
					host: str,
					port: numish,
				})
				.loose(),
		}),
		experiments: z.preprocess(
			(v) => (Array.isArray(v) && v.length === 0 ? {} : v),
			z.record(z.string(), z.string()),
		),
		github: secretGroup,
		discord: secretGroup,
	})
	.loose();

export function validateConfig(config) {
	const result = ConfigSchema.safeParse(config);
	if (!result.success) {
		console.warn(
			"[Config] schema mismatch:",
			result.error.issues
				.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
				.join("; "),
		);
	}
	return config;
}
