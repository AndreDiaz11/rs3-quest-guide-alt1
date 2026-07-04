// Los valores de color reales viven en css/styles.css (--quest-green, --quest-yellow,
// --quest-red, --quest-locked) como aproximación visual pendiente de ajuste fino con
// cuentagotas contra capturas reales de la interfaz nativa.
//
// "Bloqueada" (gris) se usa solo para misiones de temporada/evento que no están
// completadas — no se pueden jugar la mayor parte del año, y esto es un dato que
// nosotros controlamos directamente (isSeasonal), a diferencia del campo
// userEligible de RuneMetrics que resultó no ser confiable (ver state.js).
export function statusClass(status, isSeasonal) {
  if (status !== "COMPLETED" && isSeasonal) return "status-locked";
  switch (status) {
    case "COMPLETED":
      return "status-completed";
    case "STARTED":
      return "status-started";
    default:
      return "status-not-started";
  }
}
