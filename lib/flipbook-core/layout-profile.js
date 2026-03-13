import { cleanText } from "../library/normalization.js";

export const FLIPBOOK_LAYOUT_SLUG = "canonical-v1";
export const FLIPBOOK_GENERATOR_VERSION = "flipbook-v5";

export const DEFAULT_FLIPBOOK_LAYOUT_PROFILE = {
  slug: FLIPBOOK_LAYOUT_SLUG,
  name: "Canonical Flipbook",
  pageWidth: 720,
  pageHeight: 1080,
  gutter: 30,
  paddingTop: 110,
  paddingRight: 58,
  paddingBottom: 128,
  paddingLeft: 58,
  fontFamily: "Georgia, Times New Roman, serif",
  fontSize: 18,
  lineHeight: 1.58,
  paragraphSpacing: 18,
  generatorVersion: FLIPBOOK_GENERATOR_VERSION,
  config: {
    maxPageUnits: 72,
    headingBaseUnits: 12,
    paragraphBaseUnits: 8,
    imageBaseUnits: 22,
    sentenceChunkSize: 420,
  },
};

export function resolveFlipbookLayoutProfile(profile = null) {
  if (!profile) {
    return {
      ...DEFAULT_FLIPBOOK_LAYOUT_PROFILE,
      id: "",
    };
  }

  return {
    id: cleanText(profile.id),
    slug: cleanText(profile.slug) || DEFAULT_FLIPBOOK_LAYOUT_PROFILE.slug,
    name: cleanText(profile.name) || DEFAULT_FLIPBOOK_LAYOUT_PROFILE.name,
    pageWidth: Number(profile.page_width ?? profile.pageWidth) || DEFAULT_FLIPBOOK_LAYOUT_PROFILE.pageWidth,
    pageHeight: Number(profile.page_height ?? profile.pageHeight) || DEFAULT_FLIPBOOK_LAYOUT_PROFILE.pageHeight,
    gutter: Number(profile.gutter) || DEFAULT_FLIPBOOK_LAYOUT_PROFILE.gutter,
    paddingTop: Number(profile.padding_top ?? profile.paddingTop) || DEFAULT_FLIPBOOK_LAYOUT_PROFILE.paddingTop,
    paddingRight: Number(profile.padding_right ?? profile.paddingRight) || DEFAULT_FLIPBOOK_LAYOUT_PROFILE.paddingRight,
    paddingBottom: Number(profile.padding_bottom ?? profile.paddingBottom) || DEFAULT_FLIPBOOK_LAYOUT_PROFILE.paddingBottom,
    paddingLeft: Number(profile.padding_left ?? profile.paddingLeft) || DEFAULT_FLIPBOOK_LAYOUT_PROFILE.paddingLeft,
    fontFamily: cleanText(profile.font_family ?? profile.fontFamily) || DEFAULT_FLIPBOOK_LAYOUT_PROFILE.fontFamily,
    fontSize: Number(profile.font_size ?? profile.fontSize) || DEFAULT_FLIPBOOK_LAYOUT_PROFILE.fontSize,
    lineHeight: Number(profile.line_height ?? profile.lineHeight) || DEFAULT_FLIPBOOK_LAYOUT_PROFILE.lineHeight,
    paragraphSpacing:
      Number(profile.paragraph_spacing ?? profile.paragraphSpacing) || DEFAULT_FLIPBOOK_LAYOUT_PROFILE.paragraphSpacing,
    generatorVersion:
      cleanText(profile.generator_version ?? profile.generatorVersion) || DEFAULT_FLIPBOOK_LAYOUT_PROFILE.generatorVersion,
    config: {
      ...DEFAULT_FLIPBOOK_LAYOUT_PROFILE.config,
      ...(profile.config_json || profile.config || {}),
    },
  };
}
