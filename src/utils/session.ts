/** Strip the provider prefix from a model ID for compact display (e.g. "openai/gpt-5.4" → "gpt-5.4"). */
export function shortModelLabel(model: string): string {
  const slash = model.indexOf("/");
  return slash === -1 ? model : model.slice(slash + 1);
}
