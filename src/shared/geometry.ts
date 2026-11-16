import type { Point, Element } from "./document";
export const add = (a: Point, b: Point): Point => ({
  x: a.x + b.x,
  y: a.y + b.y,
});
export const sub = (a: Point, b: Point): Point => ({
  x: a.x - b.x,
  y: a.y - b.y,
});
export const mul = (a: Point, n: number): Point => ({ x: a.x * n, y: a.y * n });
export const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
export const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
export const norm = (a: Point) => {
  const l = Math.hypot(a.x, a.y);
  return l ? mul(a, 1 / l) : { x: 1, y: 0 };
};
export const direction = (angle: number) => ({
  x: Math.cos((angle * Math.PI) / 180),
  y: Math.sin((angle * Math.PI) / 180),
});
/** 绕原点旋转 p（角度制，逆时针为正）。 */
export const rot = (p: Point, angle: number): Point => {
  const c = Math.cos((angle * Math.PI) / 180),
    s = Math.sin((angle * Math.PI) / 180);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};
/** 把角度规范到 (-180, 180]，仅用于显示与输入。 */
export const wrapAngle = (a: number) => {
  const w = ((((a + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
};
export function endpoints(e: Element): [Point, Point] {
  const t = mul(direction(e.angle), e.size / 2);
  return [sub(e, t), add(e, t)];
}
export function intersect(o: Point, d: Point, a: Point, b: Point) {
  const edge = sub(b, a),
    den = cross(d, edge);
  if (Math.abs(den) < 1e-9) return null;
  const v = sub(a, o),
    t = cross(v, edge) / den,
    u = cross(v, d) / den;
  return t > 0.001 && u >= 0 && u <= 1
    ? { t, point: add(o, mul(d, t)), normal: norm({ x: -edge.y, y: edge.x }) }
    : null;
}
export function prismVertices(e: Element): Point[] {
  return [0, 120, 240].map((a) =>
    add(e, mul(direction(e.angle + a), e.size * 0.65)),
  );
}
