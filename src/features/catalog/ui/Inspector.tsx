import { Trash2, SlidersHorizontal, Layers, Lock } from "lucide-react";
import { labels, type Element, type Mount } from "../../../shared/document";
import { wrapAngle } from "../../../shared/geometry";
import { parameters } from "../lib/parameters";

function Coord({
  name,
  unit,
  value,
  disabled,
  onCommit,
}: {
  name: string;
  unit: string;
  value: number;
  disabled?: boolean;
  onCommit: (n: number) => void;
}) {
  return (
    <label className={disabled ? "disabled" : ""}>
      {name}
      <input
        aria-label={name}
        type="number"
        disabled={disabled}
        value={Math.round(value)}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onCommit(n);
        }}
      />
      <small>{unit}</small>
    </label>
  );
}

export function Inspector({
  element,
  mount,
  onUpdate,
  onUpdateWorld,
  onUpdateLocal,
  onSelectMount,
  onRemove,
}: {
  element?: Element;
  mount: Mount | null;
  onUpdate: (patch: Partial<Element>) => void;
  onUpdateWorld: (patch: Partial<{ x: number; y: number; angle: number }>) => void;
  onUpdateLocal: (
    patch: Partial<{ lx: number; ly: number; langle: number }>,
  ) => void;
  onSelectMount: (id: string) => void;
  onRemove: () => void;
}) {
  if (!element)
    return (
      <section className="inspector">
        <div className="section-title">
          器件属性 <SlidersHorizontal size={15} />
        </div>
        <p className="empty">
          选择实验台上的器件
          <br />
          查看并调整光学参数
        </p>
      </section>
    );
  const locked = mount?.locked ?? false;
  const params = parameters(element).filter(
    (p) => p.key !== "angle" || !mount,
  );
  return (
    <section className="inspector">
      <div className="section-title">
        器件属性 <SlidersHorizontal size={15} />
      </div>
      <div className="selected-name">
        <i />
        {labels[element.kind]}
        <span>已选中</span>
      </div>
      {mount && (
        <button className="mount-badge" onClick={() => onSelectMount(mount.id)}>
          <Layers size={12} />
          {mount.name}
          {locked && <Lock size={11} />}
          <span>查看支架</span>
        </button>
      )}
      <div className="coord-caption">
        世界坐标 <small>实验台系</small>
      </div>
      <div className="coordinates">
        <Coord
          name="X"
          unit="mm"
          value={element.x}
          disabled={locked}
          onCommit={(n) => onUpdateWorld({ x: Math.max(20, Math.min(980, n)) })}
        />
        <Coord
          name="Y"
          unit="mm"
          value={element.y}
          disabled={locked}
          onCommit={(n) => onUpdateWorld({ y: Math.max(20, Math.min(580, n)) })}
        />
        {mount && (
          <Coord
            name="角度"
            unit="°"
            value={wrapAngle(element.angle)}
            disabled={locked}
            onCommit={(n) => onUpdateWorld({ angle: n })}
          />
        )}
      </div>
      {mount && (
        <>
          <div className="coord-caption">
            局部坐标 <small>相对{mount.name}铰接中心</small>
            {locked && (
              <em>
                <Lock size={10} /> 已锁定
              </em>
            )}
          </div>
          <div className="coordinates">
            <Coord
              name="LX"
              unit="mm"
              value={element.lx}
              disabled={locked}
              onCommit={(n) => onUpdateLocal({ lx: n })}
            />
            <Coord
              name="LY"
              unit="mm"
              value={element.ly}
              disabled={locked}
              onCommit={(n) => onUpdateLocal({ ly: n })}
            />
            <Coord
              name="角度"
              unit="°"
              value={wrapAngle(element.langle)}
              disabled={locked}
              onCommit={(n) => onUpdateLocal({ langle: n })}
            />
          </div>
        </>
      )}
      {params.map((p) => (
        <label className="parameter" key={p.key}>
          <span>
            {p.label}
            <b>
              {Number(element[p.key]).toFixed(p.step < 1 ? 2 : 0)}{" "}
              <small>{p.unit}</small>
            </b>
          </span>
          <input
            aria-label={p.label}
            type="range"
            min={p.min}
            max={p.max}
            step={p.step}
            value={Number(element[p.key])}
            onChange={(e) =>
              onUpdate({
                [p.key]:
                  p.key === "focal" && Number(e.target.value) === 0
                    ? 10
                    : Number(e.target.value),
              })
            }
          />
          <div className="range-label">
            <span>{p.min}</span>
            <span>{p.max}</span>
          </div>
        </label>
      ))}
      <button className="delete" onClick={onRemove}>
        <Trash2 size={14} />
        移除器件
      </button>
    </section>
  );
}
