export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "64px 24px" }}>
      <p style={{ letterSpacing: "0.2em", textTransform: "uppercase", fontSize: 12, color: "#B08A5E" }}>Aangan Studio</p>
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 40, margin: "8px 0 16px" }}>AI receptionist</h1>
      <p style={{ lineHeight: 1.6 }}>
        Booking endpoints for the Vaani voice agent are live at <code>/api/vaani/slots</code> and <code>/api/vaani/book</code>.
        The dashboard for Rahul arrives in Phase 6.
      </p>
    </main>
  );
}
