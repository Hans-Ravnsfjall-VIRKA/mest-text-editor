// Calls the Anthropic Messages API straight from the browser with the user's own key.

import { buildAiRequest, parseAiResponse, type AiInput } from '../model/aiModel';

export async function runAi(apiKey: string, input: AiInput): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(buildAiRequest(input)),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // handled below
  }
  if (!res.ok && (typeof data !== 'object' || data === null || !('error' in data))) {
    throw new Error(`AI request failed (${res.status})`);
  }
  return parseAiResponse(data);
}
