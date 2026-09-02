import { useState, type FormEvent } from "react";

interface AddStateInput {
  label: string;
  semanticKey: string;
  description: string;
}

export function useAddStateDialog(onAdd: (input: AddStateInput) => void) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [semanticKey, setSemanticKey] = useState("");
  const [description, setDescription] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!label.trim()) return;
    onAdd({ label: label.trim(), semanticKey: semanticKey.trim(), description: description.trim() });
    setLabel("");
    setSemanticKey("");
    setDescription("");
    setOpen(false);
  }

  return { open, setOpen, label, setLabel, semanticKey, setSemanticKey, description, setDescription, submit };
}
