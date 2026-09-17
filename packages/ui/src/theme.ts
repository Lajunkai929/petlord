import { theme, type ThemeConfig } from "antd";
import tokens from "./tokens.json";

export type PetLordTheme = "light" | "dark";
export type PetLordFontSize = "compact" | "standard" | "large";
export const brandThemes = tokens.colors;

export function petLordAntdTheme(mode: PetLordTheme, fontSize: PetLordFontSize = "standard"): ThemeConfig {
  const colors = brandThemes[mode];
  const adjust = tokens.fontAdjustments[fontSize];
  const body = tokens.fontSizes.body + adjust;
  const small = Math.max(tokens.fontSizes.xs, tokens.fontSizes.sm + adjust);
  return {
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: colors.accent, colorInfo: colors.accent, colorSuccess: colors.accent,
      colorWarning: colors.warning, colorError: colors.danger,
      colorBgBase: colors.background, colorBgContainer: colors.raised, colorBgElevated: colors.raised,
      colorBorder: colors.border, colorBorderSecondary: colors.border,
      colorText: colors.text, colorTextSecondary: colors.secondary, colorTextTertiary: colors.muted,
      colorFillSecondary: colors.soft, colorFillTertiary: colors.soft,
      borderRadius: tokens.radii.control, borderRadiusSM: tokens.radii.control, borderRadiusLG: tokens.radii.panel,
      controlHeight: tokens.controls.standard, controlHeightSM: tokens.controls.compact, controlHeightLG: tokens.controls.large,
      fontFamily: tokens.fontFamily, fontFamilyCode: tokens.fontMono,
      fontSize: body, fontSizeSM: small, fontSizeLG: tokens.fontSizes.section + adjust,
      fontWeightStrong: tokens.fontWeights.semibold, lineHeight: (tokens.lineHeights.body + adjust) / body,
      motionDurationMid: `${tokens.motion.standard}ms`,
      zIndexPopupBase: tokens.layers.popup,
    },
    components: {
      Select: { optionSelectedBg: colors.accentSoft, optionSelectedColor: colors.text, optionActiveBg: colors.soft, borderRadiusSM: tokens.radii.control, borderRadiusLG: tokens.radii.control },
      Segmented: { itemSelectedBg: colors.raised, itemSelectedColor: colors.accent, trackBg: colors.soft },
      Modal: { contentBg: colors.surface, headerBg: colors.surface, borderRadiusLG: tokens.radii.dialog },
      Tooltip: { colorBgSpotlight: colors.spotlight },
      Button: { primaryColor: colors.accentInk, colorPrimaryBg: colors.accentSoft, primaryShadow: "none", defaultShadow: "none", fontWeight: tokens.fontWeights.semibold, borderRadiusSM: tokens.radii.control, borderRadiusLG: tokens.radii.control, contentFontSize: body, contentFontSizeSM: small, paddingInline: tokens.controls.paddingInline },
      Input: { inputFontSize: body, inputFontSizeSM: small, borderRadiusSM: tokens.radii.control, borderRadiusLG: tokens.radii.control },
      InputNumber: { inputFontSize: body, inputFontSizeSM: small, borderRadiusSM: tokens.radii.control, borderRadiusLG: tokens.radii.control },
      Tag: { borderRadiusSM: tokens.radii.sm },
      Switch: { colorPrimary: colors.accent, colorPrimaryHover: colors.accentHover },
    },
  };
}
