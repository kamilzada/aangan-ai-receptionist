export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "72px 24px" }}>
      <p style={{ letterSpacing: "0.32em", textTransform: "uppercase", fontSize: 11, fontWeight: 500, color: "#8A6A44", margin: 0 }}>Aangan Studio</p>
      <h1 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 48, lineHeight: 1.05, margin: "8px 0 16px" }}>AI receptionist</h1>
      <p style={{ lineHeight: 1.6, color: "#6B645A" }}>
        Answers the calls the front desk can&rsquo;t, books a meeting with a designer, and records every call.
      </p>
      <p style={{ marginTop: 32 }}>
        <a href="/dashboard" style={{ display: "inline-block", padding: "12px 20px", borderRadius: 10, background: "#2B2925", color: "#F5F0E8", textDecoration: "none", fontWeight: 500 }}>
          Open the dashboard
        </a>
      </p>
    </main>
  );
}
