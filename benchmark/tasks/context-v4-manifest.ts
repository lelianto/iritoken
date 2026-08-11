import type { ContextMessage } from "../../src/integrations/messages.js";

export type CampaignDifficulty = "easy" | "medium" | "hard";
export interface CampaignDocument { id: string; text: string; embedding: readonly number[] }
export interface ContextCampaignTask {
  name: string;
  difficulty: CampaignDifficulty;
  command?: string;
  query: string;
  messages: readonly ContextMessage[];
  documents?: readonly CampaignDocument[];
  queryEmbedding?: readonly number[];
  expectedRetrievedIds?: readonly string[];
  budgetTokens: number;
  requiredFacts: readonly (readonly string[])[];
}

const system = (difficulty: CampaignDifficulty): ContextMessage => ({
  role: "system",
  content: `SYNTHETIC BENCHMARK (${difficulty}). All names and facts are invented. Use only supplied context. Return valid JSON with one string field named answer. Include every requested fact.`,
});

export const CONTEXT_V4_CORPUS_ID = "context-v4.1-2026-08-11-prismatic";
export const CONTEXT_V4_TASKS: readonly ContextCampaignTask[] = [
  {
    name: "easy-glass-library",
    difficulty: "easy",
    command: "synthetic catalog --format json",
    query: "Report the curator, room color, and number of glass books.",
    messages: [system("easy"), { role: "user", content: `SYNTHETIC CATALOG\n{\n  "collection": "Glass Library",\n  "curator": "Mira Quill",\n  "roomColor": "cobalt",\n  "glassBooks": 48\n}\n` }, { role: "user", content: "Report the curator, room color, and number of glass books." }],
    budgetTokens: 58,
    requiredFacts: [["mira quill"], ["cobalt"], ["48", "forty-eight"]],
  },
  {
    name: "easy-copper-kite",
    difficulty: "easy",
    command: "synthetic-kite-flight --verbose",
    query: "Report the kite color, completed loops, and landing meadow.",
    messages: [system("easy"), { role: "user", content: `SYNTHETIC FLIGHT LOG\nCopper kite steady\nCopper kite steady\nCopper kite steady\nCopper kite steady\nColor: tangerine\nCompleted loops: 6\nLanding meadow: Willow Patch\n` }, { role: "user", content: "Report the kite color, completed loops, and landing meadow." }],
    budgetTokens: 60,
    requiredFacts: [["tangerine"], ["6", "six"], ["willow patch"]],
  },
  {
    name: "easy-lantern-dialogue",
    difficulty: "easy",
    query: "Report the lantern keeper, flame color, and closing bell time.",
    messages: [system("easy"), { role: "user", content: "Unrelated invented note: paper boats prefer square ponds." }, { role: "assistant", content: "The unrelated paper-boat note is recorded." }, { role: "user", content: "SYNTHETIC LANTERN RECORD: keeper Oren Vale maintains a violet flame. The closing bell rings at 21:40." }, { role: "user", content: "Report the lantern keeper, flame color, and closing bell time." }],
    budgetTokens: 58,
    requiredFacts: [["oren vale"], ["violet"], ["21:40", "21 40"]],
  },
  {
    name: "medium-river-revision",
    difficulty: "medium",
    query: "Use the final revision only: report ferry name, capacity, and departure minute.",
    messages: [system("medium"), { role: "user", content: "SYNTHETIC DRAFT revision 1: ferry Moon Reed, capacity 12, departure minute 15. This draft is obsolete." }, { role: "assistant", content: "Revision 1 is marked obsolete." }, { role: "user", content: "SYNTHETIC FINAL revision 3 supersedes every draft: ferry Sun Petal, capacity 19, departure minute 42." }, { role: "user", content: "Use the final revision only: report ferry name, capacity, and departure minute." }],
    budgetTokens: 72,
    requiredFacts: [["sun petal"], ["19", "nineteen"], ["42", "forty-two"]],
  },
  {
    name: "medium-planet-retrieval",
    difficulty: "medium",
    query: "Find the record about the planet with singing dunes and report its name, moon count, and wind color.",
    messages: [system("medium"), { role: "user", content: "Use the supplied synthetic archive documents." }, { role: "user", content: "Find the record about the planet with singing dunes and report its name, moon count, and wind color." }],
    documents: [
      { id: "archive-fern", text: "SYNTHETIC ARCHIVE: Planet Fern has silent forests, 2 moons, and blue rain.", embedding: [0.05, 0.95, 0] },
      { id: "archive-sonora", text: "SYNTHETIC ARCHIVE: Planet Sonora has singing dunes, 5 moons, and saffron wind.", embedding: [0.98, 0.02, 0] },
      { id: "archive-pearl", text: "SYNTHETIC ARCHIVE: Planet Pearl has glass oceans, 1 moon, and white mist.", embedding: [0, 0.1, 0.9] },
    ],
    queryEmbedding: [1, 0, 0], expectedRetrievedIds: ["archive-sonora"], budgetTokens: 74,
    requiredFacts: [["sonora"], ["5", "five"], ["saffron"]],
  },
  {
    name: "medium-clockwork-trace",
    difficulty: "medium",
    command: "synthetic-clockwork-test",
    query: "Report the exception type and message, first workshop frame, gear number, and trace color.",
    messages: [system("medium"), { role: "user", content: `SYNTHETIC STACK TRACE\nClockworkPause: escapement refused motion\n    at tune (storybook-clock.mjs:44:7)\n    at relay (storybook-loop.mjs:18:2)\n    at relay (storybook-loop.mjs:18:2)\n    at relay (storybook-loop.mjs:18:2)\nWorkshop frame: storybook-clock.mjs:44:7\nGear number: 73\nTrace color: mint\n` }, { role: "user", content: "Report the exception type and message, first workshop frame, gear number, and trace color." }],
    budgetTokens: 72,
    requiredFacts: [["clockworkpause"], ["storybook-clock.mjs:44:7"], ["73", "seventy-three"], ["mint"]],
  },
  {
    name: "hard-comet-multihop",
    difficulty: "hard",
    command: "synthetic-observatory-events --jsonl",
    query: "Reconstruct the accepted observation: report observatory, accepted lens, comet tail count, and approval phrase.",
    messages: [system("hard"), { role: "user", content: `SYNTHETIC EVENT STREAM\n{"event":"proposal","observatory":"Velvet Dome","lens":"L-Blue","status":"pending"}\n{"event":"measurement","lens":"L-Blue","comet":"Poppy Arc","tails":3}\n{"event":"correction","lens":"L-Gold","reason":"blue lens was mirrored"}\n{"event":"measurement","lens":"L-Gold","comet":"Poppy Arc","tails":7}\n{"event":"approval","observatory":"Velvet Dome","lens":"L-Gold","phrase":"orbit accepted gently"}\n` }, { role: "user", content: "Reconstruct the accepted observation: report observatory, accepted lens, comet tail count, and approval phrase." }],
    budgetTokens: 92,
    requiredFacts: [["velvet dome"], ["l-gold", "l gold"], ["7", "seven"], ["orbit accepted gently"]],
  },
  {
    name: "hard-twin-archive",
    difficulty: "hard",
    query: "Retrieve only the humming bridge record, then report bridge material, span count, and guardian bird.",
    messages: [system("hard"), { role: "user", content: "SYNTHETIC ARCHIVE QUERY. Similar records may conflict; use only the humming bridge record." }, { role: "user", content: "Retrieve only the humming bridge record, then report bridge material, span count, and guardian bird." }],
    documents: [
      { id: "bridge-hum", text: "SYNTHETIC RECORD H: The humming bridge is made of rosewood, has 11 spans, and is guarded by a teal heron.", embedding: [0.91, 0.38, 0.02] },
      { id: "bridge-whisper", text: "SYNTHETIC RECORD W: The whispering bridge is made of cedar, has 10 spans, and is guarded by a gray owl.", embedding: [0.72, 0.61, 0.02] },
      { id: "bridge-silent", text: "SYNTHETIC RECORD S: The silent bridge is made of marble, has 12 spans, and is guarded by a red crane.", embedding: [0.2, 0.1, 0.97] },
    ],
    queryEmbedding: [0.94, 0.34, 0], expectedRetrievedIds: ["bridge-hum"], budgetTokens: 86,
    requiredFacts: [["rosewood"], ["11", "eleven"], ["teal heron"]],
  },
  {
    name: "hard-prism-council",
    difficulty: "hard",
    query: "Apply the latest council correction and report the chosen prism, vote total, activation sequence, and witness.",
    messages: [system("hard"), { role: "user", content: "SYNTHETIC EARLY MINUTES: Prism Hazel received 4 votes. Activation draft was north-east-south. Witness draft: Ivo Reed." }, { role: "assistant", content: "Those are early minutes and may be superseded." }, { role: "user", content: "Unrelated synthetic interlude: cloud bakers counted nine cinnamon ladders." }, { role: "assistant", content: "The unrelated interlude is not council evidence." }, { role: "user", content: "SYNTHETIC FINAL CORRECTION: Prism Indigo replaces Hazel. The audited vote total is 8." }, { role: "user", content: "SYNTHETIC FINAL PROCEDURE: activation sequence west-north-west. Final witness: Nela Moss." }, { role: "user", content: "Apply the latest council correction and report the chosen prism, vote total, activation sequence, and witness." }],
    budgetTokens: 92,
    requiredFacts: [["indigo"], ["8", "eight"], ["west-north-west", "west north west"], ["nela moss"]],
  },
];
