export function PagePlaceholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-2">
      <h2
        className="text-2xl font-semibold tracking-tight"
        style={{ color: "#F0F0FF", fontFamily: "var(--font-mono)" }}
      >
        {title}
      </h2>
      <p className="text-sm" style={{ color: "#8B8B9E" }}>
        coming soon
      </p>
    </div>
  );
}
