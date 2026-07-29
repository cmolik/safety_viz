/** Titled white card listing plain-string metadata items. */
export default function MetadataSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{
      backgroundColor: "white",
      border: "1px solid #e5e7eb",
      borderRadius: 8,
      overflow: "hidden",
      marginBottom: 16
    }}>
      <div style={{
        padding: "12px 16px",
        backgroundColor: "#f9fafb",
        borderBottom: "1px solid #e5e7eb",
        fontWeight: 600
      }}>
        {title}
      </div>
      <div style={{ padding: 16 }}>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ marginBottom: 4, color: "#374151", wordBreak: "break-word" }}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
