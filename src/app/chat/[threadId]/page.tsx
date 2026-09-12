import { AppShell } from "@/components/AppShell";

type Props = { params: Promise<{ threadId: string }> };

export default async function ThreadPage({ params }: Props) {
  const { threadId } = await params;
  return <AppShell initialThreadId={threadId} />;
}
