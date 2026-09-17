import { expect, it } from "vitest";
import { inspectUiSource } from "../../../scripts/check-design-system.mjs";

it("accepts semantic appearance and separate selector layout", () => {
  expect(inspectUiSource("screen.css", ".field { font-size: var(--font-body); border-radius: var(--radius-control); color: var(--text); } .pl-select-control { width: 100%; } .dot { border-radius: 50%; }")).toEqual([]);
  expect(inspectUiSource("screen.tsx", 'import { Input } from "@petlord/ui"; const fields = <><Input /><input type="file" /></>;')).toEqual([]);
});
it("catches local sizes, colors, nested wrapper paint and primitive bypasses", () => {
  const css = inspectUiSource("screen.css", '@media (max-width: 800px) { .field { font-size: 17px; border-radius: 9px; color: #8bad24; } .form .pl-select-control { padding: var(--space-2); } }');
  expect(css).toHaveLength(4);
  expect(inspectUiSource("screen.tsx", 'import { Input } from "antd";\nconst field = <input type="text" onChange={event => edit(event.target.value)} />;')).toHaveLength(2);
});

it("parses JSX callbacks without confusing attributes, strings or comments", () => {
  expect(inspectUiSource("screen.tsx", `const sample = "<input />"; // from "antd"
const upload = <input onChange={event => choose(event.target.files)} type="file" />;`)).toEqual([]);
  expect(inspectUiSource("screen.tsx", `const control = <input onChange={event => edit(event.target.value)} />;`)).toHaveLength(1);
});

it("rejects native selectors and literal JSX UI palettes", () => {
  expect(inspectUiSource("screen.tsx", 'const field = <select name="provider"><option>Local</option></select>;')).toHaveLength(1);
  for (const color of ["#00ff00", "rgb(0, 0, 255)", "hsl(120 100% 50%)"]) {
    expect(inspectUiSource("screen.tsx", `const field = <Input style={{ color: "${color}" }} />;`)).toHaveLength(1);
  }
  expect(inspectUiSource("screen.css", ".field { background: hsl(120 100% 50%); }")).toHaveLength(1);
});

it("checks JSX metrics while preserving circular geometry and media data", () => {
  expect(inspectUiSource("screen.tsx", 'const field = <Input style={{ fontSize: 17, borderRadius: "9px" }} />;')).toHaveLength(2);
  expect(inspectUiSource("screen.tsx", `const artwork = { color: "#00ff00", fontSize: 16, borderRadius: 4 };
const dot = <span style={{ borderRadius: "50%", color: "var(--accent)" }} />;
const canvas = <canvas width={257} height={129} />;`)).toEqual([]);
  const palette = '<div className="native-palette"><button style={{ textShadow: "0 1px 3px #000" }}>A</button></div>';
  expect(inspectUiSource("apps/studio/src/pixel/NativePixelWorkspace.tsx", `const palette = ${palette};`)).toEqual([]);
  expect(inspectUiSource("screen.tsx", `const palette = ${palette};`)).toHaveLength(1);
  expect(inspectUiSource("apps/studio/src/pixel/NativePixelWorkspace.tsx", 'const toolbar = <Button style={{ color: "#fff" }} />;')).toHaveLength(1);
});
