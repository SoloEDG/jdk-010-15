import { useState } from "react";
import type { Element, LabDocument, Point } from "../../../shared/document";
import { patchDocument } from "../../../shared/commands";
import { loadDocument, saveDocument } from "../lib/storage";
import {
  detachElement,
  groupElements,
  mountOf,
  pivotToCentroid,
  removeElements,
  setMountPivot,
  setMountPose,
  subtree,
  toggleLock,
  topMountOf,
  translateMount,
  ungroup as ungroupDoc,
  updateElementLocal,
  updateElementWorld,
} from "../lib/mounts";

const clampX = (x: number) => Math.max(20, Math.min(980, x));
const clampY = (y: number) => Math.max(20, Math.min(580, y));

export function useDocument(initial: LabDocument) {
  const [doc, setDoc] = useState(() => loadDocument() ?? initial);
  const [selection, setSelection] = useState<string[]>([]);
  const [selectedMount, setSelectedMount] = useState<string | null>(null);
  const [past, setPast] = useState<LabDocument[]>([]);
  const [future, setFuture] = useState<LabDocument[]>([]);
  const [saved, setSaved] = useState(false);

  /** 所有编辑命令的唯一入口：一次 replace = 一次撤销步。 */
  function replace(next: LabDocument) {
    if (next === doc) return;
    setPast((p) => [...p.slice(-49), doc]);
    setFuture([]);
    setDoc(next);
    setSaved(false);
  }

  /** 结构变更后同步选择状态，避免悬空选中。 */
  function commit(next: LabDocument, keepSelection = true) {
    replace(next);
    const ids = new Set(next.items.map((e) => e.id));
    setSelection((s) => (keepSelection ? s.filter((id) => ids.has(id)) : []));
    setSelectedMount((m) =>
      m && next.mounts.some((k) => k.id === m) ? m : null,
    );
  }

  function selectOnly(id: string | null) {
    setSelection(id ? [id] : []);
    setSelectedMount(null);
  }

  function toggleSelect(id: string) {
    setSelectedMount(null);
    setSelection((s) =>
      s.includes(id) ? s.filter((k) => k !== id) : [...s, id],
    );
  }

  function selectMount(mountId: string | null) {
    if (!mountId) {
      setSelectedMount(null);
      return;
    }
    setSelectedMount(mountId);
    setSelection(subtree(doc, mountId).elements.map((e) => e.id));
  }

  return {
    doc,
    selection,
    selectedMount,
    selected: selection.length === 1 ? selection[0] : null,
    saved,
    replace: (next: LabDocument) => commit(next, false),
    selectOnly,
    toggleSelect,
    selectMount,
    clearSelection: () => {
      setSelection([]);
      setSelectedMount(null);
    },
    /** 光学参数编辑；x/y/angle 一律经世界→局部换算，结构键在此隔离。 */
    update: (id: string, p: Partial<Element>) => {
      const { x, y, angle, mount, lx, ly, langle, ...rest } = p;
      void mount;
      void lx;
      void ly;
      void langle;
      let next = doc;
      if (Object.keys(rest).length) next = patchDocument(next, id, rest);
      if (x !== undefined || y !== undefined || angle !== undefined)
        next = updateElementWorld(next, id, { x, y, angle });
      commit(next);
    },
    updateWorld: (id: string, p: Partial<{ x: number; y: number; angle: number }>) =>
      commit(updateElementWorld(doc, id, p)),
    updateLocal: (id: string, p: Partial<{ lx: number; ly: number; langle: number }>) =>
      commit(updateElementLocal(doc, id, p)),
    /** 把当前多选建立为刚性支架。 */
    group: () => {
      const r = groupElements(doc, selection);
      if (!r) return;
      replace(r.doc);
      setSelectedMount(r.mountId);
      setSelection(r.doc.items.filter((e) => e.mount === r.mountId).map((e) => e.id));
    },
    ungroup: (mountId: string) => {
      const members = doc.items.filter((e) => e.mount === mountId).map((e) => e.id);
      commit(ungroupDoc(doc, mountId), false);
      setSelectedMount(null);
      setSelection(members);
    },
    translateMount: (mountId: string, d: Point) =>
      commit(translateMount(doc, mountId, d)),
    setMountAngle: (mountId: string, angle: number) =>
      commit(setMountPose(doc, mountId, { angle })),
    setPivot: (mountId: string, world: Point) =>
      commit(setMountPivot(doc, mountId, world)),
    resetPivot: (mountId: string) => commit(pivotToCentroid(doc, mountId)),
    toggleLock: (mountId: string) => commit(toggleLock(doc, mountId)),
    detach: (id: string, at?: Point) => commit(detachElement(doc, id, at)),
    removeIds: (ids: string[]) => commit(removeElements(doc, ids), false),
    /** 方向键微调：自由器件移动自身，支架成员整体平移最外层支架。 */
    nudge: (id: string, dx: number, dy: number) => {
      const el = doc.items.find((e) => e.id === id);
      if (!el) return;
      const top = topMountOf(doc, id);
      if (top) commit(translateMount(doc, top.id, { x: dx, y: dy }));
      else
        commit(
          updateElementWorld(doc, id, {
            x: clampX(el.x + dx),
            y: clampY(el.y + dy),
          }),
        );
    },
    mountOf: (id: string) => mountOf(doc, id),
    save: () => {
      saveDocument(doc);
      setSaved(true);
    },
    undo: () => {
      const prev = past.at(-1);
      if (prev) {
        setFuture((f) => [doc, ...f]);
        setDoc(prev);
        setPast((p) => p.slice(0, -1));
        setSaved(false);
      }
    },
    redo: () => {
      if (future[0]) {
        setPast((p) => [...p, doc]);
        setDoc(future[0]);
        setFuture((f) => f.slice(1));
        setSaved(false);
      }
    },
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
