import type {
  Element,
  LabDocument,
  Mount,
  Point,
} from "../../../shared/document";
import { rot } from "../../../shared/geometry";

/** 世界位姿：位置 + 朝向（角度制）。 */
export interface Pose {
  x: number;
  y: number;
  angle: number;
}

const IDENTITY: Pose = { x: 0, y: 0, angle: 0 };

// ---------------------------------------------------------------- 查询

export function mountOf(doc: LabDocument, elementId: string): Mount | null {
  const el = doc.items.find((e) => e.id === elementId);
  if (!el?.mount) return null;
  return doc.mounts.find((m) => m.id === el.mount) ?? null;
}

/** 器件所在的最外层支架（画布拖动时整体移动的刚体）。 */
export function topMountOf(
  doc: LabDocument,
  elementId: string,
): Mount | null {
  let m = mountOf(doc, elementId);
  if (!m) return null;
  const seen = new Set<string>([m.id]);
  while (m.parent) {
    const up = doc.mounts.find((p) => p.id === m!.parent);
    if (!up || seen.has(up.id)) break;
    seen.add(up.id);
    m = up;
  }
  return m;
}

export function childMounts(doc: LabDocument, mountId: string): Mount[] {
  return doc.mounts.filter((m) => m.parent === mountId);
}

export function mountMembers(doc: LabDocument, mountId: string): Element[] {
  return doc.items.filter((e) => e.mount === mountId);
}

/** 支架子树：自身 + 所有后代支架 + 它们的全部成员器件。 */
export function subtree(doc: LabDocument, mountId: string) {
  const mounts: Mount[] = [];
  const queue = [mountId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const m = doc.mounts.find((k) => k.id === id);
    if (!m) continue;
    mounts.push(m);
    for (const c of childMounts(doc, id)) queue.push(c.id);
  }
  const ids = new Set(mounts.map((m) => m.id));
  return { mounts, elements: doc.items.filter((e) => e.mount && ids.has(e.mount)) };
}

// ---------------------------------------------------------------- 位姿解算

/** 支架的世界位姿（铰接中心位置 + 世界朝向）。 */
export function mountPose(
  doc: LabDocument,
  mountId: string,
  memo: Map<string, Pose> = new Map(),
  seen: Set<string> = new Set(),
): Pose {
  const cached = memo.get(mountId);
  if (cached) return cached;
  const m = doc.mounts.find((k) => k.id === mountId);
  if (!m) return { ...IDENTITY };
  if (seen.has(mountId)) return { ...IDENTITY }; // 环防御
  seen.add(mountId);
  const base =
    m.parent && m.parent !== mountId && doc.mounts.some((k) => k.id === m.parent)
      ? mountPose(doc, m.parent, memo, seen)
      : { ...IDENTITY };
  const off = rot({ x: m.px, y: m.py }, base.angle);
  const pose = { x: base.x + off.x, y: base.y + off.y, angle: base.angle + m.angle };
  memo.set(mountId, pose);
  return pose;
}

/** 器件的世界位姿。归一化文档中与 el.x/el.y/el.angle 缓存一致。 */
export function elementPose(
  doc: LabDocument,
  el: Element,
  memo: Map<string, Pose> = new Map(),
): Pose {
  if (!el.mount) return { x: el.x, y: el.y, angle: el.angle };
  const base = mountPose(doc, el.mount, memo);
  const off = rot({ x: el.lx, y: el.ly }, base.angle);
  return { x: base.x + off.x, y: base.y + off.y, angle: el.langle + base.angle };
}

/**
 * 归一化：清理悬空引用（指向不存在支架的 parent/mount），
 * 并从支架树重算所有成员器件的世界坐标缓存。
 * 纯函数、确定性 —— 保存重开后得到完全相同的几何。
 */
export function normalizeDocument(doc: LabDocument): LabDocument {
  const ids = new Set(doc.mounts.map((m) => m.id));
  // 打断父链环并清理悬空 parent
  const mounts = doc.mounts.map((m) => {
    let parent = m.parent && ids.has(m.parent) ? m.parent : null;
    const chain = new Set([m.id]);
    let cur = parent;
    while (cur) {
      if (chain.has(cur)) {
        parent = null;
        break;
      }
      chain.add(cur);
      const up = doc.mounts.find((k) => k.id === cur);
      cur = up && ids.has(up.parent ?? "") ? up!.parent! : null;
    }
    return parent === m.parent ? m : { ...m, parent };
  });
  const fixed = { ...doc, mounts };
  const memo = new Map<string, Pose>();
  const items = fixed.items.map((e) => {
    if (!e.mount) return e;
    if (!ids.has(e.mount)) return { ...e, mount: null, lx: 0, ly: 0, langle: 0 };
    const p = elementPose(fixed, e, memo);
    return p.x === e.x && p.y === e.y && p.angle === e.angle
      ? e
      : { ...e, x: p.x, y: p.y, angle: p.angle };
  });
  return { ...fixed, items };
}

// ---------------------------------------------------------------- 结构命令
// 所有命令返回归一化后的新文档；调用方一次 replace 即一次撤销步。

/** 世界坐标 → 某支架局部系。 */
function toLocal(pose: Pose, world: Point, worldAngle: number) {
  const p = rot({ x: world.x - pose.x, y: world.y - pose.y }, -pose.angle);
  return { lx: p.x, ly: p.y, langle: worldAngle - pose.angle };
}

/** 把多选器件建立为刚性支架；成员世界几何保持不变。 */
export function groupElements(
  doc: LabDocument,
  ids: string[],
): { doc: LabDocument; mountId: string } | null {
  const members = doc.items.filter((e) => ids.includes(e.id));
  if (members.length < 2) return null;
  const mounts = members.map((e) => e.mount);
  const parent = mounts.every((m) => m === mounts[0]) ? mounts[0] : null;
  const pivot = {
    x: members.reduce((s, e) => s + e.x, 0) / members.length,
    y: members.reduce((s, e) => s + e.y, 0) / members.length,
  };
  const parentPose = parent
    ? mountPose(doc, parent)
    : { ...IDENTITY };
  const pl = rot(
    { x: pivot.x - parentPose.x, y: pivot.y - parentPose.y },
    -parentPose.angle,
  );
  const seq =
    doc.mounts.reduce((k, m) => {
      const t = /^支架 (\d+)$/.exec(m.name);
      return t ? Math.max(k, Number(t[1])) : k;
    }, 0) + 1;
  const mount: Mount = {
    id: crypto.randomUUID(),
    name: `支架 ${String(seq).padStart(2, "0")}`,
    parent,
    px: pl.x,
    py: pl.y,
    angle: 0,
    locked: false,
  };
  const frame: Pose = { x: pivot.x, y: pivot.y, angle: parentPose.angle };
  const items = doc.items.map((e) => {
    if (!ids.includes(e.id)) return e;
    const l = toLocal(frame, e, e.angle);
    return { ...e, mount: mount.id, ...l };
  });
  return {
    doc: pruneEmptyMounts(
      normalizeDocument({ ...doc, items, mounts: [...doc.mounts, mount] }),
    ),
    mountId: mount.id,
  };
}

/** 解散支架：成员回到父级（或自由），子支架上移一层，世界几何不变。 */
export function ungroup(doc: LabDocument, mountId: string): LabDocument {
  const m = doc.mounts.find((k) => k.id === mountId);
  if (!m) return doc;
  const parentPose = m.parent ? mountPose(doc, m.parent) : { ...IDENTITY };
  const items = doc.items.map((e) => {
    if (e.mount !== mountId) return e;
    if (!m.parent) return { ...e, mount: null, lx: 0, ly: 0, langle: 0 };
    const l = toLocal(parentPose, e, e.angle);
    return { ...e, mount: m.parent, ...l };
  });
  const mounts = doc.mounts
    .filter((k) => k.id !== mountId)
    .map((k) => {
      if (k.parent !== mountId) return k;
      const world = mountPose(doc, k.id);
      if (!m.parent)
        return { ...k, parent: null, px: world.x, py: world.y, angle: world.angle };
      const l = toLocal(parentPose, world, world.angle);
      return { ...k, parent: m.parent, px: l.lx, py: l.ly, angle: l.langle };
    });
  return normalizeDocument({ ...doc, items, mounts });
}

/** 按世界位移整体平移支架（内部几何不变）。 */
export function translateMount(
  doc: LabDocument,
  mountId: string,
  d: Point,
): LabDocument {
  if (!d.x && !d.y) return doc;
  const m = doc.mounts.find((k) => k.id === mountId);
  if (!m) return doc;
  const parentAngle = m.parent ? mountPose(doc, m.parent).angle : 0;
  const dl = rot(d, -parentAngle);
  return setMountPose(doc, mountId, { px: m.px + dl.x, py: m.py + dl.y });
}

/** 设置支架局部位姿（父系坐标），整体旋转绕铰接中心进行。 */
export function setMountPose(
  doc: LabDocument,
  mountId: string,
  pose: Partial<{ px: number; py: number; angle: number }>,
): LabDocument {
  const m = doc.mounts.find((k) => k.id === mountId);
  if (!m) return doc;
  if (
    (pose.px === undefined || pose.px === m.px) &&
    (pose.py === undefined || pose.py === m.py) &&
    (pose.angle === undefined || pose.angle === m.angle)
  )
    return doc;
  const mounts = doc.mounts.map((k) =>
    k.id === mountId ? { ...k, ...pose, id: k.id } : k,
  );
  return normalizeDocument({ ...doc, mounts });
}

/**
 * 重设铰接旋转中心（世界坐标）。
 * 成员局部坐标同步补偿，世界几何保持不变 —— 不会产生跳动。
 */
export function setMountPivot(
  doc: LabDocument,
  mountId: string,
  world: Point,
): LabDocument {
  const m = doc.mounts.find((k) => k.id === mountId);
  if (!m) return doc;
  const pose = mountPose(doc, mountId);
  if (pose.x === world.x && pose.y === world.y) return doc;
  const shift = rot(
    { x: pose.x - world.x, y: pose.y - world.y },
    -pose.angle,
  );
  const parentPose = m.parent ? mountPose(doc, m.parent) : { ...IDENTITY };
  const pl = rot(
    { x: world.x - parentPose.x, y: world.y - parentPose.y },
    -parentPose.angle,
  );
  const items = doc.items.map((e) =>
    e.mount === mountId ? { ...e, lx: e.lx + shift.x, ly: e.ly + shift.y } : e,
  );
  const mounts = doc.mounts.map((k) => {
    if (k.id === mountId) return { ...k, px: pl.x, py: pl.y };
    if (k.parent === mountId) return { ...k, px: k.px + shift.x, py: k.py + shift.y };
    return k;
  });
  return normalizeDocument({ ...doc, items, mounts });
}

/** 铰接中心对齐到成员质心。 */
export function pivotToCentroid(doc: LabDocument, mountId: string): LabDocument {
  const members = mountMembers(doc, mountId);
  if (!members.length) return doc;
  return setMountPivot(doc, mountId, {
    x: members.reduce((s, e) => s + e.x, 0) / members.length,
    y: members.reduce((s, e) => s + e.y, 0) / members.length,
  });
}

export function toggleLock(doc: LabDocument, mountId: string): LabDocument {
  return {
    ...doc,
    mounts: doc.mounts.map((m) =>
      m.id === mountId ? { ...m, locked: !m.locked } : m,
    ),
  };
}

/**
 * 以世界坐标精确编辑器件位置/朝向。
 * 支架成员先经父系逆变换换算为局部坐标再写回 —— 父支架旋转后输入不会跳动。
 */
export function updateElementWorld(
  doc: LabDocument,
  id: string,
  patch: Partial<{ x: number; y: number; angle: number }>,
): LabDocument {
  const el = doc.items.find((e) => e.id === id);
  if (!el) return doc;
  if (
    (patch.x === undefined || patch.x === el.x) &&
    (patch.y === undefined || patch.y === el.y) &&
    (patch.angle === undefined || patch.angle === el.angle)
  )
    return doc;
  if (!el.mount)
    return normalizeDocument({
      ...doc,
      items: doc.items.map((e) => (e.id === id ? { ...e, ...patch, id: e.id } : e)),
    });
  const world = {
    x: patch.x ?? el.x,
    y: patch.y ?? el.y,
    angle: patch.angle ?? el.angle,
  };
  const owner = doc.mounts.find((k) => k.id === el.mount);
  if (owner?.locked) return doc; // 锁定支架：内部几何冻结，仅整体变换
  const l = toLocal(mountPose(doc, el.mount), world, world.angle);
  if (l.lx === el.lx && l.ly === el.ly && l.langle === el.langle) return doc;
  return normalizeDocument({
    ...doc,
    items: doc.items.map((e) => (e.id === id ? { ...e, ...l } : e)),
  });
}

/** 以支架局部坐标精确编辑成员（锁定支架拒绝修改，返回原文档）。 */
export function updateElementLocal(
  doc: LabDocument,
  id: string,
  patch: Partial<{ lx: number; ly: number; langle: number }>,
): LabDocument {
  const el = doc.items.find((e) => e.id === id);
  if (!el) return doc;
  if (!el.mount)
    return updateElementWorld(doc, id, {
      x: patch.lx,
      y: patch.ly,
      angle: patch.langle,
    });
  const m = doc.mounts.find((k) => k.id === el.mount);
  if (m?.locked) return doc;
  if (
    (patch.lx === undefined || patch.lx === el.lx) &&
    (patch.ly === undefined || patch.ly === el.ly) &&
    (patch.langle === undefined || patch.langle === el.langle)
  )
    return doc;
  return normalizeDocument({
    ...doc,
    items: doc.items.map((e) => (e.id === id ? { ...e, ...patch, id: e.id } : e)),
  });
}

/** 把器件从支架拆出（保持世界位姿，可顺带移到新位置）。 */
export function detachElement(
  doc: LabDocument,
  id: string,
  at?: Point,
): LabDocument {
  const el = doc.items.find((e) => e.id === id);
  if (!el?.mount) return doc;
  const m = doc.mounts.find((k) => k.id === el.mount);
  if (m?.locked) return doc;
  const items = doc.items.map((e) =>
    e.id === id
      ? { ...e, mount: null, lx: 0, ly: 0, langle: 0, x: at?.x ?? e.x, y: at?.y ?? e.y }
      : e,
  );
  return pruneEmptyMounts(normalizeDocument({ ...doc, items }));
}

/** 删除器件；其余成员局部坐标不变，世界几何与身份保持稳定。 */
export function removeElements(doc: LabDocument, ids: string[]): LabDocument {
  const drop = new Set(ids);
  return pruneEmptyMounts({
    ...doc,
    items: doc.items.filter((e) => !drop.has(e.id)),
  });
}

/** 级联清理既无成员器件也无子支架的空支架。 */
function pruneEmptyMounts(doc: LabDocument): LabDocument {
  let mounts = doc.mounts;
  for (;;) {
    const alive = mounts.filter(
      (m) =>
        doc.items.some((e) => e.mount === m.id) ||
        mounts.some((k) => k.parent === m.id),
    );
    if (alive.length === mounts.length) break;
    const ids = new Set(alive.map((m) => m.id));
    mounts = alive.map((m) =>
      m.parent && !ids.has(m.parent) ? { ...m, parent: null } : m,
    );
  }
  return mounts.length === doc.mounts.length ? doc : normalizeDocument({ ...doc, mounts });
}
