import { StudioFrame } from "@/components/StudioFrame";
import { SettingsForm } from "@/components/SettingsForm";

export default function SettingsPage() {
  return (
    <StudioFrame
      title="Studio settings"
      subtitle="Connect OpenRouter and grant the folders this server may touch."
    >
      <SettingsForm />
    </StudioFrame>
  );
}
