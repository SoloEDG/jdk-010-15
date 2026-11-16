export type Kind = "source" | "mirror" | "lens" | "prism" | "screen";
export interface Point {
  x: number;
  y: number;
}
export interface Element extends Point {
  id: string;
  kind: Kind;
  angle: number;
  size: number;
  power: number;
  rays: number;
  spread: number;
  wavelength: number;
  focal: number;
  index: number;
  /** 所属支架 id；null 表示自由器件。x/y/angle 始终是世界坐标缓存。 */
  mount: string | null;
  /** 支架局部坐标（仅 mount 非空时有效）：相对支架铰接中心、未旋转框架。 */
  lx: number;
  ly: number;
  langle: number;
}
export interface Mount {
  id: string;
  name: string;
  /** 父支架 id（嵌套）；null 表示直接位于世界坐标系。 */
  parent: string | null;
  /** 铰接旋转中心，在父支架局部系（无父时为世界系）中的坐标。 */
  px: number;
  py: number;
  /** 绕铰接中心的旋转角，相对父系。 */
  angle: number;
  /** 锁定成员的局部参数，防止误改支架内部几何。 */
  locked: boolean;
}
export interface LabDocument {
  version: 2;
  items: Element[];
  mounts: Mount[];
}
/** 旧版平面场景（无支架），加载时迁移。 */
export interface LabDocumentV1 {
  version: 1;
  items: Omit<Element, "mount" | "lx" | "ly" | "langle">[];
}
export interface Segment {
  from: Point;
  to: Point;
  power: number;
  wavelength: number;
  source: string;
}
export interface ScreenHit {
  screen: string;
  position: number;
  power: number;
  wavelength: number;
  source: string;
}
export interface TraceResult {
  segments: Segment[];
  hits: ScreenHit[];
  truncated: number;
}
export const labels: Record<Kind, string> = {
  source: "光源",
  mirror: "平面镜",
  lens: "凸透镜",
  prism: "三棱镜",
  screen: "接收屏",
};
