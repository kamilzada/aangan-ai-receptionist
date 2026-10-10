export const metadata = { title: "Aangan AI Receptionist" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#F5F0E8", color: "#2B2925", fontFamily: "Inter, system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
