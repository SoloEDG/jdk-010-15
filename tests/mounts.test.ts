import { test } from "node:test";
import assert from "node:assert/strict";
import type { Element, LabDocument } from "../src/shared/document";
import {
  groupElements,
  mountPose,
  normalizeDocument,
  pivotToCentroid,
  removeElements,
  setMountPivot,
  setMountPose,
  subtree,
  toggleLock,
  translateMount,
  ungroup,
  updateElementLocal,
  updateElementWorld,
} from "../src/features/bench/lib/mounts";
import { migrateDocument } from "../src/features/bench/lib/storage";
import { trace } from "../src/features/optics/lib/trace";
import { measure } from "../src/features/detector/lib/measurement";

const el = (
  id: string,
  kind: Element["kind"],
  x: number,
  y: number,
  patch: Partial<Element> = {},
): Element => ({
  id,
  kind,
  x,
  y,
  angle: kind === "source" ? 0 : 90,
  size: 180,
  power: 1,
  rays: 9,
  spread: 0,
  wavelength: 550,
  focal: 180,
  index: 1.52,
  mount: null,
  lx: 0,
  ly: 0,
  langle: 0,
  ...patch,
});

const docOf = (...items: Element[]): LabDocument => ({
  version: 2,
  mounts: [],
  items,
});

const byId = (doc: LabDocument, id: string) =>
  doc.items.find((e) => e.id === id)!;

const close = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("grouping keeps world geometry and produces consistent locals", () => {
  const doc = docOf(
    el("a", "mirror", 400, 300, { angle: 45 }),
    el("b", "lens", 500, 320, { angle: 90 }),
    el("c", "screen", 700, 300),
  );
  const g = groupElements(doc, ["a", "b"])!;
  assert.ok(g);
  const a = byId(g.doc, "a"),
    b = byId(g.doc, "b");
  close(a.x, 400);
  close(a.y, 300);
  close(a.angle, 45);
  close(b.x, 500);
  close(b.y, 320);
  // 铰接中心 = 成员质心
  const pose = mountPose(g.doc, g.mountId);
  close(pose.x, 450);
  close(pose.y, 310);
  // 局部坐标与位姿一致
  close(a.lx, -50);
  close(a.ly, -10);
  close(a.langle, 45);
  // 未入组器件不受影响
  assert.equal(byId(g.doc, "c").mount, null);
});

test("translating a mount moves all members rigidly", () => {
  const g = groupElements(
    docOf(el("a", "mirror", 400, 300), el("b", "mirror", 500, 340)),
    ["a", "b"],
  )!;
  const moved = translateMount(g.doc, g.mountId, { x: 30, y: -20 });
  const a = byId(moved, "a"),
    b = byId(moved, "b");
  close(a.x, 430);
  close(a.y, 280);
  close(b.x, 530);
  close(b.y, 320);
  // 相对几何不变
  close(b.x - a.x, 100);
  close(b.y - a.y, 40);
});

test("rotating a mount revolves members around the hinge pivot", () => {
  const g = groupElements(
    docOf(el("a", "mirror", 400, 300), el("b", "mirror", 500, 300)),
    ["a", "b"],
  )!;
  const rotated = setMountPose(g.doc, g.mountId, { angle: 90 });
  const a = byId(rotated, "a"),
    b = byId(rotated, "b");
  // 铰接中心 (450,300)：a 局部 (-50,0) → 旋转 90° → (0,-50)
  close(a.x, 450);
  close(a.y, 250);
  close(b.x, 450);
  close(b.y, 350);
  close(a.angle, 180);
});

test("nested mounts: child pivot and members follow the parent rotation", () => {
  const g1 = groupElements(
    docOf(
      el("a", "mirror", 400, 300),
      el("b", "mirror", 600, 300),
      el("c", "mirror", 500, 400),
      el("d", "mirror", 800, 300),
    ),
    ["a", "b", "c"],
  )!;
  // 在 M1 内再把 a,b 建为子支架 M2
  const g2 = groupElements(g1.doc, ["a", "b"])!;
  const m2 = g2.doc.mounts.find((m) => m.id === g2.mountId)!;
  assert.equal(m2.parent, g1.mountId);
  // M1 铰接中心 (500, 1000/3)，旋转 90°
  const rotated = setMountPose(g2.doc, g1.mountId, { angle: 90 });
  const pivot = mountPose(rotated, g1.mountId);
  const a = byId(rotated, "a"),
    c = byId(rotated, "c"),
    d = byId(rotated, "d");
  // a 原 (400,300)：相对父铰接 (-100, -100/3) → 旋转 → (100/3, -100)
  close(a.x, pivot.x + 100 / 3);
  close(a.y, pivot.y - 100);
  // c 原 (500,400)：相对 (0, 200/3) → (-200/3, 0)
  close(c.x, pivot.x - 200 / 3);
  close(c.y, pivot.y);
  // 子支架铰接随父旋转：M2 原世界 (500,300) → 相对 (0,-100/3) → (100/3, 0)
  const p2 = mountPose(rotated, g2.mountId);
  close(p2.x, pivot.x + 100 / 3);
  close(p2.y, pivot.y);
  // 未入组器件不动
  close(d.x, 800);
  close(d.y, 300);
});

test("moving the hinge pivot never disturbs member world geometry", () => {
  const g = groupElements(
    docOf(
      el("a", "mirror", 400, 300, { angle: 30 }),
      el("b", "mirror", 520, 360, { angle: -15 }),
    ),
    ["a", "b"],
  )!;
  const tilted = setMountPose(g.doc, g.mountId, { angle: 25 });
  const before = tilted.items.map((e) => ({ id: e.id, x: e.x, y: e.y, angle: e.angle }));
  const repivoted = setMountPivot(tilted, g.mountId, { x: 123, y: 456 });
  for (const e of before) {
    const now = byId(repivoted, e.id);
    close(now.x, e.x);
    close(now.y, e.y);
    close(now.angle, e.angle);
  }
  // 新铰接中心生效：绕新轴旋转
  const pose = mountPose(repivoted, g.mountId);
  close(pose.x, 123);
  close(pose.y, 456);
  const spun = setMountPose(repivoted, g.mountId, { angle: 25 + 90 });
  const a0 = before.find((e) => e.id === "a")!;
  const a1 = byId(spun, "a");
  // 相对新铰接 (123,456) 旋转 90°
  const dx = a0.x - 123,
    dy = a0.y - 456;
  close(a1.x, 123 - dy);
  close(a1.y, 456 + dx);
});

test("world-input on a child of a rotated mount lands exactly, no jump", () => {
  const g = groupElements(
    docOf(el("a", "mirror", 400, 300), el("b", "mirror", 500, 300)),
    ["a", "b"],
  )!;
  const rotated = setMountPose(g.doc, g.mountId, { angle: 37 });
  const edited = updateElementWorld(rotated, "a", { x: 321, y: 234 });
  const a = byId(edited, "a");
  close(a.x, 321);
  close(a.y, 234);
  // 再次归一化保持稳定（无累积漂移）
  const again = normalizeDocument(edited);
  close(byId(again, "a").x, 321);
  close(byId(again, "a").y, 234);
  // 相同输入是空操作（避免多余撤销步）
  assert.equal(updateElementWorld(edited, "a", { x: 321, y: 234 }), edited);
});

test("local edits route through the mount frame; locked mounts refuse them", () => {
  const g = groupElements(
    docOf(el("a", "mirror", 400, 300), el("b", "mirror", 500, 300)),
    ["a", "b"],
  )!;
  const rotated = setMountPose(g.doc, g.mountId, { angle: 90 });
  // 局部系下把 a 放到铰接中心正左 80
  const moved = updateElementLocal(rotated, "a", { lx: -80, ly: 0 });
  const a = byId(moved, "a");
  close(a.x, 450);
  close(a.y, 220);
  // 锁定后局部与世界输入都被拒绝
  const locked = toggleLock(moved, g.mountId);
  assert.equal(updateElementLocal(locked, "a", { lx: 1 }), locked);
  assert.equal(updateElementWorld(locked, "a", { x: 100 }), locked);
  // 但整体变换仍可用
  const shifted = translateMount(locked, g.mountId, { x: 10, y: 0 });
  close(byId(shifted, "a").x, 460);
});

test("ungroup preserves world geometry; nested children reparent upward", () => {
  const g1 = groupElements(
    docOf(el("a", "mirror", 400, 300), el("b", "mirror", 600, 300), el("c", "mirror", 500, 400)),
    ["a", "b", "c"],
  )!;
  const g2 = groupElements(g1.doc, ["a", "b"])!;
  const rotated = setMountPose(g2.doc, g1.mountId, { angle: 33 });
  const snapshot = rotated.items.map((e) => ({ id: e.id, x: e.x, y: e.y, angle: e.angle }));
  // 解散外层支架：a,b 仍属 M2（M2 升级为根支架），c 自由
  const freed = ungroup(rotated, g1.mountId);
  assert.equal(freed.mounts.length, 1);
  assert.equal(freed.mounts[0].parent, null);
  assert.equal(byId(freed, "a").mount, g2.mountId);
  assert.equal(byId(freed, "c").mount, null);
  for (const e of snapshot) {
    const now = byId(freed, e.id);
    close(now.x, e.x);
    close(now.y, e.y);
    close(now.angle, e.angle);
  }
  // 再解散 M2：全部自由，几何不变
  const flat = ungroup(freed, g2.mountId);
  assert.equal(flat.mounts.length, 0);
  for (const e of snapshot) {
    close(byId(flat, e.id).x, e.x);
    close(byId(flat, e.id).y, e.y);
  }
});

test("removing some members keeps the mount and siblings stable", () => {
  const g = groupElements(
    docOf(
      el("a", "mirror", 400, 300),
      el("b", "mirror", 500, 300),
      el("c", "screen", 700, 300),
    ),
    ["a", "b", "c"],
  )!;
  const tilted = setMountPose(g.doc, g.mountId, { angle: 41 });
  const before = byId(tilted, "c");
  const removed = removeElements(tilted, ["a"]);
  // 支架保留身份，其余成员世界位姿不变
  assert.ok(removed.mounts.some((m) => m.id === g.mountId));
  close(byId(removed, "c").x, before.x);
  close(byId(removed, "c").y, before.y);
  // 删除全部成员后空支架被清理
  const emptied = removeElements(removed, ["b", "c"]);
  assert.equal(emptied.mounts.length, 0);
});

test("v1 flat scenes migrate losslessly and measure identically", () => {
  const v1 = {
    version: 1,
    items: [
      { id: "s", kind: "source", x: 100, y: 300, angle: 0, size: 100, power: 1, rays: 9, spread: 0, wavelength: 550, focal: 150, index: 1.5 },
      { id: "l", kind: "lens", x: 400, y: 300, angle: 90, size: 200, power: 1, rays: 9, spread: 0, wavelength: 550, focal: 150, index: 1.5 },
      { id: "d", kind: "screen", x: 550, y: 300, angle: 90, size: 200, power: 1, rays: 9, spread: 0, wavelength: 550, focal: 150, index: 1.5 },
    ],
  };
  const migrated = migrateDocument(JSON.parse(JSON.stringify(v1)))!;
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.mounts, []);
  for (const e of v1.items) {
    const m = byId(migrated, e.id);
    assert.equal(m.x, e.x);
    assert.equal(m.y, e.y);
    assert.equal(m.angle, e.angle);
    assert.equal(m.mount, null);
  }
  const reference = trace({
    version: 2,
    mounts: [],
    items: migrated.items,
  });
  assert.deepEqual(trace(migrated), reference);
  assert.equal(reference.hits.length, 9);
  assert.ok(reference.hits.every((h) => h.screen === "d"));
});

test("save/load roundtrip of nested scenes reproduces identical measurements", () => {
  // 搭一个嵌套场景：光源+双镜支架（内嵌子支架）+屏
  const g1 = groupElements(
    docOf(
      el("src", "source", 120, 300, { angle: 0, size: 60 }),
      el("m1", "mirror", 400, 300, { angle: -35 }),
      el("m2", "mirror", 400, 120, { angle: 45 }),
      el("scr", "screen", 700, 120, { angle: 0, size: 220 }),
    ),
    ["m1", "m2"],
  )!;
  let doc = g1.doc;
  doc = setMountPivot(doc, g1.mountId, { x: 400, y: 210 });
  doc = setMountPose(doc, g1.mountId, { angle: 12 });
  doc = translateMount(doc, g1.mountId, { x: 25, y: -10 });
  doc = updateElementWorld(doc, "m2", { angle: byId(doc, "m2").angle + 5 });
  doc = toggleLock(doc, g1.mountId);
  doc = normalizeDocument(doc);

  const loaded = migrateDocument(JSON.parse(JSON.stringify(doc)))!;
  assert.deepEqual(loaded, doc);
  const t0 = trace(doc),
    t1 = trace(loaded);
  assert.deepEqual(t1, t0);
  const scr = byId(doc, "scr");
  assert.deepEqual(
    measure(scr, t1.hits, 64),
    measure(scr, t0.hits, 64),
  );
  // 身份稳定：命中仍绑定原接收屏与光源
  assert.ok(t1.hits.every((h) => h.screen === "scr" && h.source === "src"));
});

test("normalize is deterministic and idempotent", () => {
  const g = groupElements(
    docOf(el("a", "mirror", 400, 300), el("b", "prism", 500, 320)),
    ["a", "b"],
  )!;
  const doc = setMountPose(g.doc, g.mountId, { angle: 63.5 });
  assert.deepEqual(normalizeDocument(doc), doc);
});

test("subtree collects nested mounts and their members", () => {
  const g1 = groupElements(
    docOf(el("a", "mirror", 100, 100), el("b", "mirror", 200, 100), el("c", "mirror", 150, 200)),
    ["a", "b", "c"],
  )!;
  const g2 = groupElements(g1.doc, ["a", "b"])!;
  const s = subtree(g2.doc, g1.mountId);
  assert.deepEqual(
    s.elements.map((e) => e.id).sort(),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    s.mounts.map((m) => m.id).sort(),
    [g1.mountId, g2.mountId].sort(),
  );
  // pivotToCentroid 对齐成员质心
  const centered = pivotToCentroid(g2.doc, g1.mountId);
  const pose = mountPose(centered, g1.mountId);
  const members = s.elements.filter((e) => e.mount === g1.mountId);
  close(pose.x, members.reduce((k, e) => k + e.x, 0) / members.length);
});
