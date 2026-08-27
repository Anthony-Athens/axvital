import "server-only";
import type { NextRequest } from "next/server";
import { createClient } from "../supabase/server";
import { guardWithClient } from "./boundary";
export function withApiGuard(route: string, handler: (request: NextRequest) => Promise<Response>) {
  return guardWithClient(route, handler, createClient);
}
