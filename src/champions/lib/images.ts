/**
 * All Champions artwork is served from stable public URLs — never from
 * Lovable's *.asset.json pointers, which resolve to /__l5e/assets-v1/...
 * paths that only exist inside Lovable's own preview infrastructure and
 * 404 on any real deployment. That was why every pass card and rarity
 * icon rendered as a broken image after the port.
 *
 * Two sources, both CDN-backed:
 *   GH_BASE  — the boardpass folder in the assets repo (icons, hero art).
 *   LOCAL    — files committed to this app's own /public folder, served
 *              from the same edge as the site itself (pass cards).
 */
const GH_BASE =
  "https://raw.githubusercontent.com/0xDarkSeidBull/nft/main/files/boardpass";

/** Pass cards live in this repo's /public so they can never 404 on a third party. */
const LOCAL_PASS = "/champions/pass-cards";

export const HERO_EPIC_IMAGE = `${GH_BASE}/LITDEXEPIC%20HOME.png`;
export const HERO_LEGEND_IMAGE = `${GH_BASE}/LITDEXLEGENDHOME.png`;

export const COMMON_PFP = `${GH_BASE}/cpfp.png`;
export const RARE_PFP = `${GH_BASE}/rpfp.png`;
export const EPIC_PFP = `${GH_BASE}/epfp.png`;
export const LEGEND_PFP = `${GH_BASE}/lpfp.png`;

/** Voucher / rarity tier icons shown on the mint card. */
export const LITSHARD_ICON = `${GH_BASE}/LitShard.png`;
export const LITCORE_ICON = `${GH_BASE}/LitCore.png`;
export const LITGOD_ICON = `${GH_BASE}/LitGod.png`;

export const RARITY_ICONS: Record<string, string> = {
  COMMON: LITSHARD_ICON,
  RARE: LITCORE_ICON,
  EPIC: LITGOD_ICON,
};

export const PASS_CARD_IMAGES = [
  { src: `${LOCAL_PASS}/common.webp`, label: "Common" },
  { src: `${LOCAL_PASS}/rare.webp`, label: "Rare" },
  { src: `${LOCAL_PASS}/epic.webp`, label: "Epic" },
  { src: `${LOCAL_PASS}/legend.webp`, label: "Legend" },
];
