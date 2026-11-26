"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f7f5f1",
          color: "#111a2e",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <p style={{ fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase" }}>
            Hotelaria PMS
          </p>
          <h1 style={{ fontSize: 28, margin: "12px 0" }}>Erro na aplicação</h1>
          <p style={{ color: "#6f675e", fontSize: 14, lineHeight: 1.5 }}>
            Ocorreu um erro ao carregar a interface. Actualize a página. Se o problema
            continuar, limpe a cache do browser ou tente noutro dispositivo.
          </p>
          {error?.digest ? (
            <p style={{ fontSize: 11, color: "#9a9288" }}>Ref: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 20,
              height: 44,
              padding: "0 20px",
              border: 0,
              borderRadius: 8,
              background: "#0f766e",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
