# AgentSandbox isolation guarantees

## Scope

This document describes `src/Agents/sandbox` as implemented by `AgentSandbox`, `MockToolRegistry`, and the sandbox types. The name **sandbox** refers to a testing harness for agent planning and execution. It does **not** refer to an operating-system sandbox, a container, a virtual machine, or a security boundary.

## What the sandbox does

`AgentSandbox` creates an in-process test harness containing:

- A new `ToolRegistry` instance for the tools registered for that sandbox.
- A `MockToolRegistry` containing configurable mock responses.
- An `AgentPlanner` and `PlanExecutor` wired to use the sandbox's registry rather than the normal application registry for tool metadata and execution.
- Optional call recording, artificial delays, and a maximum-call limit.

Tools registered through `mockTool`, `mockSuccess`, `mockError`, `mockSequence`, or `registerTool` are therefore test-scoped at the registry level. Registering a mock does not register it in the application's global `toolRegistry`.

By default, calls to a tool without a registered mock fail with an error. `allowUnmocked` changes this behavior to return a synthetic successful passthrough result; it does not make the real production tool execute.

The sandbox can also provide deterministic test controls:

- `recordCalls` records payload, user ID, result, timestamp, and duration.
- `maxToolCalls` limits recorded mock invocations.
- `globalDelayMs` adds a delay before mock resolution.
- Mock behaviors can return success, errors, delays, sequences, or custom handlers.

These are test controls, not security controls.

## What the sandbox does not do

The sandbox provides no process, thread, VM, container, filesystem, network, operating-system, or kernel isolation. All sandbox code executes in the same Node.js process and under the same operating-system identity as the caller.

In particular, it does not:

- Prevent JavaScript code from reading or modifying process memory and globals available to it.
- Restrict filesystem access, environment-variable access, child-process creation, network access, CPU use, memory use, or open handles.
- Prevent a custom tool registered with `registerTool` from performing arbitrary application-side work.
- Prevent a custom mock `fn` handler from performing arbitrary application-side work.
- Protect secrets that are already available to the Node.js process.
- Make production tool implementations safe to run with untrusted code or untrusted payloads.
- Guarantee that a mock cannot mutate objects or other state shared with the test process.
- Provide a security boundary around the planner or the LLM. Planner execution may still use the configured LLM path when the planner cannot resolve an input locally; callers must apply their normal data-handling and provider policies.
- Provide transaction, wallet, database, or external-service isolation by itself.

The `ToolRegistry` instance is isolated as a registry object, not as a runtime. A tool implementation supplied by a caller still has the privileges of the surrounding application process.

## Threat model

The sandbox is intended to mitigate accidental effects during **trusted developer tests**, including:

- Accidentally invoking a production tool while testing planner behavior.
- Mutating the global tool registry during a test.
- Making nondeterministic external calls from a test plan.
- Losing visibility into which tools a plan attempted to call.
- Unbounded mock-call loops within a test, when `maxToolCalls` is configured.

The sandbox is not intended to mitigate a compromised or malicious tool. It must not be used as the containment mechanism for:

- Untrusted third-party tool packages.
- LLM-generated code or executable tool definitions.
- User-supplied code.
- A tool suspected of being compromised.
- Workloads requiring protection from denial of service, data exfiltration, or host compromise.

A compromise of code running inside the sandbox should be treated as a compromise of the hosting Node.js process and its available credentials and services.

## Safe usage guidance

Use the sandbox for mocks and deterministic test doubles only. Prefer the built-in mock methods over registering executable custom tools. Keep sandbox tests away from production credentials and production databases, and do not infer security properties from successful sandbox tests.

If a test must exercise a real implementation, run it in an independently provisioned environment with credentials, network policy, filesystem permissions, resource limits, and process isolation appropriate to that implementation. `AgentSandbox` does not supply those controls.

`allowUnmocked: false` should remain the default when the purpose of a test is to prove that all planned tool calls are explicitly controlled. Setting it to `true` only changes the mock registry's response for unknown tools and should not be described as permission scoping.

## Follow-up security issue

The gap between the name "sandbox" and the actual guarantees should be tracked as a follow-up security issue:

**Title:** Provide a real isolation boundary for untrusted agent tool execution

**Description:** `src/Agents/sandbox` currently provides in-process registry substitution and mock behavior, but no process, container, VM, filesystem, network, or resource isolation. If the platform intends to execute untrusted or third-party tools, design and implement an explicitly isolated runner with least-privilege credentials, denied-by-default network and filesystem access, CPU/memory/time limits, cancellation, and a defined IPC protocol. Until that work is complete, classify `AgentSandbox` as a testing harness rather than a security sandbox and do not use it to contain hostile tool code.
