// Adapted from cf-mailroom (Apache-2.0), src/mcp/auth-types.ts.
export const MCP_READ_SCOPE = "inbox.read";
export const MCP_MANAGE_SCOPE = "inbox.manage";
export const MCP_SCOPES = [MCP_READ_SCOPE, MCP_MANAGE_SCOPE] as const;

export interface OAuthGrantProps extends Record<string, unknown> {
  email: string;
  sub: string;
  clientId: string;
  scopes: string[];
}

export interface McpIdentity {
  email: string;
  sub: string;
  clientId: string;
  canManage: boolean;
}
