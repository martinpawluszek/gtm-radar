import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Trash2, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { TIER_META, type Tier } from "@/lib/companies";

export const Route = createFileRoute("/applications")({
  head: () => ({ meta: [{ title: "Applications — GTM Intelligence" }] }),
  component: ApplicationsPage,
});

// ---------- Types ----------
type Status =
  | "applied"
  | "screening"
  | "interview_1"
  | "interview_2"
  | "final"
  | "offer"
  | "rejected"
  | "ghosted";

type Contact = {
  name?: string;
  role?: string;
  linkedin?: string;
  email?: string;
};

type Application = {
  id: string;
  posting_id: string | null;
  company_id: string | null;
  role_title: string;
  status: Status;
  applied_at: string | null;
  last_status_change: string | null;
  next_action: string | null;
  next_action_date: string | null;
  notes: string | null;
  contacts: Contact[];
  created_at: string;
  updated_at: string;
};

type HistoryRow = {
  id: string;
  application_id: string;
  from_status: Status | null;
  to_status: Status;
  changed_at: string;
  note: string | null;
};

type CompanyLite = { id: string; name: string; tier: Tier };

type Posting = { id: string; jd_url: string | null };

// ---------- Constants ----------
const STATUSES: Status[] = [
  "applied",
  "screening",
  "interview_1",
  "interview_2",
  "final",
  "offer",
];

const STATUS_LABEL: Record<Status, string> = {
  applied: "Applied",
  screening: "Screening Call",
  interview_1: "1st Interview",
  interview_2: "2nd Interview",
  final: "Final Round",
  offer: "Offer",
  rejected: "Rejected",
  ghosted: "Ghosted",
};

const ALL_STATUSES: Status[] = [...STATUSES, "rejected", "ghosted"];

const MONO = "var(--font-mono)";

// ---------- Helpers ----------
function daysBetween(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------- Data ----------
async function fetchApplications(): Promise<Application[]> {
  const { data, error } = await gtmSupabase
    .from("applications" as never)
    .select("*")
    .order("last_status_change", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Application[];
}

async function fetchCompaniesLite(): Promise<CompanyLite[]> {
  const { data, error } = await gtmSupabase
    .from("companies")
    .select("id,name,tier")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as CompanyLite[];
}

async function fetchHistory(appId: string): Promise<HistoryRow[]> {
  const { data, error } = await gtmSupabase
    .from("application_status_history" as never)
    .select("*")
    .eq("application_id", appId)
    .order("changed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as HistoryRow[];
}

async function fetchPosting(id: string): Promise<Posting | null> {
  const { data, error } = await gtmSupabase
    .from("job_postings" as never)
    .select("id,jd_url")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as Posting) ?? null;
}

// ---------- Page ----------
function ApplicationsPage() {
  const qc = useQueryClient();
  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["applications"],
    queryFn: fetchApplications,
  });
  const { data: companies = [] } = useQuery({
    queryKey: ["companies-lite"],
    queryFn: fetchCompaniesLite,
  });

  const companyMap = useMemo(() => {
    const m = new Map<string, CompanyLite>();
    companies.forEach((c) => m.set(c.id, c));
    return m;
  }, [companies]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [rejectedExpanded, setRejectedExpanded] = useState(false);

  const selected = apps.find((a) => a.id === selectedId) ?? null;

  // ---------- Stats ----------
  const stats = useMemo(() => {
    const active = apps.filter((a) => a.status !== "rejected" && a.status !== "ghosted");
    const interviews = apps.filter((a) =>
      ["interview_1", "interview_2", "final"].includes(a.status),
    );
    const offers = apps.filter((a) => a.status === "offer");
    const applied = apps.length;
    const beyondApplied = apps.filter((a) => a.status !== "applied").length;
    const responseRate = applied > 0 ? Math.round((beyondApplied / applied) * 100) : 0;
    return {
      active: active.length,
      interviews: interviews.length,
      offers: offers.length,
      responseRate,
    };
  }, [apps]);

  // ---------- Move status ----------
  const moveMutation = useMutation({
    mutationFn: async ({
      app,
      to,
      note,
    }: {
      app: Application;
      to: Status;
      note?: string | null;
    }) => {
      if (app.status === to) return;
      const now = new Date().toISOString();
      const { error: upErr } = await gtmSupabase
        .from("applications" as never)
        .update({ status: to, last_status_change: now, updated_at: now } as never)
        .eq("id", app.id);
      if (upErr) throw upErr;
      const { error: hErr } = await gtmSupabase
        .from("application_status_history" as never)
        .insert({
          application_id: app.id,
          from_status: app.status,
          to_status: to,
          changed_at: now,
          note: note ?? null,
        } as never);
      if (hErr) throw hErr;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["history", vars.app.id] });
      toast.success(`Moved to ${STATUS_LABEL[vars.to]}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const m: Record<Status, Application[]> = {
      applied: [],
      screening: [],
      interview_1: [],
      interview_2: [],
      final: [],
      offer: [],
      rejected: [],
      ghosted: [],
    };
    for (const a of apps) m[a.status].push(a);
    return m;
  }, [apps]);

  const rejectedGhosted = [...grouped.rejected, ...grouped.ghosted];

  // ---------- Drag handlers ----------
  const onDrop = (e: React.DragEvent, to: Status) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    const app = apps.find((a) => a.id === id);
    if (app && app.status !== to) moveMutation.mutate({ app, to });
  };

  if (isLoading) {
    return (
      <div className="space-y-4" style={{ marginTop: -8 }}>
        <div style={{ color: "#8B8B9E" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0" style={{ marginTop: -8 }}>
      {/* Page header */}
      <div className="grid items-center gap-3" style={{ gridTemplateColumns: "1fr auto" }}>
        <h2
          className="text-xl font-semibold"
          style={{ color: "#F0F0FF", fontFamily: MONO }}
        >
          Applications Pipeline
        </h2>
        <Button
          onClick={() => setAddOpen(true)}
          variant="outline"
          style={{ borderColor: "rgba(0,212,255,0.4)", color: "#00D4FF", background: "transparent" }}
        >
          <Plus size={14} /> Add Application
        </Button>
      </div>

      {/* Summary bar */}
      <div
        className="flex items-center gap-6 px-4"
        style={{
          background: "#111118",
          border: "1px solid #1E1E2E",
          borderRadius: 6,
          height: 56,
        }}
      >
        <Stat label="Active" value={stats.active} />
        <Divider />
        <Stat label="In Interviews" value={stats.interviews} />
        <Divider />
        <Stat label="Offers" value={stats.offers} accent="#10B981" />
        <Divider />
        <Stat label="Response Rate" value={`${stats.responseRate}%`} accent="#00D4FF" />
      </div>

      {/* Kanban */}
      {apps.length === 0 ? (
        <div
          className="flex items-center justify-center"
          style={{
            height: 320,
            background: "#111118",
            border: "1px solid #1E1E2E",
            borderRadius: 6,
          }}
        >
          <p className="text-sm" style={{ color: "#8B8B9E" }}>
            No applications yet. The agent will populate this automatically — or add one
            manually to get started.
          </p>
        </div>
      ) : (
        <div
          className="grid gap-3 min-w-0"
          style={{ gridTemplateColumns: "repeat(6, minmax(180px, 1fr)) 200px" }}
        >
          {STATUSES.map((s) => (
            <KanbanColumn
              key={s}
              status={s}
              apps={grouped[s]}
              companyMap={companyMap}
              onDrop={onDrop}
              onCardClick={setSelectedId}
            />
          ))}
          <RejectedColumn
            apps={rejectedGhosted}
            companyMap={companyMap}
            expanded={rejectedExpanded}
            onToggle={() => setRejectedExpanded((v) => !v)}
            onDrop={onDrop}
            onCardClick={setSelectedId}
          />
        </div>
      )}

      {/* Side panel */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent
          side="right"
          className="p-0 overflow-y-auto"
          style={{
            background: "#0A0A0F",
            border: "none",
            borderLeft: "1px solid #1E1E2E",
            width: 420,
            maxWidth: "100vw",
          }}
        >
          {selected && (
            <DetailPanel
              app={selected}
              company={selected.company_id ? companyMap.get(selected.company_id) ?? null : null}
              onClose={() => setSelectedId(null)}
              onMove={(to) => moveMutation.mutate({ app: selected, to })}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Add modal */}
      <AddApplicationModal
        open={addOpen}
        onOpenChange={setAddOpen}
        companies={companies}
        onAdded={() => qc.invalidateQueries({ queryKey: ["applications"] })}
      />
    </div>
  );
}

// ---------- Subcomponents ----------
function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="uppercase"
        style={{ color: "#8B8B9E", fontSize: 10, fontFamily: MONO, letterSpacing: "0.08em" }}
      >
        {label}
      </span>
      <span
        className="font-bold tabular-nums"
        style={{ color: accent ?? "#F0F0FF", fontFamily: MONO, fontSize: 20 }}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 28, background: "#1E1E2E" }} />;
}

function TierBadge({ tier }: { tier: Tier }) {
  const m = TIER_META[tier];
  return (
    <span
      className="inline-flex items-center justify-center font-bold tracking-wider"
      style={{
        fontSize: 10,
        padding: "1px 6px",
        color: m.color,
        background: `color-mix(in oklab, ${m.color} 12%, transparent)`,
        border: `1px solid color-mix(in oklab, ${m.color} 30%, transparent)`,
        borderRadius: 3,
        fontFamily: MONO,
      }}
    >
      {m.short}
    </span>
  );
}

function KanbanColumn({
  status,
  apps,
  companyMap,
  onDrop,
  onCardClick,
}: {
  status: Status;
  apps: Application[];
  companyMap: Map<string, CompanyLite>;
  onDrop: (e: React.DragEvent, to: Status) => void;
  onCardClick: (id: string) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className="flex flex-col min-w-0"
      style={{
        background: "#0D0D14",
        border: `1px solid ${over ? "rgba(0,212,255,0.5)" : "#1E1E2E"}`,
        borderRadius: 6,
        minHeight: 400,
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        onDrop(e, status);
      }}
    >
      <div
        className="flex items-center justify-between px-3"
        style={{ height: 36, borderBottom: "1px solid #1E1E2E" }}
      >
        <span
          className="uppercase"
          style={{
            color: "#F0F0FF",
            fontSize: 11,
            fontFamily: MONO,
            letterSpacing: "0.08em",
            fontWeight: 600,
          }}
        >
          {STATUS_LABEL[status]}
        </span>
        <span
          className="inline-flex items-center justify-center"
          style={{
            background: "rgba(0,212,255,0.12)",
            color: "#00D4FF",
            border: "1px solid rgba(0,212,255,0.3)",
            borderRadius: 3,
            minWidth: 22,
            height: 18,
            padding: "0 5px",
            fontSize: 10,
            fontFamily: MONO,
            fontWeight: 600,
          }}
        >
          {apps.length}
        </span>
      </div>
      <div className="flex-1 p-2 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
        {apps.map((a) => (
          <AppCard
            key={a.id}
            app={a}
            company={a.company_id ? companyMap.get(a.company_id) ?? null : null}
            onClick={() => onCardClick(a.id)}
          />
        ))}
      </div>
    </div>
  );
}

function RejectedColumn({
  apps,
  companyMap,
  expanded,
  onToggle,
  onDrop,
  onCardClick,
}: {
  apps: Application[];
  companyMap: Map<string, CompanyLite>;
  expanded: boolean;
  onToggle: () => void;
  onDrop: (e: React.DragEvent, to: Status) => void;
  onCardClick: (id: string) => void;
}) {
  return (
    <div
      className="flex flex-col min-w-0"
      style={{
        background: "#0A0A10",
        border: "1px solid #1E1E2E",
        borderRadius: 6,
        opacity: 0.85,
        minHeight: 400,
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(e, "rejected")}
    >
      <button
        onClick={onToggle}
        className="flex items-center justify-between px-3"
        style={{ height: 36, borderBottom: "1px solid #1E1E2E" }}
      >
        <span className="flex items-center gap-1.5">
          {expanded ? <ChevronDown size={12} style={{ color: "#8B8B9E" }} /> : <ChevronRight size={12} style={{ color: "#8B8B9E" }} />}
          <span
            className="uppercase"
            style={{
              color: "#8B8B9E",
              fontSize: 11,
              fontFamily: MONO,
              letterSpacing: "0.08em",
              fontWeight: 600,
            }}
          >
            Rejected + Ghosted
          </span>
        </span>
        <span
          className="inline-flex items-center justify-center"
          style={{
            background: "rgba(139,139,158,0.12)",
            color: "#8B8B9E",
            border: "1px solid #1E1E2E",
            borderRadius: 3,
            minWidth: 22,
            height: 18,
            padding: "0 5px",
            fontSize: 10,
            fontFamily: MONO,
            fontWeight: 600,
          }}
        >
          {apps.length}
        </span>
      </button>
      {expanded && (
        <div className="flex-1 p-2 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
          {apps.map((a) => (
            <AppCard
              key={a.id}
              app={a}
              company={a.company_id ? companyMap.get(a.company_id) ?? null : null}
              onClick={() => onCardClick(a.id)}
              muted
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AppCard({
  app,
  company,
  onClick,
  muted,
}: {
  app: Application;
  company: CompanyLite | null;
  onClick: () => void;
  muted?: boolean;
}) {
  const days = daysBetween(app.last_status_change ?? app.applied_at);
  const nextDate = app.next_action_date;
  const overdue = nextDate ? new Date(nextDate) < new Date(new Date().toDateString()) : false;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", app.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onClick}
      className="cursor-pointer transition-colors"
      style={{
        background: "#111118",
        border: "1px solid #1E1E2E",
        borderRadius: 6,
        padding: 10,
        opacity: muted ? 0.7 : 1,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(0,212,255,0.35)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1E1E2E")}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span
          className="font-semibold truncate"
          style={{ color: "#F0F0FF", fontSize: 13 }}
        >
          {company?.name ?? "—"}
        </span>
        {company && <TierBadge tier={company.tier} />}
      </div>
      <div className="truncate mb-2" style={{ color: "#8B8B9E", fontSize: 11 }}>
        {app.role_title}
      </div>
      <div className="flex items-center gap-2" style={{ fontSize: 10, fontFamily: MONO }}>
        <span style={{ color: days > 7 ? "#F59E0B" : "#8B8B9E" }}>{days}d</span>
        {nextDate && (
          <>
            <span style={{ color: "#1E1E2E" }}>•</span>
            <span style={{ color: overdue ? "#EF4444" : "#00D4FF" }}>{fmtDate(nextDate)}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Detail panel ----------
function DetailPanel({
  app,
  company,
  onClose,
  onMove,
}: {
  app: Application;
  company: CompanyLite | null;
  onClose: () => void;
  onMove: (to: Status) => void;
}) {
  const qc = useQueryClient();
  const [nextAction, setNextAction] = useState(app.next_action ?? "");
  const [nextActionDate, setNextActionDate] = useState(app.next_action_date ?? "");
  const [notes, setNotes] = useState(app.notes ?? "");
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState<Contact>({});

  useEffect(() => {
    setNextAction(app.next_action ?? "");
    setNextActionDate(app.next_action_date ?? "");
    setNotes(app.notes ?? "");
    setAddingContact(false);
    setNewContact({});
  }, [app.id]);

  const { data: history = [] } = useQuery({
    queryKey: ["history", app.id],
    queryFn: () => fetchHistory(app.id),
  });

  const { data: posting } = useQuery({
    queryKey: ["posting", app.posting_id],
    queryFn: () => (app.posting_id ? fetchPosting(app.posting_id) : Promise.resolve(null)),
    enabled: !!app.posting_id,
  });

  async function saveFields(patch: Partial<Application>) {
    const { error } = await gtmSupabase
      .from("applications" as never)
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("id", app.id);
    if (error) {
      toast.error(error.message);
    } else {
      qc.invalidateQueries({ queryKey: ["applications"] });
    }
  }

  async function saveNextAction() {
    await saveFields({
      next_action: nextAction || null,
      next_action_date: nextActionDate || null,
    });
    toast.success("Next action saved");
  }

  async function saveNotes() {
    if ((notes ?? "") === (app.notes ?? "")) return;
    await saveFields({ notes: notes || null });
  }

  async function addContact() {
    if (!newContact.name && !newContact.email && !newContact.linkedin) return;
    const updated = [...(app.contacts ?? []), newContact];
    await saveFields({ contacts: updated });
    setAddingContact(false);
    setNewContact({});
  }

  async function deleteContact(idx: number) {
    const updated = (app.contacts ?? []).filter((_, i) => i !== idx);
    await saveFields({ contacts: updated });
  }

  const validNextStatuses = ALL_STATUSES.filter((s) => s !== app.status);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div
        className="flex items-start justify-between gap-2 px-5 py-4"
        style={{ borderBottom: "1px solid #1E1E2E" }}
      >
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold" style={{ color: "#F0F0FF", fontSize: 16 }}>
              {company?.name ?? "—"}
            </span>
            {company && <TierBadge tier={company.tier} />}
          </div>
          <span style={{ color: "#8B8B9E", fontSize: 13 }}>{app.role_title}</span>
          <span style={{ color: "#8B8B9E", fontSize: 11, fontFamily: MONO }}>
            Applied {fmtDate(app.applied_at)}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1"
          style={{ color: "#8B8B9E" }}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-5 p-5">
        {/* Status */}
        <Section title="Status">
          <div className="flex items-center gap-2">
            <StatusPill status={app.status} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  style={{
                    background: "#111118",
                    border: "1px solid #1E1E2E",
                    color: "#F0F0FF",
                  }}
                >
                  Move to <ChevronDown size={12} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {validNextStatuses.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => onMove(s)}>
                    {STATUS_LABEL[s]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Section>

        {/* Next action */}
        <Section title="Next Action">
          <div className="flex flex-col gap-2">
            <Input
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="e.g. Follow up with recruiter"
              style={{ background: "#111118", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
            />
            <Input
              type="date"
              value={nextActionDate}
              onChange={(e) => setNextActionDate(e.target.value)}
              style={{
                background: "#111118",
                border: "1px solid #1E1E2E",
                color: "#F0F0FF",
                fontFamily: MONO,
              }}
            />
            <Button
              onClick={saveNextAction}
              variant="outline"
              size="sm"
              style={{
                borderColor: "rgba(0,212,255,0.4)",
                color: "#00D4FF",
                alignSelf: "flex-start",
              }}
            >
              Save
            </Button>
          </div>
        </Section>

        {/* Notes */}
        <Section title="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            rows={4}
            placeholder="Notes…"
            style={{
              background: "#111118",
              border: "1px solid #1E1E2E",
              color: "#F0F0FF",
            }}
          />
        </Section>

        {/* Contacts */}
        <Section title="Contacts">
          <div className="flex flex-col gap-2">
            {(app.contacts ?? []).length === 0 && !addingContact && (
              <span style={{ color: "#8B8B9E", fontSize: 12 }}>No contacts yet.</span>
            )}
            {(app.contacts ?? []).map((c, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-2 p-2"
                style={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 6 }}
              >
                <div className="flex flex-col gap-0.5 min-w-0 text-xs">
                  <span style={{ color: "#F0F0FF", fontWeight: 600 }}>{c.name || "—"}</span>
                  {c.role && <span style={{ color: "#8B8B9E" }}>{c.role}</span>}
                  {c.email && (
                    <a href={`mailto:${c.email}`} style={{ color: "#00D4FF" }}>
                      {c.email}
                    </a>
                  )}
                  {c.linkedin && (
                    <a
                      href={c.linkedin}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1"
                      style={{ color: "#00D4FF" }}
                    >
                      LinkedIn <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                <button
                  onClick={() => deleteContact(i)}
                  className="p-1"
                  style={{ color: "#8B8B9E" }}
                  aria-label="Delete contact"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {addingContact ? (
              <div
                className="flex flex-col gap-2 p-2"
                style={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 6 }}
              >
                <Input
                  placeholder="Name"
                  value={newContact.name ?? ""}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
                />
                <Input
                  placeholder="Role / Title"
                  value={newContact.role ?? ""}
                  onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
                  style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
                />
                <Input
                  placeholder="LinkedIn URL"
                  value={newContact.linkedin ?? ""}
                  onChange={(e) => setNewContact({ ...newContact, linkedin: e.target.value })}
                  style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
                />
                <Input
                  placeholder="Email"
                  value={newContact.email ?? ""}
                  onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                  style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={addContact}
                    style={{ background: "#00D4FF", color: "#0A0A0F" }}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAddingContact(false);
                      setNewContact({});
                    }}
                    style={{ border: "1px solid #1E1E2E", color: "#8B8B9E", background: "transparent" }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddingContact(true)}
                style={{
                  border: "1px dashed #1E1E2E",
                  color: "#8B8B9E",
                  background: "transparent",
                  alignSelf: "flex-start",
                }}
              >
                <Plus size={12} /> Add contact
              </Button>
            )}
          </div>
        </Section>

        {/* History */}
        <Section title="Status History">
          {history.length === 0 ? (
            <span style={{ color: "#8B8B9E", fontSize: 12 }}>No status changes yet.</span>
          ) : (
            <div className="flex flex-col gap-1.5">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center gap-2"
                  style={{ fontSize: 11, fontFamily: MONO, color: "#8B8B9E" }}
                >
                  <span style={{ color: "#F0F0FF" }}>
                    {h.from_status ? STATUS_LABEL[h.from_status] : "—"} →{" "}
                    {STATUS_LABEL[h.to_status]}
                  </span>
                  <span style={{ color: "#8B8B9E" }}>{fmtDateTime(h.changed_at)}</span>
                  {h.note && <span style={{ color: "#8B8B9E" }}>· {h.note}</span>}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Posting link */}
        {posting?.jd_url && (
          <Section title="Posting">
            <a
              href={posting.jd_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1"
              style={{ color: "#00D4FF", fontSize: 12 }}
            >
              View original posting <ExternalLink size={12} />
            </a>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span
        className="uppercase"
        style={{
          color: "#8B8B9E",
          fontSize: 10,
          fontFamily: MONO,
          letterSpacing: "0.08em",
          fontWeight: 600,
        }}
      >
        {title}
      </span>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const color =
    status === "offer"
      ? "#10B981"
      : status === "rejected" || status === "ghosted"
      ? "#EF4444"
      : "#00D4FF";
  return (
    <span
      className="inline-flex items-center"
      style={{
        background: `color-mix(in oklab, ${color} 12%, transparent)`,
        color,
        border: `1px solid color-mix(in oklab, ${color} 30%, transparent)`,
        borderRadius: 3,
        padding: "2px 8px",
        fontSize: 11,
        fontFamily: MONO,
        fontWeight: 600,
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// ---------- Add modal ----------
function AddApplicationModal({
  open,
  onOpenChange,
  companies,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companies: CompanyLite[];
  onAdded: () => void;
}) {
  const [companyId, setCompanyId] = useState<string>("");
  const [companySearch, setCompanySearch] = useState("");
  const [companyOpen, setCompanyOpen] = useState(false);
  const [roleTitle, setRoleTitle] = useState("");
  const [appliedAt, setAppliedAt] = useState(todayISO());
  const [status, setStatus] = useState<Status>("applied");
  const [nextAction, setNextAction] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setCompanyId("");
      setCompanySearch("");
      setRoleTitle("");
      setAppliedAt(todayISO());
      setStatus("applied");
      setNextAction("");
      setNextActionDate("");
      setNotes("");
    }
  }, [open]);

  const selectedCompany = companies.find((c) => c.id === companyId) ?? null;
  const filteredCompanies = companies.filter((c) =>
    c.name.toLowerCase().includes(companySearch.toLowerCase()),
  );

  async function submit() {
    if (!roleTitle.trim()) {
      toast.error("Role title is required");
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    const { data, error } = await gtmSupabase
      .from("applications" as never)
      .insert({
        company_id: companyId || null,
        role_title: roleTitle.trim(),
        status,
        applied_at: appliedAt ? new Date(appliedAt).toISOString() : now,
        last_status_change: now,
        next_action: nextAction || null,
        next_action_date: nextActionDate || null,
        notes: notes || null,
        contacts: [],
      } as never)
      .select("id")
      .single();
    if (error || !data) {
      setSaving(false);
      toast.error(error?.message ?? "Failed to add");
      return;
    }
    const newId = (data as { id: string }).id;
    const { error: hErr } = await gtmSupabase
      .from("application_status_history" as never)
      .insert({
        application_id: newId,
        from_status: null,
        to_status: "applied",
        changed_at: now,
        note: null,
      } as never);
    setSaving(false);
    if (hErr) {
      toast.error(hErr.message);
      return;
    }
    toast.success("Application added");
    onAdded();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ background: "#0D0D14", border: "1px solid #1E1E2E", color: "#F0F0FF", maxWidth: 480 }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "#F0F0FF", fontFamily: MONO }}>Add Application</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {/* Company */}
          <div className="flex flex-col gap-1.5">
            <label style={{ color: "#8B8B9E", fontSize: 11, fontFamily: MONO }}>Company</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setCompanyOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3"
                style={{
                  height: 36,
                  background: "#111118",
                  border: "1px solid #1E1E2E",
                  borderRadius: 6,
                  color: selectedCompany ? "#F0F0FF" : "#8B8B9E",
                  fontSize: 13,
                }}
              >
                <span className="flex items-center gap-2 truncate">
                  {selectedCompany ? (
                    <>
                      {selectedCompany.name} <TierBadge tier={selectedCompany.tier} />
                    </>
                  ) : (
                    "Select company"
                  )}
                </span>
                <ChevronDown size={12} />
              </button>
              {companyOpen && (
                <div
                  className="absolute left-0 right-0 mt-1 z-10 p-2"
                  style={{
                    background: "#111118",
                    border: "1px solid #1E1E2E",
                    borderRadius: 6,
                    maxHeight: 240,
                    overflowY: "auto",
                  }}
                >
                  <Input
                    placeholder="Search..."
                    value={companySearch}
                    onChange={(e) => setCompanySearch(e.target.value)}
                    autoFocus
                    style={{
                      background: "#0A0A0F",
                      border: "1px solid #1E1E2E",
                      color: "#F0F0FF",
                      marginBottom: 6,
                    }}
                  />
                  {filteredCompanies.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCompanyId(c.id);
                        setCompanyOpen(false);
                        setCompanySearch("");
                      }}
                      className="w-full flex items-center justify-between px-2 py-1.5 text-left"
                      style={{ color: "#F0F0FF", fontSize: 13, borderRadius: 3 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,212,255,0.08)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span className="truncate">{c.name}</span>
                      <TierBadge tier={c.tier} />
                    </button>
                  ))}
                  {filteredCompanies.length === 0 && (
                    <div className="px-2 py-1.5" style={{ color: "#8B8B9E", fontSize: 12 }}>
                      No matches
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <Field label="Role title">
            <Input
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="e.g. Founding GTM"
              style={{ background: "#111118", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Applied date">
              <Input
                type="date"
                value={appliedAt}
                onChange={(e) => setAppliedAt(e.target.value)}
                style={{
                  background: "#111118",
                  border: "1px solid #1E1E2E",
                  color: "#F0F0FF",
                  fontFamily: MONO,
                }}
              />
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className="w-full px-3"
                style={{
                  height: 36,
                  background: "#111118",
                  border: "1px solid #1E1E2E",
                  borderRadius: 6,
                  color: "#F0F0FF",
                  fontSize: 13,
                }}
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Next action (optional)">
            <Input
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              style={{ background: "#111118", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
            />
          </Field>
          <Field label="Next action date (optional)">
            <Input
              type="date"
              value={nextActionDate}
              onChange={(e) => setNextActionDate(e.target.value)}
              style={{
                background: "#111118",
                border: "1px solid #1E1E2E",
                color: "#F0F0FF",
                fontFamily: MONO,
              }}
            />
          </Field>
          <Field label="Notes (optional)">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ background: "#111118", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              style={{ border: "1px solid #1E1E2E", color: "#8B8B9E", background: "transparent" }}
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={saving}
              style={{ background: "#00D4FF", color: "#0A0A0F" }}
            >
              {saving ? "Saving…" : "Add Application"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ color: "#8B8B9E", fontSize: 11, fontFamily: MONO }}>{label}</label>
      {children}
    </div>
  );
}
