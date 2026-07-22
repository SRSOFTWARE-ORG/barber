import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BARBER" },
      { name: "description", content: "BARBER" },
      { property: "og:title", content: "BARBER" },
      { property: "og:description", content: "BARBER" },
    ],
  }),
  component: Index,
});

function Index() {
  return <div className="min-h-screen bg-white" />;
}
