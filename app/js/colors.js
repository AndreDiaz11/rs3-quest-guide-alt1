// Los valores de color reales viven en css/styles.css (--quest-green, --quest-yellow,
// --quest-red, --quest-locked) como aproximación visual pendiente de ajuste fino con
// cuentagotas contra capturas reales de la interfaz nativa (Milestone 4).
export function statusClass(status) {
  switch (status) {
    case "COMPLETED":
      return "status-completed";
    case "STARTED":
      return "status-started";
    case "LOCKED":
      return "status-locked";
    default:
      return "status-not-started";
  }
}
