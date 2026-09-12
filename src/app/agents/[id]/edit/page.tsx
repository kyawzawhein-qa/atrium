"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { StudioFrame } from "@/components/StudioFrame";
import { AgentForm, type AgentDraft } from "@/components/AgentForm";

export default function EditAgentPage() {
  const params = useParams<{ id: string }>();
  const [agent, setAgent] = useState<AgentDraft | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    void (async () => {
      const res = await fetch(`/api/agents/${params.id}`);
      if (!res.ok) {
        setMissing(true);
        return;
      }
      const data = await res.json();
      setAgent(data.agent);
    })();
  }, [params.id]);

  return (
    <StudioFrame
      title="Edit agent"
      subtitle="Update name, persona, or model. Description is the system prompt."
    >
      {missing && (
        <p className="text-sm text-rose-200">That agent was not found.</p>
      )}
      {!missing && !agent && (
        <p className="text-sm text-ink-mist">Loading agent…</p>
      )}
      {agent && <AgentForm initial={agent} />}
    </StudioFrame>
  );
}
