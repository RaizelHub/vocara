import { hasRecentAuthentication } from "./accountPrivacy.ts";
export type VerifiedIdentity = { id: string; claims: Record<string, unknown> };
export type DeletionHttpDependencies = {
  verify: (token: string) => Promise<VerifiedIdentity | null>;
  request: (id: string) => Promise<void>;
};
export function deletionHandler(
  deps: DeletionHttpDependencies,
  allowedOrigins: string[] = [],
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "Vary": "Origin",
    };
    if (origin && !allowedOrigins.includes(origin)) {
      return Response.json({ code: "ORIGIN_DENIED" }, { status: 403, headers });
    }
    if (origin) headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] =
      "authorization,apikey,content-type,x-client-info";
    headers["Access-Control-Allow-Methods"] = "POST,OPTIONS";
    const reply = (status: number, code: string) =>
      Response.json({ code }, { status, headers });
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") return reply(405, "METHOD_NOT_ALLOWED");
    const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)
      ?.[1];
    if (!token) return reply(401, "AUTHENTICATION_REQUIRED");
    try {
      const identity = await deps.verify(token);
      if (!identity) return reply(401, "AUTHENTICATION_REQUIRED");
      if (!hasRecentAuthentication(identity.claims)) {
        return reply(403, "RECENT_AUTHENTICATION_REQUIRED");
      }
      if (Number(request.headers.get("content-length") ?? 0) > 1024) {
        return reply(413, "INVALID_CONFIRMATION");
      }
      const text = await request.text();
      if (text.length > 1024) return reply(413, "INVALID_CONFIRMATION");
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(text);
      } catch {
        return reply(400, "INVALID_CONFIRMATION");
      }
      if (
        !body || Object.keys(body).length !== 1 ||
        body.confirmation !== "DELETE"
      ) return reply(400, "INVALID_CONFIRMATION");
      await deps.request(identity.id);
      return reply(202, "DELETION_PENDING");
    } catch {
      return reply(503, "DELETION_UNAVAILABLE");
    }
  };
}
