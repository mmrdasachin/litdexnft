import passCommon from "@/champions/assets/common.webp.asset.json";
import passRare from "@/champions/assets/rare.webp.asset.json";
import passEpic from "@/champions/assets/epic.webp.asset.json";
import passLegend from "@/champions/assets/legend.webp.asset.json";

const GH_BASE =
  "https://raw.githubusercontent.com/0xDarkSeidBull/nft/main/files/boardpass";

/**
 * These *.asset.json files are Lovable's asset pointers — importing them
 * gives back { url: "/__l5e/assets-v1/...", ... }, a path relative to
 * whatever domain serves it. On litdex's own domain that path 404s, so we
 * resolve it against nft.test-hub.xyz (where these assets actually live)
 * instead of the app's own origin.
 */
const LOVABLE_ASSET_ORIGIN = "https://nft.test-hub.xyz";
const lovableAssetUrl = (asset: { url: string }) => `${LOVABLE_ASSET_ORIGIN}${asset.url}`;

export const HERO_EPIC_IMAGE = `${GH_BASE}/LITDEXEPIC%20HOME.png`;
export const HERO_LEGEND_IMAGE = `${GH_BASE}/LITDEXLEGENDHOME.png`;

export const COMMON_PFP = `${GH_BASE}/cpfp.png`;
export const RARE_PFP = `${GH_BASE}/rpfp.png`;
export const EPIC_PFP = `${GH_BASE}/epfp.png`;
export const LEGEND_PFP = `${GH_BASE}/lpfp.png`;

export const PASS_CARD_IMAGES = [
  { src: lovableAssetUrl(passCommon), label: "Common" },
  { src: lovableAssetUrl(passRare), label: "Rare" },
  { src: lovableAssetUrl(passEpic), label: "Epic" },
  { src: lovableAssetUrl(passLegend), label: "Legend" },
];

export const RARITY_ICON_URL = lovableAssetUrl;
