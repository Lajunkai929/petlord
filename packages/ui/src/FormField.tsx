import { cloneElement, useId, type ReactElement, type ReactNode } from "react";

/** One label, hint and validation relationship for shared form controls. */
export function FormField({ label, hint, error, required, className = "", children }: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  const generatedId = useId();
  const id = String(children.props.id ?? `pl-field-${generatedId}`);
  const describedBy = [children.props["aria-describedby"], hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return <div className={`pl-field ${className}`}>
    <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
    {cloneElement(children, { id, required: required ?? children.props.required, status: error ? "error" : children.props.status, "aria-describedby": describedBy, "aria-required": required ?? children.props["aria-required"], "aria-invalid": error ? true : children.props["aria-invalid"] })}
    {hint && <p className="pl-field-hint" id={`${id}-hint`}>{hint}</p>}
    {error && <p className="pl-field-error" id={`${id}-error`} role="alert">{error}</p>}
  </div>;
}
