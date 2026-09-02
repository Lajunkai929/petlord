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
  return <aside className="todo-popover"><header><span><strong>今天要做</strong><small>{remaining ? `还有 ${remaining} 项` : "都完成啦"}</small></span><button type="button" onClick={onClose} aria-label="关闭待办"><X size={15} /></button></header><form onSubmit={onAdd}><label htmlFor="pet-todo-title">新待办</label><div><input id="pet-todo-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="写下一件事" /><button type="submit" aria-label="添加待办"><Plus size={15} weight="bold" /></button></div></form><div className="todo-popover-list">{items.length === 0 ? <p>现在没有待办。</p> : items.map((item) => <article className={item.completed ? "is-done" : ""} key={item.id}><button type="button" onClick={() => onComplete(item.id)} aria-label={`完成 ${item.title}`}><Check size={13} weight="bold" /></button><span>{item.title}</span><button type="button" onClick={() => onRemove(item.id)} aria-label={`删除 ${item.title}`}><Trash size={14} /></button></article>)}</div></aside>;
}
