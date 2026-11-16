import { Group, Trash2 } from "lucide-react";

export function SelectionPanel({
  count,
  onGroup,
  onRemove,
}: {
  count: number;
  onGroup: () => void;
  onRemove: () => void;
}) {
  return (
    <section className="inspector">
      <div className="section-title">
        多选器件 <span>{count} 个</span>
      </div>
      <p className="empty multi-empty">
        已选中 {count} 个器件
        <br />
        Shift+点击可增减选择
      </p>
      <button className="save-button group-button" onClick={onGroup}>
        <Group size={14} />
        建立刚性支架
      </button>
      <p className="muted mount-hint">
        支架内器件保持相对几何，整体移动/旋转； 局部参数可锁定。
      </p>
      <button className="delete" onClick={onRemove}>
        <Trash2 size={14} />
        删除所选器件
      </button>
    </section>
  );
}
