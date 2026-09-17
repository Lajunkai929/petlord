import { Children, Fragment, forwardRef, isValidElement, useId, useLayoutEffect, useRef, type ComponentPropsWithoutRef, type ComponentRef, type ReactNode, type SelectHTMLAttributes } from "react";
import { Input, Select } from "antd";
import * as Dialog from "@radix-ui/react-dialog";
export { Alert, Checkbox, ConfigProvider, Empty, Image, Input, InputNumber, Popconfirm, Popover, Radio, Segmented, Select, Skeleton, Spin, Switch, Tag, Tooltip, Typography } from "antd";
export { Button } from "./Button";
export { Dialog };
export const TextArea = Input.TextArea;
export { FormField } from "./FormField";
export { brandThemes, petLordAntdTheme, type PetLordTheme } from "./theme";
export { usePetLordTheme, normalizeTheme } from "./useTheme";

export const DialogContent = forwardRef<ComponentRef<typeof Dialog.Content>,ComponentPropsWithoutRef<typeof Dialog.Content>>(function DialogContent({onEscapeKeyDown,className,...props},ref) {
  return <Dialog.Content {...props} className={`pl-dialog ${className ?? ""}`} ref={ref} onEscapeKeyDown={event => {
    const target=event.target;
    if(target instanceof Element && target.closest(".pl-select-control")?.querySelector('[role="combobox"][aria-expanded="true"]')) event.preventDefault();
    onEscapeKeyDown?.(event);
  }} />;
});

type Option = { value: string; label: ReactNode; disabled?: boolean } | { label: ReactNode; options: Option[] };
export function selectOptions(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{value?: string | number; children?: ReactNode; disabled?: boolean; label?: string}>(child)) return [];
    if (child.type === Fragment) return selectOptions(child.props.children);
    if (child.type === "optgroup") return [{label:child.props.label,options:selectOptions(child.props.children)}];
    if (child.type !== "option") return [];
    return [{value:String(child.props.value ?? child.props.children ?? ""),label:child.props.children,disabled:child.props.disabled}];
  });
}

/** Ant Design provides keyboard/focus/option state; the hidden select preserves HTML form semantics. */
export function SelectField({children, value, defaultValue, onChange, className, style, id, name, required, disabled, title, onBlur, onFocus, status, ...aria}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "multiple" | "size"> & { status?: "error" | "warning" }) {
  const generatedId = useId();
  const inputId = id ?? `petlord-select-${generatedId}`;
  const root = useRef<HTMLSpanElement>(null);
  const native = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => {
    const label = root.current?.closest("label");
    if (label && !label.htmlFor) { label.htmlFor=inputId; return () => { if(label.htmlFor===inputId) label.removeAttribute("for"); }; }
  },[inputId]);
  const normalized = value === undefined ? undefined : String(value);
  return <span ref={root} className={`pl-select-control ${className ?? ""}`} style={style} title={title}>
    <Select id={inputId} className="pl-select" value={normalized} defaultValue={defaultValue === undefined ? undefined : String(defaultValue)} disabled={disabled} status={status} options={selectOptions(children)} virtual={false} showSearch={false}
      aria-label={aria["aria-label"]} aria-labelledby={aria["aria-labelledby"]} aria-describedby={aria["aria-describedby"]} aria-required={required} aria-invalid={aria["aria-invalid"]}
      getPopupContainer={trigger => trigger.closest('[role="dialog"]') as HTMLElement ?? trigger.ownerDocument.body}
      onFocus={onFocus as never} onBlur={onBlur as never}
      onChange={next => { if (native.current) { native.current.value=String(next); native.current.dispatchEvent(new Event("change",{bubbles:true})); } }}
    />
    <select ref={native} value={normalized} defaultValue={defaultValue} name={name} required={required} disabled={disabled} onChange={onChange} tabIndex={-1} aria-hidden="true" style={{position:"absolute",width:1,height:1,opacity:0,pointerEvents:"none"}} onInvalid={event => {event.preventDefault();root.current?.querySelector<HTMLInputElement>("input[role=combobox]")?.focus();}}>{children}</select>
  </span>;
}
