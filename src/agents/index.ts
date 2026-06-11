export const CEREBRO_AGENTS = [
  "cerebro",
  "legion",
  "cypher",
  "professor-x",
  "wolverine",
  "jean-grey",
  "storm",
  "cyclops",
  "forge",
  "nightcrawler",
  "sage",
  "beast",
  "emma-frost",
] as const;

export type { AgentDefinition, OpenCodeMeta, OpenCodePermissionLevel } from "./types.js";
export { resolvePrompt, CEREBRO_RUNTIME_CONTRACT } from "./types.js";
export { buildCerebroPrompt, createCerebroAgent, CEREBRO_PROMPT } from "./cerebro.js";
export {
  createLegionAgent,
  createCypherAgent,
  createProfessorXAgent,
  createWolverineAgent,
  createJeanGreyAgent,
  createStormAgent,
  createCyclopsAgent,
  createForgeAgent,
  createNightcrawlerAgent,
  createSageAgent,
  createBeastAgent,
  createEmmaFrostAgent,
} from "./team.js";
