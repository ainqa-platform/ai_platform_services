import { BadGatewayException, Injectable, InternalServerErrorException, OnModuleDestroy } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export interface McpToolResult {
  rows: Record<string, unknown>[];
}

interface McpServerDefinition {
  command: string;
  args: string[];
}

/**
 * Generic MCP client -- connects to any named MCP server over stdio (one
 * per `serverKey`, connection reused across calls). `cerner_sandbox` is the
 * only one wired up today (spawns mcp-servers/cerner-fhir/server.ts's
 * compiled output as a child process); adding another named MCP server
 * later is one entry in SERVER_DEFINITIONS, not a new client
 * implementation -- this class doesn't know or care what a given server's
 * tools do.
 */
@Injectable()
export class McpClientService implements OnModuleDestroy {
  private readonly clients = new Map<string, Promise<Client>>();

  private readonly serverDefinitions: Record<string, McpServerDefinition> = {
    cerner_sandbox: {
      command: process.execPath,
      args: [path.join(__dirname, '../mcp-servers/cerner-fhir/server.js')],
    },
  };

  async listTools(serverKey: string): Promise<McpTool[]> {
    const client = await this.getClient(serverKey);
    const result = await client.listTools();
    return result.tools as McpTool[];
  }

  async callTool(serverKey: string, toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const client = await this.getClient(serverKey);
    const result = await client.callTool({ name: toolName, arguments: args });
    const content = (result.content as Array<{ type: string; text?: string }>) ?? [];
    const textPart = content.find((c) => c.type === 'text');

    // MCP tools report their own failures as a normal result with
    // `isError: true` (a thrown error inside the tool handler, e.g. an
    // upstream API rejecting the request) rather than a transport-level
    // exception -- verified directly: calling search_patients with no
    // filters resolved successfully with isError:true and the FHIR
    // sandbox's real rejection message as the text content, it did NOT
    // throw. Without this check that error text would silently get
    // returned as if it were a data row.
    if (result.isError) {
      throw new BadGatewayException(`MCP tool "${toolName}" on "${serverKey}" failed: ${textPart?.text ?? 'unknown error'}`);
    }

    if (!textPart?.text) {
      return { rows: [] };
    }
    try {
      const parsed = JSON.parse(textPart.text);
      return { rows: Array.isArray(parsed) ? parsed : [parsed] };
    } catch {
      return { rows: [{ result: textPart.text }] };
    }
  }

  private getClient(serverKey: string): Promise<Client> {
    const existing = this.clients.get(serverKey);
    if (existing) return existing;

    const definition = this.serverDefinitions[serverKey];
    if (!definition) {
      throw new InternalServerErrorException(`No MCP server configured for "${serverKey}"`);
    }

    const clientPromise = (async () => {
      const client = new Client({ name: 'ainqa-ai-platform-server', version: '0.1.0' });
      const transport = new StdioClientTransport({ command: definition.command, args: definition.args });
      await client.connect(transport);
      return client;
    })();

    this.clients.set(serverKey, clientPromise);
    return clientPromise;
  }

  async onModuleDestroy(): Promise<void> {
    for (const clientPromise of this.clients.values()) {
      const client = await clientPromise.catch(() => null);
      await client?.close();
    }
  }
}
