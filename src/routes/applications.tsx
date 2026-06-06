import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const Route = createFileRoute("/applications")({
  head: () => ({ meta: [{ title: "Applications — GTM Intelligence" }] }),
  component: () => <PagePlaceholder title="Applications" />,
});
