import { Crosshair, Layers, Lock, LockOpen, Ungroup } from "lucide-react";
import type { LabDocument, Mount } from "../../../shared/document";
import { wrapAngle } from "../../../shared/geometry";
import { mountPose, subtree } from "../lib/mounts";

export function MountPanel({
  doc,
  mount,
  placingPivot,
  onTogglePick,
  onAngle,
  onPivot,
  onResetPivot,
  onToggleLock,
  onUngroup,
}: {
  doc: LabDocument;
  mount: Mount;
  placingPivot: boolean;
  onTogglePick: () => void;
  onAngle: (angle: number) => void;
  onPivot: (p: { x: number; y: number }) => void;
  onResetPivot: () => void;
  onToggleLock: () => void;
  onUngroup: () => void;
}) {
  const pose = mountPose(doc, mount.id);
  const members = subtree(doc, mount.id).elements;
  const children = doc.mounts.filter((m) => m.parent === mount.id).length;
  const angle = wrapAngle(mount.angle);
  return (
    <section className="inspector mount-panel">
      <div className="section-title">
        刚性支架 <Layers size={15} />
      </div>
      <div className="selected-name">
        <i />
        {mount.name}
        <span>
          {members.length} 个器件{children ? ` · ${children} 个子支架` : ""}
        </span>
      </div>
      <div className="coord-caption">
        铰接旋转中心 <small>世界坐标</small>
      </div>
      <div className="coordinates">
        {(["x", "y"] as const).map((key) => (
          <label key={key}>
            {key.toUpperCase()}
            <input
              aria-label={"铰接中心 " + key}
              type="number"
              value={Math.round(pose[key])}
              onChange={(e) =>
                onPivot({
                  x: key === "x" ? Number(e.target.value) : pose.x,
                  y: key === "y" ? Number(e.target.value) : pose.y,
                })
              }
            />
            <small>mm</small>
          </label>
        ))}
      </div>
      <div className="pivot-actions">
        <button
          className={placingPivot ? "enabled" : ""}
          onClick={onTogglePick}
          title="在画布上点击设置铰接中心"
        >
          <Crosshair size={13} />
          {placingPivot ? "点击画布设置…" : "画布拾取"}
        </button>
        <button onClick={onResetPivot} title="铰接中心对齐到成员质心">
          对齐质心
        </button>
      </div>
      <label className="parameter">
        <span>
          整体旋转
          <b>
            {angle.toFixed(0)} <small>°</small>
          </b>
        </span>
        <input
          aria-label="整体旋转"
          type="range"
          min={-180}
          max={180}
          step={1}
          value={angle}
          onChange={(e) => onAngle(Number(e.target.value))}
        />
        <div className="range-label">
          <span>-180</span>
          <span>180</span>
        </div>
      </label>
      <button className="lock-toggle" onClick={onToggleLock}>
        {mount.locked ? <Lock size={13} /> : <LockOpen size={13} />}
        {mount.locked ? "局部参数已锁定" : "锁定局部参数"}
      </button>
      <p className="muted mount-hint">
        拖动成员整体移动 · Alt+拖动拆出器件
        <br />
        {mount.locked ? "已锁定：仅可整体变换" : "局部坐标可在器件属性中编辑"}
      </p>
      <button className="delete" onClick={onUngroup}>
        <Ungroup size={14} />
        解散支架
      </button>
    </section>
  );
}
