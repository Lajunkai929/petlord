import { Button, Input } from "@petlord/ui";
import { Check, Plus, Trash, X } from "@phosphor-icons/react";
import type { FormEvent } from "react";
import type { TodoItem } from "@petlord/plugin-todo";

export function TodoPopover({ items, title, setTitle, onAdd, onComplete, onRemove, onClose }: {
  items: TodoItem[];
  title: string;
  setTitle: (title: string) => void;
  onAdd: (event: FormEvent) => void;
  onComplete: (id: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const remaining = items.filter((item) => !item.completed).length;
  return <aside className="todo-popover"><header><span><strong>今天要做</strong><small>{remaining ? `还有 ${remaining} 项` : "都完成啦"}</small></span><Button type="text" size="small" icon={<X size={15} />} htmlType="button" onClick={onClose} aria-label="关闭待办" /></header><form onSubmit={onAdd}><label htmlFor="pet-todo-title">新待办</label><div><Input id="pet-todo-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="写下一件事" /><Button type="primary" icon={<Plus size={15} weight="bold" />} htmlType="submit" aria-label="添加待办" /></div></form><div className="todo-popover-list">{items.length === 0 ? <p>现在没有待办。</p> : items.map((item) => <article className={item.completed ? "is-done" : ""} key={item.id}><Button type="text" size="small" icon={<Check size={13} weight="bold" />} htmlType="button" onClick={() => onComplete(item.id)} aria-label={`完成 ${item.title}`} /><span>{item.title}</span><Button type="text" size="small" danger icon={<Trash size={14} />} htmlType="button" onClick={() => onRemove(item.id)} aria-label={`删除 ${item.title}`} /></article>)}</div></aside>;
}
