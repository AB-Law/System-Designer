import { useState } from "react";
import { Badge } from "../../ui/Badge";
import { Card } from "../../ui/Card";
import { ProgressBar } from "../../ui/ProgressBar";
import { ScoreRing } from "../../ui/ScoreRing";
import { Tabs } from "../../ui/Tabs";
import { toast } from "../../ui/Toast";
import { Button } from "../../ui/Button";

export default function Screen({ rest }: { rest: string }) {
  const [tab, setTab] = useState("kit");
  return (
    <Card title="Sandbox module" actions={<Badge tone="gold">dev only</Badge>}>
      <p>
        Route rest: <code>{rest || "(none)"}</code>
      </p>
      <Tabs
        label="Sandbox"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "kit", label: "Kit" },
          { id: "more", label: "More" },
        ]}
      />
      <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "16px 0" }}>
        <ScoreRing value={72} />
        <div style={{ flex: 1 }}>
          <ProgressBar value={40} label="Example" />
        </div>
        <Button variant="primary" onClick={() => toast("Hello from the kit", "good")}>
          Toast
        </Button>
      </div>
    </Card>
  );
}
