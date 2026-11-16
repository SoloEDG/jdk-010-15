import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Element, LabDocument, Point } from "../../../shared/document";
import { labels } from "../../../shared/document";
import { rot } from "../../../shared/geometry";
import { worldPoint } from "../lib/coordinates";
import {
  mountOf,
  mountPose,
  subtree,
  topMountOf,
  type Pose,
} from "../lib/mounts";
import { DeviceGlyph } from "./DeviceGlyph";

const clampX = (x: number) => Math.max(20, Math.min(980, x));
const clampY = (y: number) => Math.max(20, Math.min(580, y));

type Drag =
  | {
      kind: "element";
      id: string;
      dx: number;
      dy: number;
      x: number;
      y: number;
      detach: boolean;
    }
  | {
      kind: "mount";
      id: string;
      dx: number;
      dy: number;
      ox: number;
      oy: number;
      x: number;
      y: number;
    }
  | {
      kind: "rotate";
      id: string;
      cx: number;
      cy: number;
      a0: number;
      start: number;
      angle: number;
    };

export function Bench({
  doc,
  selection,
  selectedMount,
  placingPivot,
  onSelect,
  onUpdate,
  onNudge,
  onDragMount,
  onRotateMount,
  onDetach,
  onPickPivot,
  children,
  grid,
}: {
  doc: LabDocument;
  selection: string[];
  selectedMount: string | null;
  placingPivot: boolean;
  onSelect: (id: string | null, additive: boolean) => void;
  onUpdate: (id: string, patch: Partial<Element>) => void;
  onNudge: (id: string, dx: number, dy: number) => void;
  onDragMount: (id: string, d: Point) => void;
  onRotateMount: (id: string, angle: number) => void;
  onDetach: (id: string, at: Point) => void;
  onPickPivot: (p: Point) => void;
  children: ReactNode;
  grid: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  // Esc 取消未提交的拖动 —— 预览不落地，不产生撤销步
  useEffect(() => {
    if (!drag) return;
    const cancel = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setDrag(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [drag]);

  // 拖动期间的预览位姿：支架整体变换作用于全部成员，提交前仅用于渲染
  const preview = new Map<string, Pose>();
  if (drag?.kind === "element") {
    const el = doc.items.find((e) => e.id === drag.id);
    if (el) preview.set(el.id, { x: drag.x, y: drag.y, angle: el.angle });
  } else if (drag?.kind === "mount") {
    const d = { x: drag.x - drag.ox, y: drag.y - drag.oy };
    for (const e of subtree(doc, drag.id).elements)
      preview.set(e.id, { x: e.x + d.x, y: e.y + d.y, angle: e.angle });
  } else if (drag?.kind === "rotate") {
    const delta = drag.angle - drag.a0;
    const c = { x: drag.cx, y: drag.cy };
    for (const e of subtree(doc, drag.id).elements) {
      const p = rot({ x: e.x - c.x, y: e.y - c.y }, delta);
      preview.set(e.id, { x: c.x + p.x, y: c.y + p.y, angle: e.angle + delta });
    }
  }

  const mount = doc.mounts.find((m) => m.id === selectedMount) ?? null;
  let mountView: {
    pose: Pose;
    radius: number;
    members: Element[];
  } | null = null;
  if (mount) {
    const pose = mountPose(doc, mount.id);
    const members = subtree(doc, mount.id).elements;
    if (drag?.kind === "mount" && drag.id === mount.id) {
      pose.x = drag.x;
      pose.y = drag.y;
    }
    if (drag?.kind === "rotate" && drag.id === mount.id) {
      pose.x = drag.cx;
      pose.y = drag.cy;
    }
    const radius = members.length
      ? Math.max(
          46,
          ...members.map((e) => {
            const p = preview.get(e.id) ?? e;
            return Math.hypot(p.x - pose.x, p.y - pose.y) + e.size / 2 + 14;
          }),
        )
      : 46;
    mountView = { pose, radius, members };
  }

  return (
    <svg
      ref={svg}
      className={"bench-svg" + (placingPivot ? " placing-pivot" : "")}
      viewBox="0 0 1000 600"
      role="img"
      aria-label="交互式光学实验台"
      onPointerMove={(ev) => {
        if (!drag || !svg.current) return;
        const p = worldPoint(svg.current, ev.clientX, ev.clientY);
        if (drag.kind === "element")
          setDrag({
            ...drag,
            x: clampX(p.x + drag.dx),
            y: clampY(p.y + drag.dy),
          });
        else if (drag.kind === "mount")
          setDrag({ ...drag, x: p.x + drag.dx, y: p.y + drag.dy });
        else {
          const pointer =
            (Math.atan2(p.y - drag.cy, p.x - drag.cx) * 180) / Math.PI;
          let angle = drag.a0 + pointer - drag.start;
          if (ev.shiftKey) angle = Math.round(angle / 15) * 15;
          setDrag({ ...drag, angle });
        }
      }}
      onPointerUp={() => {
        if (!drag) return;
        if (drag.kind === "element")
          if (drag.detach) onDetach(drag.id, { x: drag.x, y: drag.y });
          else onUpdate(drag.id, { x: clampX(drag.x), y: clampY(drag.y) });
        else if (drag.kind === "mount")
          onDragMount(drag.id, { x: drag.x - drag.ox, y: drag.y - drag.oy });
        else onRotateMount(drag.id, drag.angle);
        setDrag(null);
      }}
      onPointerCancel={() => setDrag(null)}
      onPointerDown={(ev) => {
        if (ev.target !== ev.currentTarget || !svg.current) return;
        if (placingPivot) {
          onPickPivot(worldPoint(svg.current, ev.clientX, ev.clientY));
          return;
        }
        onSelect(null, false);
      }}
    >
      <defs>
        <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".9" fill="#2e3a45" />
        </pattern>
        <radialGradient id="ambience">
          <stop stopColor="#17232b" />
          <stop offset="1" stopColor="#11181f" />
        </radialGradient>
      </defs>
      <rect
        width="1000"
        height="600"
        fill="url(#ambience)"
        pointerEvents="none"
      />
      {grid && (
        <rect
          width="1000"
          height="600"
          fill="url(#grid)"
          pointerEvents="none"
        />
      )}
      <path
        d="M0 300H1000 M500 0V600"
        stroke="#2a3843"
        strokeDasharray="5 8"
        pointerEvents="none"
      />
      {children}
      {mountView && mount && (
        <g pointerEvents="none">
          <circle
            cx={mountView.pose.x}
            cy={mountView.pose.y}
            r={mountView.radius}
            fill="none"
            stroke="#f5c778"
            strokeDasharray="6 7"
            opacity=".4"
          />
          {mountView.members.map((e) => {
            const p = preview.get(e.id) ?? e;
            return (
              <line
                key={e.id}
                x1={mountView.pose.x}
                y1={mountView.pose.y}
                x2={p.x}
                y2={p.y}
                stroke="#f5c778"
                opacity=".14"
              />
            );
          })}
          <g
            stroke="#f5c778"
            strokeWidth="1.6"
            opacity=".9"
            className="pivot-cross"
          >
            <circle
              cx={mountView.pose.x}
              cy={mountView.pose.y}
              r="6"
              fill="none"
            />
            <path
              d={`M${mountView.pose.x - 11} ${mountView.pose.y}H${mountView.pose.x + 11} M${mountView.pose.x} ${mountView.pose.y - 11}V${mountView.pose.y + 11}`}
            />
          </g>
        </g>
      )}
      {doc.items.map((e, i) => {
        const p = preview.get(e.id);
        const shown = p ? { ...e, x: p.x, y: p.y, angle: p.angle } : e;
        const hot = drag !== null && p !== undefined;
        return (
          <g
            key={e.id}
            tabIndex={0}
            role="button"
            aria-label={labels[e.kind] + " " + (i + 1)}
            className="device"
            onKeyDown={(ev) => {
              if (ev.key === "Enter") onSelect(e.id, false);
              if (ev.key.startsWith("Arrow")) {
                ev.preventDefault();
                onNudge(
                  e.id,
                  ev.key === "ArrowRight" ? 5 : ev.key === "ArrowLeft" ? -5 : 0,
                  ev.key === "ArrowDown" ? 5 : ev.key === "ArrowUp" ? -5 : 0,
                );
              }
            }}
            onPointerDown={(ev) => {
              ev.stopPropagation();
              if (ev.shiftKey) {
                onSelect(e.id, true);
                return;
              }
              ev.currentTarget.setPointerCapture(ev.pointerId);
              onSelect(e.id, false);
              if (!svg.current) return;
              const p0 = worldPoint(svg.current, ev.clientX, ev.clientY);
              const direct = mountOf(doc, e.id);
              // Alt+拖动：从支架拆出单个器件（锁定支架禁止）
              if (direct && ev.altKey) {
                if (!direct.locked)
                  setDrag({
                    kind: "element",
                    id: e.id,
                    dx: e.x - p0.x,
                    dy: e.y - p0.y,
                    x: e.x,
                    y: e.y,
                    detach: true,
                  });
                return;
              }
              // 支架成员：拖动 = 整体移动最外层支架，预览影响范围
              const top = topMountOf(doc, e.id);
              if (top) {
                const pose = mountPose(doc, top.id);
                setDrag({
                  kind: "mount",
                  id: top.id,
                  dx: pose.x - p0.x,
                  dy: pose.y - p0.y,
                  ox: pose.x,
                  oy: pose.y,
                  x: pose.x,
                  y: pose.y,
                });
              } else {
                setDrag({
                  kind: "element",
                  id: e.id,
                  dx: e.x - p0.x,
                  dy: e.y - p0.y,
                  x: e.x,
                  y: e.y,
                  detach: false,
                });
              }
            }}
          >
            <circle
              cx={shown.x}
              cy={shown.y}
              r={Math.max(24, e.size * 0.55)}
              fill="transparent"
            />
            {hot && (
              <circle
                cx={shown.x}
                cy={shown.y}
                r={Math.max(28, e.size / 2 + 18)}
                fill="none"
                stroke="#f5c778"
                strokeDasharray="4 5"
                strokeWidth="1.4"
                opacity=".8"
              />
            )}
            <DeviceGlyph e={shown} selected={selection.includes(e.id)} />
            <text
              x={shown.x}
              y={shown.y + e.size / 2 + 28}
              textAnchor="middle"
              fill="#8494a3"
              fontSize="12"
              pointerEvents="none"
            >
              {labels[e.kind]} {String(i + 1).padStart(2, "0")}
            </text>
          </g>
        );
      })}
      {mountView && mount && (
        <g
          className="rotate-handle"
          tabIndex={0}
          role="button"
          aria-label={`旋转${mount.name}`}
          onKeyDown={(ev) => {
            if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
              ev.preventDefault();
              onRotateMount(
                mount.id,
                mount.angle + (ev.key === "ArrowRight" ? 5 : -5),
              );
            }
          }}
          onPointerDown={(ev) => {
            ev.stopPropagation();
            ev.currentTarget.setPointerCapture(ev.pointerId);
            if (!svg.current || !mountView) return;
            const p = worldPoint(svg.current, ev.clientX, ev.clientY);
            setDrag({
              kind: "rotate",
              id: mount.id,
              cx: mountView.pose.x,
              cy: mountView.pose.y,
              a0: mount.angle,
              start: (Math.atan2(p.y - mountView.pose.y, p.x - mountView.pose.x) * 180) / Math.PI,
              angle: mount.angle,
            });
          }}
        >
          <line
            x1={mountView.pose.x}
            y1={mountView.pose.y}
            x2={mountView.pose.x}
            y2={mountView.pose.y - mountView.radius - 18}
            stroke="#f5c778"
            strokeDasharray="3 5"
            opacity=".5"
          />
          <circle
            cx={mountView.pose.x}
            cy={mountView.pose.y - mountView.radius - 18}
            r="8"
            fill="#2b2f1f"
            stroke="#f5c778"
            strokeWidth="1.6"
            className="handle-dot"
          />
          <path
            d={`M${mountView.pose.x - 3.5} ${mountView.pose.y - mountView.radius - 21} a4.5 4.5 0 1 1 3.5 4`}
            fill="none"
            stroke="#f5c778"
            strokeWidth="1.4"
            pointerEvents="none"
          />
        </g>
      )}
      {drag && (
        <g pointerEvents="none" className="drag-badge">
          <rect x="290" y="12" width="420" height="26" rx="6" />
          <text x="500" y="29" textAnchor="middle">
            {drag.kind === "rotate"
              ? `整体旋转 ${subtree(doc, drag.id).elements.length} 个器件 · ${drag.angle.toFixed(0)}° · 松开提交 · Esc 取消`
              : drag.kind === "mount"
                ? `整体移动 ${subtree(doc, drag.id).elements.length} 个器件 · 松开提交 · Esc 取消`
                : drag.detach
                  ? "拆出器件 · 松开提交 · Esc 取消"
                  : "移动器件 · 松开提交 · Esc 取消"}
          </text>
        </g>
      )}
      {placingPivot && !drag && (
        <g pointerEvents="none" className="drag-badge">
          <rect x="310" y="12" width="380" height="26" rx="6" />
          <text x="500" y="29" textAnchor="middle">
            点击画布空白处，设置铰接旋转中心 · Esc 取消
          </text>
        </g>
      )}
      <text x="18" y="580" fill="#566778" fontSize="11">
        0
      </text>
      <text x="940" y="580" fill="#566778" fontSize="11">
        1000 mm
      </text>
    </svg>
  );
}
