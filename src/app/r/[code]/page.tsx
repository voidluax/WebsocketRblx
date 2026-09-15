import type { Metadata } from "next";
import { ChatRoom } from "@/components/chat-room";

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  return { title: code.toUpperCase() };
}

export default async function RoomPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const query = await searchParams;
  const username = typeof query.u === "string" ? query.u : null;

  return (
    <ChatRoom
      code={code.toUpperCase()}
      initialUsername={username && username.length <= 24 ? username : null}
    />
  );
}
