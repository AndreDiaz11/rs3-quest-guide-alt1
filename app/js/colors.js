// Los valores de color reales viven en css/styles.css (--quest-green, --quest-yellow,
// --quest-red) como aproximación visual pendiente de ajuste fino con cuentagotas
// contra capturas reales de la interfaz nativa. Solo 3 estados a propósito — ver
// el comentario en state.js sobre por qué se descartó un 4to estado "bloqueada".
export function statusClass(status) {
  switch (status) {
    case "COMPLETED":
      return "status-completed";
    case "STARTED":
      return "status-started";
    default:
      return "status-not-started";
  }
}
