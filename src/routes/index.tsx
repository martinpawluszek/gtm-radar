import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — GTM Intelligence" }] }),
  component: () => <PagePlaceholder title="Dashboard" />,
});
