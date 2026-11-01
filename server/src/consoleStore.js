// Rule 13 for the AgentCore console: one ConsoleLab per workspace and vertical, kept in memory, bounded in workspaces and age. A new workspace is REFUSED at
// the cap (nothing is evicted, so a flood of made-up ids cannot throw another visitor's lab away); an idle one expires after an hour. Reads never create one.
import { ConsoleLab } from './consoleLab.js';
import { refuse } from './errors.js';

export function createConsoleStore({ max = 500, ttlMs = 60 * 60 * 1000, now = Date.now } = {}) {
  const map = new Map(); // workspace id -> { labs: Map(vertical -> ConsoleLab), at }
  const sweep = () => { const t = now(); for (const [id, v] of map) if (t - v.at > ttlMs) map.delete(id); };
  return {
    /** The lab for a workspace and vertical, created on first WRITE. Refuses (429) a new workspace at the cap. */
    lab(id, vertical, cast) {
      sweep();
      if (!map.has(id) && map.size >= max) throw refuse('too_many_workspaces', 'too many workspaces are active; an idle one expires after an hour', 429);
      const v = map.get(id) || { labs: new Map(), at: 0 };
      v.at = now(); map.delete(id); map.set(id, v);
      if (!v.labs.has(vertical)) v.labs.set(vertical, new ConsoleLab(cast));
      return v.labs.get(vertical);
    },
    /** The existing lab, or a fresh unstored one (a read must not create state). */
    peek(id, vertical, cast) { sweep(); return map.get(id)?.labs.get(vertical) || new ConsoleLab(cast); },
    reset(id) { map.delete(id); },
    size() { sweep(); return map.size; },
  };
}
