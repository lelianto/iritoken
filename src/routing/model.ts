export interface ModelRoute {
  id: string;
  provider: string;
  model: string;
  maxContextTokens: number;
  inputCostPerMillion?: number;
  capabilities?: readonly string[];
  priority?: number;
}
export interface ModelRoutingRequest { inputTokens: number; requiredCapabilities?: readonly string[]; prefer?: "cost" | "priority" | "capacity" }
export interface ModelRoutingDecision { route: ModelRoute; reason: string; candidatesConsidered: number }

export function routeModel(routes: readonly ModelRoute[], request: ModelRoutingRequest): ModelRoutingDecision {
  if (!Number.isSafeInteger(request.inputTokens) || request.inputTokens < 0) throw new RangeError("inputTokens must be non-negative");
  const required = request.requiredCapabilities ?? [];
  if (routes.length > 10_000) throw new RangeError("model route count exceeds maximum 10000");
  if (required.length > 100) throw new RangeError("required capability count exceeds maximum 100");
  const ids = new Set<string>();
  for (const route of routes) {
    if (ids.has(route.id)) throw new RangeError("duplicate model route id");
    if (!Number.isSafeInteger(route.maxContextTokens) || route.maxContextTokens < 0) throw new RangeError("route maxContextTokens must be non-negative");
    if (route.inputCostPerMillion !== undefined && (!Number.isFinite(route.inputCostPerMillion) || route.inputCostPerMillion < 0)) throw new RangeError("route input cost must be non-negative");
    if (route.priority !== undefined && !Number.isFinite(route.priority)) throw new RangeError("route priority must be finite");
    ids.add(route.id);
  }
  const eligible = routes.filter((route) => route.maxContextTokens >= request.inputTokens && required.every((capability) => route.capabilities?.includes(capability)));
  if (eligible.length === 0) throw new Error("no model route satisfies context and capability requirements");
  const prefer = request.prefer ?? "priority";
  const sorted = eligible.map((route, index) => ({ route, index })).sort((left, right) => {
    if (prefer === "cost") return (left.route.inputCostPerMillion ?? Number.POSITIVE_INFINITY) - (right.route.inputCostPerMillion ?? Number.POSITIVE_INFINITY) || left.index - right.index;
    if (prefer === "capacity") return right.route.maxContextTokens - left.route.maxContextTokens || left.index - right.index;
    return (right.route.priority ?? 0) - (left.route.priority ?? 0) || left.index - right.index;
  });
  const route = sorted[0]?.route;
  if (!route) throw new Error("no model route available");
  return { route, reason: `${prefer}: eligible for ${request.inputTokens} tokens and ${required.length} capabilities`, candidatesConsidered: eligible.length };
}
