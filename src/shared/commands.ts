import type { Element, LabDocument } from "./document";
export function patchDocument(
  doc: LabDocument,
  id: string,
  patch: Partial<Element>,
): LabDocument {
  return {
    ...doc,
    items: doc.items.map((e) =>
      e.id === id ? { ...e, ...patch, id: e.id, kind: e.kind } : e,
    ),
  };
}
