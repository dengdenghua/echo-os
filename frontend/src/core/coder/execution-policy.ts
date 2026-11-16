/** The OS assistant uses one execution engine on desktop and TV. */
export function assistantExecutionEngine(): "echo" | "codex" | "opencode" {
  // Keep the wire union for older task records, not as a product choice.
  return "codex";
}
