import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const Route = createFileRoute("/role-criteria")({
  head: () => ({ meta: [{ title: "Role Criteria — GTM Intelligence" }] }),
  component: () => <PagePlaceholder title="Role Criteria" />,
});
