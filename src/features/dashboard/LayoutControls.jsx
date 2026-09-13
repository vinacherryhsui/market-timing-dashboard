import React, { useState } from "react";

export function LayoutControls({ layouts, selectedLayoutId, onSelect, onSaveAs, onDelete, onReset }) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const save = () => {
    if (!name.trim()) return;
    onSaveAs(name);
    setName("");
    setSaving(false);
  };
  return <div className="layout-controls" aria-label="Workspace layouts" data-tutorial-target="customize-save">
    <label>Layout
      <select value={selectedLayoutId} onChange={(event) => onSelect(event.target.value)}>
        <option value="">Current workspace</option>
        {layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.name}</option>)}
      </select>
    </label>
    {saving ? <div className="layout-save-form">
      <label>Layout name<input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") save(); }} autoFocus /></label>
      <button type="button" onClick={save} disabled={!name.trim()}>Save</button>
      <button type="button" onClick={() => { setSaving(false); setName(""); }}>Cancel</button>
    </div> : <button type="button" onClick={() => setSaving(true)}>Save as...</button>}
    {selectedLayoutId && <button type="button" onClick={() => onDelete(selectedLayoutId)}>Delete</button>}
    <button type="button" onClick={onReset}>Reset to default</button>
  </div>;
}
