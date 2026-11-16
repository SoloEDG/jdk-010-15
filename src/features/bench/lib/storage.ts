import type { Element, LabDocument, Mount } from "../../../shared/document";
import { normalizeDocument } from "./mounts";

const KINDS = ["source", "mirror", "lens", "prism", "screen"];
const NUMBERS = [
  "x",
  "y",
  "angle",
  "size",
  "power",
  "rays",
  "spread",
  "wavelength",
  "focal",
  "index",
] as const;

function validElement(e: Record<string, unknown>): boolean {
  if (!KINDS.includes(e.kind as string) || typeof e.id !== "string")
    return false;
  for (const k of NUMBERS) if (!Number.isFinite(e[k])) return false;
  const el = e as unknown as Element;
  return !(el.rays < 1 || el.rays > 41 || el.size <= 0 || el.focal === 0 || el.index < 1);
}

function migrateItems(raw: unknown[]): Element[] | null {
  const items: Element[] = [];
  for (const r of raw) {
    const e = r as Record<string, unknown>;
    if (!validElement(e)) return null;
    items.push({
      ...(e as unknown as Element),
      mount: typeof e.mount === "string" ? e.mount : null,
      lx: Number.isFinite(e.lx) ? (e.lx as number) : 0,
      ly: Number.isFinite(e.ly) ? (e.ly as number) : 0,
      langle: Number.isFinite(e.langle) ? (e.langle as number) : 0,
    });
  }
  return items;
}

function migrateMounts(raw: unknown): Mount[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const mounts: Mount[] = [];
  for (const r of raw) {
    const m = r as Record<string, unknown>;
    if (
      typeof m?.id !== "string" ||
      !Number.isFinite(m.px) ||
      !Number.isFinite(m.py) ||
      !Number.isFinite(m.angle)
    )
      return null;
    mounts.push({
      id: m.id,
      name: typeof m.name === "string" ? m.name : "支架",
      parent: typeof m.parent === "string" ? m.parent : null,
      px: m.px as number,
      py: m.py as number,
      angle: m.angle as number,
      locked: m.locked === true,
    });
  }
  return mounts;
}

/**
 * 把存储中的任意版本数据迁移为当前文档：
 * v1 平面场景原样保留器件（几何与测量不变），补空支架列表；
 * v2 校验支架引用并归一化世界坐标缓存。无效数据返回 null。
 */
export function migrateDocument(raw: unknown): LabDocument | null {
  const v = raw as Record<string, unknown> | null;
  if (!v || (v.version !== 1 && v.version !== 2)) return null;
  if (!Array.isArray(v.items) || v.items.length > 80) return null;
  const items = migrateItems(v.items);
  if (!items) return null;
  const mounts = v.version === 1 ? [] : migrateMounts(v.mounts);
  if (!mounts) return null;
  return normalizeDocument({ version: 2, items, mounts });
}

export function saveDocument(doc: LabDocument) {
  localStorage.setItem("lumen-document", JSON.stringify(doc));
}

export function loadDocument(): LabDocument | null {
  try {
    return migrateDocument(JSON.parse(localStorage.getItem("lumen-document") ?? "null"));
  } catch {
    return null;
  }
}
