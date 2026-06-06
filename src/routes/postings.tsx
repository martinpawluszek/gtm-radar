import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const Route = createFileRoute("/postings")({
  head: () => ({ meta: [{ title: "Postings — GTM Intelligence" }] }),
  component: () => <PagePlaceholder title="Postings" />,
});
