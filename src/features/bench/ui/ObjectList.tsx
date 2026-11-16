import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import type { LabDocument, Mount } from "../../../shared/document";
import { labels } from "../../../shared/document";
import { childMounts, mountMembers } from "../lib/mounts";

export function ObjectList({
  doc,
  selection,
  selectedMount,
  onSelect,
  onSelectMount,
}: {
  doc: LabDocument;
  selection: string[];
  selectedMount: string | null;
  onSelect: (id: string, additive: boolean) => void;
  onSelectMount: (id: string | null) => void;
}) {
  const index = new Map(doc.items.map((e, i) => [e.id, i]));

  const elementRow = (id: string, depth: number) => {
    const e = doc.items[index.get(id)!];
    return (
      <button
        key={e.id}
        className={selection.includes(e.id) ? "active" : ""}
        style={{ paddingLeft: 4 + depth * 14 }}
        onClick={(ev) => onSelect(e.id, ev.shiftKey)}
      >
        <i className={e.kind} />
        <span>
          {labels[e.kind]} {String(index.get(e.id)! + 1).padStart(2, "0")}
        </span>
        <small>
          {Math.round(e.x)}, {Math.round(e.y)}
        </small>
      </button>
    );
  };

  const mountRows = (m: Mount, depth: number): ReactNode => (
    <div key={m.id}>
      <button
        className={"mount-row" + (selectedMount === m.id ? " active" : "")}
        style={{ paddingLeft: 4 + depth * 14 }}
        onClick={() => onSelectMount(selectedMount === m.id ? null : m.id)}
      >
        <i className="mount-dot" />
        <span>{m.name}</span>
        {m.locked && <Lock size={10} className="lock-icon" />}
        <small>{mountMembers(doc, m.id).length} 件</small>
      </button>
      {mountMembers(doc, m.id).map((e) => elementRow(e.id, depth + 1))}
      {childMounts(doc, m.id).map((c) => mountRows(c, depth + 1))}
    </div>
  );

  const roots = doc.mounts.filter((m) => !m.parent);
  const free = doc.items.filter((e) => !e.mount);

  return (
    <section className="object-list">
      <div className="section-title">
        场景器件 <span>{String(doc.items.length).padStart(2, "0")}</span>
      </div>
      {roots.map((m) => mountRows(m, 0))}
      {free.map((e) => elementRow(e.id, 0))}
    </section>
  );
}
