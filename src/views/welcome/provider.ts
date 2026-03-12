import * as vscode from 'vscode';
import { getNonce } from '../marketplace/provider';
import { getWelcomeStyles } from './styles';
import { renderWelcomePage } from './templates';

export class WelcomeViewProvider {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private extensionUri: vscode.Uri) {}

  openWelcomePage(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'skills-sh.welcome',
      'Welcome to Skills.sh',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'media'),
        ],
      },
    );

    const fontUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'fonts')
    ).toString();

    panel.webview.html = this.getHtml(panel.webview, fontUri);

    panel.webview.onDidReceiveMessage((message: { command: string; url?: string }) => {
      this.handleMessage(message);
    });

    panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel = panel;
  }

  private getHtml(webview: vscode.Webview, fontUri: string): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <style nonce="${nonce}">${getWelcomeStyles(fontUri)}</style>
</head>
<body>
  ${renderWelcomePage()}

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      document.querySelectorAll('.welcome-cta').forEach(btn => {
        btn.addEventListener('click', () => {
          const command = btn.getAttribute('data-command');
          if (command) { vscode.postMessage({ command }); }
        });
      });
      document.querySelectorAll('.welcome-footer a, .welcome-description a').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          vscode.postMessage({ command: 'openExternal', url: link.getAttribute('href') });
        });
      });
    })();
  </script>
</body>
</html>`;
  }

  private handleMessage(message: { command: string; url?: string }): void {
    switch (message.command) {
      case 'openMarketplace':
        vscode.commands.executeCommand('skills-sh.openMarketplaceTab');
        break;
      case 'openSettings':
        vscode.commands.executeCommand('skills-sh.openSettings');
        break;
      case 'openDocs':
        vscode.commands.executeCommand('skills-sh.openDocs');
        break;
      case 'openExternal':
        if (message.url) {
          vscode.env.openExternal(vscode.Uri.parse(message.url));
        }
        break;
    }
  }
}
