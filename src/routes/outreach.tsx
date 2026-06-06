import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const Route = createFileRoute("/outreach")({
  head: () => ({ meta: [{ title: "Outreach — GTM Intelligence" }] }),
  component: () => <PagePlaceholder title="Outreach" />,
});
