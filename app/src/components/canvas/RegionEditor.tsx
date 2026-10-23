import { REGIONS, REGION_LABELS, copyRegions, regionId, regionLabel, rtt } from "../../sim/regions";
import { useProblem, useStore } from "../../store";

/** Where a block runs, and (for a database) which other regions hold a copy that serves reads. Only shown when the problem has users in several regions. */
export function RegionEditor({ nodeId }: { nodeId: string }) {
  const problem = useProblem();
  const node = useStore((s) => s.nodes.find((n) => n.id === nodeId));
  const setCfg = useStore((s) => s.setCfg);
  if (!problem?.regions || !node) return null;
  const cfg = node.data.cfg;
  const home = regionId(problem.regions.home);
  const here = regionId(cfg.region, home);
  const isDb = node.data.blockId === "database";
  const copies = copyRegions(cfg, here);

  return (
    <div className="sec region-ed">
      <div className="sec-h static">Region</div>
      <div className="col">
        <label htmlFor="rg-here">Runs in</label>
        <select id="rg-here" value={regionLabel(here)} onChange={(e) => setCfg(nodeId, "region", e.target.value)}>
          {REGION_LABELS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </div>
      {isDb && (
        <>
          <label className="dm-label">Also keeps a copy in</label>
          {REGIONS.filter((r) => r.id !== here).map((r) => (
            <label className="rg-copy" key={r.id}>
              <input
                type="checkbox"
                checked={copies.includes(r.id)}
                onChange={() =>
                  setCfg(
                    nodeId,
                    "replicaRegions",
                    (copies.includes(r.id) ? copies.filter((x) => x !== r.id) : [...copies, r.id]).map(regionLabel),
                  )
                }
              />
              <b>{r.label}</b>
              <em>{rtt(here, r.id)} ms away</em>
            </label>
          ))}
          <small className="muted">A copy serves reads in its region and is another node to pay for. </small>
          <small className="muted">
            Writes always go to the primary in {regionLabel(here)}, so they are slower for people elsewhere. If that region goes down, a
            copy in another region takes over.
          </small>
        </>
      )}
      {!isDb && (
        <small className="muted">
          A call to a block in another region adds the round-trip time between them. Callers prefer a block in the same region as their
          users.
        </small>
      )}
    </div>
  );
}
