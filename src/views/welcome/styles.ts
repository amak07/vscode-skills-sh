import { getStyles } from '../marketplace/styles';

export function getWelcomeStyles(fontUri: string): string {
  return getStyles(fontUri) + `

    /* === Welcome Page === */

    .welcome-page {
      max-width: 720px;
      margin: 0 auto;
      padding: 3rem 2rem 2rem;
    }

    .welcome-hero {
      text-align: center;
      margin-bottom: 2.5rem;
    }

    .welcome-ascii {
      font-family: var(--font-mono);
      font-size: 0.55rem;
      line-height: 1.2;
      color: var(--gray-1000);
      margin: 0 auto 1rem;
      white-space: pre;
      letter-spacing: 0.02em;
    }

    .welcome-tagline {
      font-family: var(--font-sans);
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--gray-1000);
      margin-bottom: 0.75rem;
    }

    .welcome-description {
      font-family: var(--font-sans);
      font-size: 0.875rem;
      line-height: 1.6;
      color: var(--gray-900);
      max-width: 560px;
      margin: 0 auto;
    }

    .welcome-description a {
      color: var(--blue-600);
      text-decoration: none;
    }

    .welcome-description a:hover {
      text-decoration: underline;
    }

    /* Agent Showcase */

    .agent-showcase {
      text-align: center;
      margin-bottom: 2.5rem;
    }

    .agent-showcase-label {
      font-family: var(--font-sans);
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--gray-600);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 1rem;
    }

    .agent-logo-strip {
      display: flex;
      justify-content: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .agent-logo {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-md);
      overflow: hidden;
      transition: transform 0.15s ease;
    }

    .agent-logo:hover {
      transform: scale(1.15);
    }

    .agent-logo svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    /* Feature Cards */

    .welcome-features {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 2.5rem;
    }

    .feature-card {
      background: var(--gray-100);
      border: 1px solid var(--gray-400);
      border-radius: var(--radius);
      padding: 1.25rem;
      text-align: center;
    }

    .feature-icon {
      color: var(--blue-600);
      margin-bottom: 0.75rem;
      display: flex;
      justify-content: center;
    }

    .feature-title {
      font-family: var(--font-sans);
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--gray-1000);
      margin-bottom: 0.5rem;
    }

    .feature-description {
      font-family: var(--font-sans);
      font-size: 0.8125rem;
      line-height: 1.5;
      color: var(--gray-900);
    }

    .feature-description code {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      background: var(--gray-200);
      padding: 0.125rem 0.375rem;
      border-radius: var(--radius-sm);
    }

    /* Quick Actions */

    .quick-actions {
      display: flex;
      justify-content: center;
      gap: 0.75rem;
      margin-bottom: 2.5rem;
      flex-wrap: wrap;
    }

    .welcome-cta {
      font-family: var(--font-sans);
      font-size: 0.8125rem;
      font-weight: 500;
      padding: 0.5rem 1.25rem;
      border-radius: var(--radius);
      border: 1px solid var(--gray-400);
      background: var(--gray-100);
      color: var(--gray-1000);
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .welcome-cta:hover {
      background: var(--gray-200);
      border-color: var(--gray-600);
    }

    .welcome-cta-primary {
      background: var(--blue-600);
      border-color: var(--blue-600);
      color: #fff;
    }

    .welcome-cta-primary:hover {
      opacity: 0.9;
      background: var(--blue-600);
      border-color: var(--blue-600);
    }

    /* Footer */

    .welcome-footer {
      text-align: center;
      font-family: var(--font-sans);
      font-size: 0.75rem;
      color: var(--gray-600);
      padding-top: 1.5rem;
      border-top: 1px solid var(--gray-400);
    }

    .welcome-footer a {
      color: var(--gray-900);
      text-decoration: none;
    }

    .welcome-footer a:hover {
      text-decoration: underline;
    }

    .footer-sep {
      margin: 0 0.5rem;
    }

    /* Responsive: stack feature cards on narrow widths */
    @media (max-width: 560px) {
      .welcome-features {
        grid-template-columns: 1fr;
      }
    }
  `;
}
