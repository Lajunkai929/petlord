import { Toaster } from "sonner";

export function ToastHost({ theme }: { theme: "dark" | "light" }) {
  return (
    <Toaster
      position="top-right"
      theme={theme}
      richColors
      closeButton
      expand={false}
      visibleToasts={4}
      toastOptions={{ className: "petlord-toast", duration: 5_000 }}
    />
  );
}
