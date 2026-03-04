# Architecture

> Diagrams use the [Excalidraw](https://excalidraw.com) style. Source files are in this directory — editable with the [VS Code Excalidraw extension](https://marketplace.visualstudio.com/items?itemName=pomdtr.excalidraw-editor).

## System Overview

How the extension connects to external services, the local filesystem, and the terminal.

![System Context](01-system-context.svg)

## Install Flow — Triple-Redundant Detection

The most interesting technical challenge: three independent mechanisms detect when a terminal install completes, because no single approach works reliably across all platforms.

![Install Flow](02-install-flow.svg)

## Multi-Agent Scanning & Deduplication

The scanner reads 11 AI agent skill directories, follows symlinks (a Windows gotcha), and deduplicates skills that appear in multiple agents.

![Multi-Agent Scanning](03-multi-agent-scanning.svg)

## Webview Communication

The extension host (Node.js) and marketplace webview (browser iframe) coordinate through a typed postMessage protocol with 17 command types.

![Webview Communication](04-webview-communication.svg)

## CI/CD Pipeline — Build Once, Publish Everywhere

A single VSIX artifact is built once, then published to two marketplaces in parallel — if one fails, the other still completes.

![CI/CD Pipeline](05-ci-cd-pipeline.svg)
