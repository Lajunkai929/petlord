const absent = Symbol("absent");
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter(key => (value as Record<string, unknown>)[key] !== undefined).map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  return value;
}
export function workspaceValuesEqual(left: unknown, right: unknown): boolean {
  return left === right || JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function keyed(values: unknown[]): values is Array<{ id: string }> { return values.every(item => object(item) && typeof item.id === "string"); }

/** Three-way merge of user-editable records; server-owned job feedback wins. */
export function mergeWorkspaceChanges<T>(base: unknown, local: T, remote: unknown): { value: T; conflicts: string[] } {
  const conflicts: string[] = [];
  function merge(before: unknown, ours: unknown, theirs: unknown, path: string): unknown {
    if (workspaceValuesEqual(ours, before)) return theirs;
    if (workspaceValuesEqual(theirs, before) || workspaceValuesEqual(ours, theirs)) return ours;
    if (path === "updatedAt" && typeof ours === "string" && typeof theirs === "string") return ours > theirs ? ours : theirs;
    if (path.startsWith("jobs[") && theirs !== absent) return theirs;
    if (Array.isArray(ours) && Array.isArray(theirs) && keyed([...ours, ...theirs]) && (before === absent || Array.isArray(before) && keyed(before))) {
      const old = new Map((Array.isArray(before) ? before : []).map(item => [item.id, item]));
      const left = new Map(ours.map(item => [item.id, item])), right = new Map(theirs.map(item => [item.id, item]));
      const priorIds = [...old.keys()], ourIds = [...left.keys()], theirIds = [...right.keys()];
      const shared = new Set(priorIds.filter(id => left.has(id) && right.has(id)));
      const order = (ids: string[]) => ids.filter(id => shared.has(id));
      const localReordered = !workspaceValuesEqual(order(ourIds), order(priorIds));
      const remoteReordered = !workspaceValuesEqual(order(theirIds), order(priorIds));
      if (localReordered && remoteReordered && !workspaceValuesEqual(order(ourIds), order(theirIds))) conflicts.push(`${path}.$order`);
      const ids = [...(localReordered ? ourIds : theirIds)];
      const secondary = localReordered ? theirIds : ourIds;
      for (let index = 0; index < secondary.length; index++) {
        const id = secondary[index];
        if (ids.includes(id)) continue;
        const next = secondary.slice(index + 1).find(candidate => ids.includes(candidate));
        ids.splice(next ? ids.indexOf(next) : ids.length, 0, id);
      }
      for (const id of priorIds) if (!ids.includes(id)) ids.push(id);
      return ids.flatMap(id => {
        const value = merge(old.get(id) ?? absent, left.get(id) ?? absent, right.get(id) ?? absent, `${path}[${id}]`);
        return value === absent ? [] : [value];
      });
    }
    if (object(ours) && object(theirs) && (object(before) || before === absent)) {
      const prior = object(before) ? before : {};
      const keys = new Set([...Object.keys(prior), ...Object.keys(ours), ...Object.keys(theirs)]);
      return Object.fromEntries([...keys].flatMap(key => {
        const value = merge(Object.hasOwn(prior, key) ? prior[key] : absent, Object.hasOwn(ours, key) ? ours[key] : absent, Object.hasOwn(theirs, key) ? theirs[key] : absent, path ? `${path}.${key}` : key);
        return value === absent ? [] : [[key, value]];
      }));
    }
    conflicts.push(path || "record");
    return ours;
  }
  return { value: merge(base, local, remote, "") as T, conflicts };
}
