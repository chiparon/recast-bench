import type { WorkspaceCompileCommand } from "../../../weichai/packages/contracts/src/workspace-translation.ts";
import type { WorkspaceTranslationModelClient } from "../../../weichai/services/adaptation-service/src/workspace-translation-agent.ts";

export interface MethodTask {
  id: string;
  title: string;
  requirement: string;
  modules: {
    name: string;
    path: string;
    language?: string;
    description: string;
    dependsOn?: string[];
  }[];
  readFiles: string[];
  referenceFiles: string[];
  fullHistoryRoot?: "refs/history";
  compileCommand: WorkspaceCompileCommand;
  moduleCompileCommands?: Record<string, WorkspaceCompileCommand>;
  testCommand: WorkspaceCompileCommand;
  moduleTestCommands?: Record<string, WorkspaceCompileCommand>;
}

export interface MethodOptions {
  arm: "rawagent" | "recast" | "sag2sql";
  retrieval?: { maxHops: 1 | 2; expandOnBridgeTerms: boolean };
  task: MethodTask;
  sourceRoot: string;
  runRoot: string;
  client: WorkspaceTranslationModelClient;
  signal?: AbortSignal;
}
