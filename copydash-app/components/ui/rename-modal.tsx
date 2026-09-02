"use client";

import * as React from "react";
import { Modal, Btn, FieldInput } from "./primitives";

export function RenameModal({
  open,
  title,
  initialName,
  onCancel,
  onSave,
}: {
  open: boolean;
  title: string;
  initialName: string;
  onCancel: () => void;
  onSave: (name: string) => Promise<void> | void;
}) {
  const [name, setName] = React.useState(initialName);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    // Reset the draft name whenever the modal reopens for a (possibly different) item.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setName(initialName);
  }, [open, initialName]);

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    await onSave(name.trim());
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onCancel} title={title} width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FieldInput
          label="Name"
          value={name}
          onChange={setName}
          placeholder="Name"
        />
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="primary" fullWidth onClick={submit} disabled={!name.trim() || saving}>
            {saving ? "Saving…" : "Save"}
          </Btn>
          <Btn variant="outline" onClick={onCancel}>
            Cancel
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
