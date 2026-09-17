import { forwardRef, type ComponentRef } from "react";
import { Button as AntButton, type ButtonProps } from "antd";

/** Radix asChild may supply a native `type`; keep it separate from visual intent. */
export const Button = forwardRef<ComponentRef<typeof AntButton>, ButtonProps>(function Button({ type = "default", htmlType, ...props }, ref) {
  const nativeType = ["button", "submit", "reset"].includes(type as string)
    ? type as "button" | "submit" | "reset"
    : undefined;
  return <AntButton {...props} ref={ref} type={nativeType ? "default" : type} htmlType={htmlType ?? nativeType ?? "button"} />;
});
