// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement as h, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConfigProvider } from "antd";
import { Button, DialogContent, FormField, Input, SelectField } from "./index";
import { brandThemes, petLordAntdTheme } from "./theme";
import { normalizeTheme } from "./useTheme";
import * as Dialog from "@radix-ui/react-dialog";

(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root|undefined;
afterEach(async()=>{await act(async()=>root?.unmount());document.body.innerHTML="";});
const key=(element:Element,value:string,keyCode:number)=>element.dispatchEvent(new KeyboardEvent("keydown",{key:value,keyCode,which:keyCode,bubbles:true,cancelable:true}));

it("provides a labeled keyboard selector, skips disabled options and keeps native form values",async()=>{
  const selected=vi.fn();
  function Form(){const [value,setValue]=useState("sit");return h("form",{},h("label",{},"宠物状态",h(SelectField,{name:"pose",value,onChange:event=>{selected(event.target.value);setValue(event.target.value);}},
    h("option",{value:"sit"},"坐着"),h("option",{value:"rest",disabled:true},"休息"),h("option",{value:"sleep"},"睡觉"))));}
  const host=document.createElement("div");document.body.append(host);root=createRoot(host);
  await act(async()=>root!.render(h(ConfigProvider,{theme:{...petLordAntdTheme("light"),token:{motion:false}}},h(Form))));
  const combo=host.querySelector<HTMLInputElement>('[role="combobox"]')!;
  expect(combo).not.toBeNull();expect(host.querySelector("label")?.htmlFor).toBe(combo.id);
  await act(async()=>{combo.focus();key(combo,"ArrowDown",40);});
  expect(combo.getAttribute("aria-expanded")).toBe("true");
  await act(async()=>{key(combo,"ArrowDown",40);});
  await act(async()=>{key(combo,"Enter",13);});
  expect(selected).toHaveBeenCalledWith("sleep");
  expect(new FormData(host.querySelector("form")!).get("pose")).toBe("sleep");
  await act(async()=>{key(combo,"ArrowDown",40);});
  await act(async()=>{key(combo,"Escape",27);});
  expect(combo.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(combo);
});

it("defaults to light and keeps readable foreground/primary contrast in both modes",()=>{
  expect(normalizeTheme(undefined)).toBe("light");expect(normalizeTheme("invalid")).toBe("light");expect(normalizeTheme("dark")).toBe("dark");
  const luminance=(hex:string)=>[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
  const ratio=(a:string,b:string)=>{const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return(values[0]+.05)/(values[1]+.05);};
  for(const palette of Object.values(brandThemes)){
    expect(ratio(palette.text,palette.background)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(palette.secondary,palette.raised)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(palette.muted,palette.background)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(palette.accentInk,palette.accent)).toBeGreaterThanOrEqual(4.5);
  }
});

it("keeps the dialog open when Escape dismisses its selector popup",async()=>{
  const host=document.createElement("div");document.body.append(host);root=createRoot(host);
  const selector=h("label",{},"制作路线",h(SelectField,{defaultValue:"pixel"},h("option",{value:"pixel"},"原生像素"),h("option",{value:"generated"},"生成素材")));
  const content=h(DialogContent,{"aria-describedby":undefined},h(Dialog.Title,{},"创建宠物"),selector);
  const dialog=h(Dialog.Root,{defaultOpen:true},h(Dialog.Portal,{},content));
  await act(async()=>root!.render(h(ConfigProvider,{theme:{token:{motion:false}}},dialog)));
  const combo=document.querySelector<HTMLInputElement>('[role="combobox"]')!;
  await act(async()=>{combo.focus();key(combo,"ArrowDown",40);});
  expect(combo.getAttribute("aria-expanded")).toBe("true");
  await act(async()=>{key(combo,"Escape",27);});
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(combo.getAttribute("aria-expanded")).toBe("false");
  await act(async()=>{key(combo,"Escape",27);});
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("uses the shared standard, compact and large control sizes", () => {
  for (const mode of ["light", "dark"] as const) {
    const { token } = petLordAntdTheme(mode);
    expect(token).toMatchObject({ controlHeight: 36, controlHeightSM: 28, controlHeightLG: 44, fontSize: 14, borderRadius: 8 });
  }
});

it("connects field labels, existing hints, required validation and visible errors", async () => {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(h(ConfigProvider, { theme: petLordAntdTheme("light") },
    h(FormField, { label: "宠物名称", required: true, hint: "名字会显示在项目中", error: "请输入名称", children: h(Input, { "aria-describedby": "caller-hint" }) }))));
  const input = host.querySelector("input")!;
  expect(host.querySelector("label")?.htmlFor).toBe(input.id);
  expect(input.required).toBe(true);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(input.getAttribute("aria-describedby")).toContain("caller-hint");
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("请输入名称");
  expect(input.className).toContain("ant-input-status-error");
});

it("keeps a default library button styled when a dialog primitive supplies a native type", async () => {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(h(ConfigProvider, { theme: petLordAntdTheme("light") },
    h(Dialog.Root, {}, h(Dialog.Trigger, { asChild: true }, h(Button, {}, "打开配置"))))));
  const button = host.querySelector("button")!;
  expect(button.type).toBe("button");
  expect(button.className).toContain("ant-btn-default");
  expect(button.className).not.toContain("ant-btn-button");
});
