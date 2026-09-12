import { StudioFrame } from "@/components/StudioFrame";
import { AgentForm } from "@/components/AgentForm";

export default function NewAgentPage() {
  return (
    <StudioFrame
      title="New agent"
      subtitle="Give them a name, a persona, and the OpenRouter model they should think with."
    >
      <AgentForm />
    </StudioFrame>
  );
}
