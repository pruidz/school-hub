/**
 * `apple-touch-startup-image` links for the Home Screen app.
 *
 * iOS matches a launch image by exact device metrics, so every iPhone family
 * needs its own file; anything unmatched falls back to the manifest's
 * `background_color`, which is white — a hard flash when the child opens the
 * app at night. Each size therefore ships twice, and the dark variant is
 * selected with `prefers-color-scheme`.
 *
 * The images themselves come from `scripts/generate-icons.mjs`. Keep this
 * table and `SPLASH_SIZES` in that script in step.
 */

type Device = {
  /** Logical CSS pixels, portrait. */
  width: number;
  height: number;
  ratio: number;
};

const DEVICES: Device[] = [
  { width: 375, height: 667, ratio: 2 }, // SE 2/3, 8
  { width: 414, height: 896, ratio: 2 }, // XR, 11
  { width: 375, height: 812, ratio: 3 }, // X, XS, 11 Pro
  { width: 390, height: 844, ratio: 3 }, // 12, 12 Pro, 13, 13 Pro, 14
  { width: 393, height: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16
  { width: 402, height: 874, ratio: 3 }, // 16 Pro
  { width: 414, height: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { width: 428, height: 926, ratio: 3 }, // 12 Pro Max, 13 Pro Max, 14 Plus
  { width: 430, height: 932, ratio: 3 }, // 14 Pro Max, 15 Pro Max, 16 Plus
  { width: 440, height: 956, ratio: 3 }, // 16 Pro Max
];

export type AppleLaunchScreen = { url: string; media: string };

/** Dark first: iOS takes the last matching link, so light must win by default. */
export const appleLaunchScreens: AppleLaunchScreen[] = DEVICES.flatMap(
  ({ width, height, ratio }) => {
    const pixels = `${width * ratio}x${height * ratio}`;
    const device =
      `(device-width: ${width}px) and (device-height: ${height}px) ` +
      `and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`;

    return [
      {
        url: `/icons/splash/dark-${pixels}.png`,
        media: `${device} and (prefers-color-scheme: dark)`,
      },
      {
        url: `/icons/splash/light-${pixels}.png`,
        media: `${device} and (prefers-color-scheme: light)`,
      },
    ];
  },
);
