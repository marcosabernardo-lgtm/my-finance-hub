import Dashboard from "./Dashboard"
import Alertas from "./Alertas"
import Endividamento from "./Endividamento"

export default function HomePanel() {
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", background: "#f5f0e8", minHeight: "100vh" }}>

      {/* Dashboard completo */}
      <Dashboard />

      {/* Divisor */}
      <div style={{ height: 2, background: "#e2e8f0", margin: "0 32px" }} />

      {/* Alertas + Endividamento lado a lado */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <div style={{ borderRight: "2px solid #e2e8f0" }}>
          <Alertas />
        </div>
        <div>
          <Endividamento />
        </div>
      </div>

    </div>
  )
}
