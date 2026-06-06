import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const Route = createFileRoute("/companies")({
  head: () => ({ meta: [{ title: "Companies — GTM Intelligence" }] }),
  component: () => <PagePlaceholder title="Companies" />,
});
