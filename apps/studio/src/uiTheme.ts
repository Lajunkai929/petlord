import { theme, type ThemeConfig } from "antd";

export function studioAntdTheme(mode: "dark" | "light"): ThemeConfig {
  const dark = mode === "dark";
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: dark ? "#b4d36b" : "#688f24",
      colorBgBase: dark ? "#0d0f0c" : "#eef0e8",
      colorBgContainer: dark ? "#1b1f19" : "#ffffff",
      colorBorder: dark ? "#2c3229" : "#d5d9ce",
      colorText: dark ? "#f1f3eb" : "#20241d",
      colorTextSecondary: dark ? "#8d9586" : "#71796d",
      borderRadius: 7,
      fontFamily: '"Avenir Next", Avenir, "Segoe UI", system-ui, sans-serif',
      controlHeight: 34,
    },
    components: {
      Image: { previewOperationColor: "rgba(255,255,255,.88)" },
      Modal: { contentBg: dark ? "#151814" : "#f7f8f3", headerBg: dark ? "#151814" : "#f7f8f3" },
      Popconfirm: { colorBgElevated: dark ? "#1b1f19" : "#ffffff" },
      Tooltip: { colorBgSpotlight: dark ? "#252b22" : "#20241d" },
    },
  };
}
