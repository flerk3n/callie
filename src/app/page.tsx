import { auth } from "@/auth";
import { VoiceExperience } from "@/components/voice-experience";

export default async function Home() {
  const session = await auth();

  return <VoiceExperience user={session?.user} />;
}
