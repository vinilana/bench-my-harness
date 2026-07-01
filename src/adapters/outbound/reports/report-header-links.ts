const PROJECT_REPOSITORY_URL = "https://github.com/vinilana/bench-my-harness";
const AICODERS_ACADEMY_URL = "https://aicoders.academy";

export function renderHeaderOrigin(): string {
  return `<p class="header-origin">Created by <a href="${AICODERS_ACADEMY_URL}" target="_blank" rel="noopener noreferrer">AI Coders Academy</a></p>`;
}

export function renderHeaderActions(): string {
  return `<nav class="header-actions" aria-label="Project links"><a class="header-cta header-cta--primary" href="${PROJECT_REPOSITORY_URL}" target="_blank" rel="noopener noreferrer">Contribute on GitHub</a><a class="header-cta" href="${AICODERS_ACADEMY_URL}" target="_blank" rel="noopener noreferrer">Visit AI Coders Academy</a></nav>`;
}
